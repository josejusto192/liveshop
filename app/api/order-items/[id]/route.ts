import { NextResponse } from 'next/server';
import { apiError, readJson } from '@/lib/api';
import { getCompany } from '@/lib/auth';
import { cancelOrderItem, changeOrderItem } from '@/lib/orders';

type Ctx = { params: Promise<{ id: string }> };

// { qty } altera (0 = excluir). Só com a live no ar.
export async function PATCH(req: Request, { params }: Ctx) {
  const company = await getCompany();
  if (!company) return apiError('unauthorized', 'Entre com o código.', 401);
  const b = await readJson(req);
  const r = await changeOrderItem({ itemId: (await params).id, companyId: company.id, qty: b.qty });
  if (!r.ok) return apiError(r.code, r.message, r.status, r.extra);
  return NextResponse.json({ order: r.order });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const company = await getCompany();
  if (!company) return apiError('unauthorized', 'Entre com o código.', 401);
  const r = await cancelOrderItem({ itemId: (await params).id, companyId: company.id });
  if (!r.ok) return apiError(r.code, r.message, r.status, r.extra);
  return NextResponse.json({ order: r.order });
}
