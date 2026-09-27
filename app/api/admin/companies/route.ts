import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-api';
import { companyKpis, listCompanies, parseCompanyFilters } from '@/lib/admin-companies';

// ?seg=all|buyers|watchers&q=
export async function GET(req: Request) {
  const admin = await requireAdminApi('companies:read');
  if (admin instanceof Response) return admin;
  const f = parseCompanyFilters(new URL(req.url).searchParams);
  const [companies, kpis] = await Promise.all([listCompanies(f), companyKpis()]);
  return NextResponse.json({ companies, kpis });
}
