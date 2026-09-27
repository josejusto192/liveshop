import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api';
import { requireAdminApi } from '@/lib/admin-api';
import { adminOrderDetail, attachInvoice } from '@/lib/admin-orders';
import { saveUpload } from '@/lib/uploads';

export const runtime = 'nodejs';

const MAX = 10 * 1024 * 1024;

// Upload do PDF da fatura (multipart, campo "file"). Pedido ainda não faturado passa para Faturado.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi('orders:status');
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return apiError('no_file', 'Escolha o PDF da fatura.');
  if (file.size > MAX) return apiError('too_big', 'O PDF pode ter no máximo 10 MB.');
  const data = Buffer.from(await file.arrayBuffer());
  if (data.subarray(0, 5).toString('latin1') !== '%PDF-') return apiError('not_pdf', 'O arquivo precisa ser um PDF.');
  const url = await saveUpload(data, '.pdf');
  const r = await attachInvoice(id, url);
  if (!r.ok) return apiError(r.code, r.message, r.status);
  return NextResponse.json({ order: await adminOrderDetail(id) });
}
