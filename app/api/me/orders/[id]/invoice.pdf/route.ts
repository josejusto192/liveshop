import { and, eq } from 'drizzle-orm';
import { apiError } from '@/lib/api';
import { getCompany } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { invoiceResponse } from '@/lib/invoices';

export const runtime = 'nodejs';

// Fatura do pedido: 403 enquanto não estiver faturado com o PDF anexado.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const company = await getCompany();
  if (!company) return apiError('unauthorized', 'Entre com o código.', 401);
  const [o] = await db
    .select({ code: schema.orders.code, status: schema.orders.status, invoiceUrl: schema.orders.invoiceUrl })
    .from(schema.orders)
    .where(and(eq(schema.orders.id, (await params).id), eq(schema.orders.companyId, company.id)))
    .catch(() => []);
  if (!o) return apiError('not_found', 'Pedido não encontrado.', 404);
  if (o.status !== 'invoiced' && o.status !== 'delivered') return apiError('no_invoice', 'Fatura ainda não emitida.', 403);
  return invoiceResponse(o.code, o.invoiceUrl, 'attachment');
}
