import { NextResponse } from 'next/server';
import { apiError, readJson } from '@/lib/api';
import { requireAdminApi } from '@/lib/admin-api';
import { ORDER_STATUSES, setOrdersStatus, type OrderStatus } from '@/lib/admin-orders';

// { orderIds, status } — age no pedido (empresa + live) de cada linha selecionada.
export async function POST(req: Request) {
  const admin = await requireAdminApi('orders:status');
  if (admin instanceof Response) return admin;
  const b = await readJson(req);
  const ids = Array.isArray(b.orderIds) ? b.orderIds.filter((x): x is string => typeof x === 'string') : [];
  const status = String(b.status ?? '') as OrderStatus;
  if (!ORDER_STATUSES.includes(status)) return apiError('invalid_status', 'Status inválido.');
  const r = await setOrdersStatus(ids, status);
  if (!r.ok) return apiError(r.code, r.message, r.status);
  return NextResponse.json({ changed: r.changed });
}
