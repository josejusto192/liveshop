import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api';
import { getCompany } from '@/lib/auth';
import { liveIdBySlug } from '@/lib/buyer-live';
import { getMyOrder } from '@/lib/orders';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const company = await getCompany();
  if (!company) return apiError('unauthorized', 'Entre com o código.', 401);
  const l = await liveIdBySlug((await params).slug);
  if (!l) return apiError('not_found', 'Live não encontrada.', 404);
  return NextResponse.json({ order: await getMyOrder(l.id, company.id) });
}
