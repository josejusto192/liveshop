import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api';
import { getCompany } from '@/lib/auth';
import { accountOrders } from '@/lib/buyer-orders';

// Detalhe com linha do tempo.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const company = await getCompany();
  if (!company) return apiError('unauthorized', 'Entre com o código.', 401);
  const { id } = await params;
  const order = (await accountOrders(company.id)).find((o) => o.id === id);
  if (!order) return apiError('not_found', 'Pedido não encontrado.', 404);
  return NextResponse.json({ order });
}
