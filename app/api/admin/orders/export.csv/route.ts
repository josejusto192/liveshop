import { requireAdminApi } from '@/lib/admin-api';
import { listOrderLines, parseOrderFilters } from '@/lib/admin-orders';
import { describeFilters, exportFileName, ordersCsv } from '@/lib/order-exports';

// Mesmos filtros da tela (e `ids` para "Baixar selecionados").
export async function GET(req: Request) {
  const admin = await requireAdminApi('orders:export');
  if (admin instanceof Response) return admin;
  const f = parseOrderFilters(new URL(req.url).searchParams);
  const [lines, desc] = await Promise.all([listOrderLines(f), describeFilters(f)]);
  return new Response(ordersCsv(lines), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${exportFileName(desc.live, 'csv')}"` },
  });
}
