import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-api';
import { lineKpis, linesPerMinute, listOrderLines, parseOrderFilters, tabCounts } from '@/lib/admin-orders';

// ?status&liveId&productId&brandId&companyId&minFrom&minTo&q&from&to
export async function GET(req: Request) {
  const admin = await requireAdminApi('orders:read');
  if (admin instanceof Response) return admin;
  const f = parseOrderFilters(new URL(req.url).searchParams);
  const [lines, counts, perMinute, kpis] = await Promise.all([listOrderLines(f), tabCounts(f), linesPerMinute(f), lineKpis(f)]);
  return NextResponse.json({ lines, counts, perMinute, kpis });
}
