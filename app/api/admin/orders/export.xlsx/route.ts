import { requireAdminApi } from '@/lib/admin-api';
import { listOrderLines, parseOrderFilters } from '@/lib/admin-orders';
import { describeFilters, exportFileName, ordersXlsx } from '@/lib/order-exports';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const admin = await requireAdminApi('orders:export');
  if (admin instanceof Response) return admin;
  const f = parseOrderFilters(new URL(req.url).searchParams);
  const [lines, desc] = await Promise.all([listOrderLines(f), describeFilters(f)]);
  const buf = await ordersXlsx(lines);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${exportFileName(desc.live, 'xlsx')}"`,
    },
  });
}
