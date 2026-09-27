import { NextResponse } from 'next/server';
import { apiError, readJson } from '@/lib/api';
import { requireAdminApi } from '@/lib/admin-api';
import { appendItem, replaceLineup, type LineupInput } from '@/lib/live-control';

type Ctx = { params: Promise<{ id: string }> };

// Roteiro completo, na ordem: [{ productId, durationS }]
export async function PUT(req: Request, { params }: Ctx) {
  const admin = await requireAdminApi('lives:write');
  if (admin instanceof Response) return admin;
  const b = await readJson(req);
  const r = await replaceLineup((await params).id, (Array.isArray(b.items) ? b.items : b) as LineupInput);
  if (!r.ok) return apiError(r.code, r.message, r.status);
  return NextResponse.json({ ok: true });
}

// Acrescenta um produto ao fim do roteiro (vale com a live no ar): { productId, durationS? }
export async function POST(req: Request, { params }: Ctx) {
  const admin = await requireAdminApi('lives:write');
  if (admin instanceof Response) return admin;
  const b = await readJson(req);
  if (typeof b.productId !== 'string') return apiError('invalid', 'Escolha o produto.');
  const r = await appendItem((await params).id, b.productId, b.durationS === undefined ? 900 : Number(b.durationS));
  if (!r.ok) return apiError(r.code, r.message, r.status);
  return NextResponse.json({ ok: true }, { status: 201 });
}
