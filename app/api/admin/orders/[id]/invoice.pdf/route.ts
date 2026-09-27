import { eq } from 'drizzle-orm';
import { apiError } from '@/lib/api';
import { requireAdminApi } from '@/lib/admin-api';
import { db, schema } from '@/lib/db';
import { invoiceResponse } from '@/lib/invoices';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi('orders:read');
  if (admin instanceof Response) return admin;
  const [o] = await db.select({ code: schema.orders.code, invoiceUrl: schema.orders.invoiceUrl }).from(schema.orders).where(eq(schema.orders.id, (await params).id));
  if (!o) return apiError('not_found', 'Pedido não encontrado.', 404);
  return invoiceResponse(o.code, o.invoiceUrl, 'inline');
}
