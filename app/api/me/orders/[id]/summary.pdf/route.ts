import { apiError } from '@/lib/api';
import { getCompany } from '@/lib/auth';
import { dateTimeBR, ORDER_STATUS_LABEL, orderForCompany } from '@/lib/buyer-orders';
import { renderSummaryPdf } from '@/lib/pdf';
import { getSettings } from '@/lib/settings';

export const runtime = 'nodejs';

// Resumo do pedido em PDF (só o dono do pedido).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const company = await getCompany();
  if (!company) return apiError('unauthorized', 'Entre com o código.', 401);
  const o = await orderForCompany((await params).id, company.id);
  if (!o) return apiError('not_found', 'Pedido não encontrado.', 404);
  const settings = await getSettings();
  const pdf = await renderSummaryPdf({
    platformName: settings.platformName,
    liveName: o.liveName,
    brandName: o.brandName,
    liveDate: dateTimeBR(o.liveStartedAt ?? o.liveStartsAt),
    companyName: company.name,
    orderCode: o.order.code,
    statusLabel: ORDER_STATUS_LABEL[o.order.status],
    items: o.lines.map((l) => ({ name: l.name, sku: l.sku, qty: l.qty, unitPriceCents: l.unitPriceCents })),
  });
  const file = `resumo-${o.order.code.replace('#', '')}.pdf`;
  return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${file}"` } });
}
