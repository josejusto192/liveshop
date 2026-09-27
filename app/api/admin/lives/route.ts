import { NextResponse } from 'next/server';
import { apiError, readJson } from '@/lib/api';
import { requireAdminApi } from '@/lib/admin-api';
import { createLive, listLives, parseLiveInput, type LiveInput } from '@/lib/lives-admin';
import type { LineupInput } from '@/lib/live-control';

export async function GET(req: Request) {
  const admin = await requireAdminApi('dashboard:read');
  if (admin instanceof Response) return admin;
  const q = new URL(req.url).searchParams.get('q') ?? undefined;
  return NextResponse.json({ lives: await listLives({ q }) });
}

// { name, brandId, date, time, format, mode, videoDelayS, showTimer, showActivity, items: [{ productId, durationS }], status }
export async function POST(req: Request) {
  const admin = await requireAdminApi('lives:write');
  if (admin instanceof Response) return admin;
  const b = await readJson(req);
  const parsed = parseLiveInput(b);
  if (!parsed.ok) return apiError('invalid', 'Confira os campos destacados.', 400, { fields: parsed.errors });
  const status = b.status === 'scheduled' ? 'scheduled' : 'draft';
  const r = await createLive(parsed.value as LiveInput, (Array.isArray(b.items) ? b.items : []) as LineupInput, status);
  if (!r.ok) return apiError('invalid', Object.values(r.errors)[0], 400, { fields: r.errors });
  return NextResponse.json({ live: { id: r.live.id, slug: r.live.slug, status: r.live.status } }, { status: 201 });
}
