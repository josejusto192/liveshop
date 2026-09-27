import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api';
import { requireAdminApi } from '@/lib/admin-api';
import { adminOrderDetail } from '@/lib/admin-orders';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi('orders:read');
  if (admin instanceof Response) return admin;
  const d = await adminOrderDetail((await params).id);
  if (!d) return apiError('not_found', 'Pedido não encontrado.', 404);
  return NextResponse.json({ order: d });
}
