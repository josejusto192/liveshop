import { requireAdminPage } from '@/lib/auth';
import { companyDetail, companyKpis, listCompanies, parseCompanyFilters } from '@/lib/admin-companies';
import { can } from '@/lib/permissions';
import { EmpresasView } from './EmpresasView';

export default async function Empresas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdminPage('companies:read');
  const raw = await searchParams;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') sp.set(k, v);
  const f = parseCompanyFilters(sp);
  const [rows, kpis] = await Promise.all([listCompanies(f), companyKpis()]);
  const selId = rows.find((r) => r.id === sp.get('empresa'))?.id ?? rows[0]?.id ?? null;
  const detail = selId ? await companyDetail(selId) : null;
  return <EmpresasView filters={f} rows={rows} kpis={kpis} initial={detail} canOrders={can(admin.role, 'orders:read')} />;
}
