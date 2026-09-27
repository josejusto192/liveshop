import { NextResponse } from 'next/server';
import { apiError, readJson } from '@/lib/api';
import { getCompany } from '@/lib/auth';
import { liveIdBySlug } from '@/lib/buyer-live';
import { registerOrder } from '@/lib/orders';

// { liveItemId, qty } registra (soma se já existe).
// Erros: not_on_air, below_min, not_multiple, over_stock (com available), live_not_running
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const company = await getCompany();
  if (!company) return apiError('unauthorized', 'Entre com o código para pedir.', 401);
  const l = await liveIdBySlug((await params).slug);
  if (!l) return apiError('not_found', 'Live não encontrada.', 404);
  const b = await readJson(req);
  if (typeof b.liveItemId !== 'string') return apiError('invalid', 'Produto inválido.');
  const r = await registerOrder({ liveId: l.id, companyId: company.id, liveItemId: b.liveItemId, qty: b.qty });
  if (!r.ok) return apiError(r.code, r.message, r.status, r.extra);
  return NextResponse.json({ order: r.order, itemId: r.itemId }, { status: 201 });
}
