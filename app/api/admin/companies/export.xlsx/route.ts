import { requireAdminApi } from '@/lib/admin-api';
import { companiesXlsx, parseCompanyFilters } from '@/lib/admin-companies';
import { exportFileName } from '@/lib/order-exports';

export const runtime = 'nodejs';

// Lista de empresas com os mesmos filtros da tela.
export async function GET(req: Request) {
  const admin = await requireAdminApi('companies:read');
  if (admin instanceof Response) return admin;
  const buf = await companiesXlsx(parseCompanyFilters(new URL(req.url).searchParams));
  const name = exportFileName('empresas', 'xlsx').replace(/^pedidos-/, '');
  return new Response(new Uint8Array(buf), {
    headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${name}"` },
  });
}
