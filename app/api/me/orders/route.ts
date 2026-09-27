import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api';
import { getCompany } from '@/lib/auth';
import { accountOrders } from '@/lib/buyer-orders';

// Histórico de pedidos da empresa (Minha conta).
export async function GET() {
  const company = await getCompany();
  if (!company) return apiError('unauthorized', 'Entre com o código.', 401);
  return NextResponse.json({ orders: await accountOrders(company.id) });
}
