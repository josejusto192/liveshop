import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api';
import { requireAdminApi } from '@/lib/admin-api';
import { companyDetail } from '@/lib/admin-companies';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi('companies:read');
  if (admin instanceof Response) return admin;
  const d = await companyDetail((await params).id);
  if (!d) return apiError('not_found', 'Empresa não encontrada.', 404);
  return NextResponse.json({ company: d });
}
