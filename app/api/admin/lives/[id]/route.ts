import { NextResponse } from 'next/server';
import { apiError, readJson } from '@/lib/api';
import { requireAdminApi } from '@/lib/admin-api';
import { liveForEdit, parseLiveInput, updateLive } from '@/lib/lives-admin';
import type { LineupInput } from '@/lib/live-control';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const admin = await requireAdminApi('lives:write');
  if (admin instanceof Response) return admin;
  const data = await liveForEdit((await params).id);
  if (!data) return apiError('not_found', 'Live não encontrada.', 404);
  const { streamKey: _hidden, ...live } = data.live;
  void _hidden;
  return NextResponse.json({ live, items: data.items });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const admin = await requireAdminApi('lives:write');
  if (admin instanceof Response) return admin;
  const b = await readJson(req);
  const parsed = parseLiveInput(b, true);
  if (!parsed.ok) return apiError('invalid', 'Confira os campos destacados.', 400, { fields: parsed.errors });
  const status = b.status === 'scheduled' ? 'scheduled' : b.status === 'draft' ? 'draft' : undefined;
  const lineup = Array.isArray(b.items) ? (b.items as LineupInput) : undefined;
  const r = await updateLive((await params).id, parsed.value, lineup, status);
  if (!r.ok) return apiError('invalid', Object.values(r.errors)[0], r.status, { fields: r.errors });
  return NextResponse.json({ live: { id: r.live.id, slug: r.live.slug, status: r.live.status } });
}
