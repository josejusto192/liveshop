import { requireAdminApi } from '@/lib/admin-api';
import { listOrderLines, parseOrderFilters } from '@/lib/admin-orders';
import { dateTimeCell, describeFilters, exportFileName, brandPdfSections, pdfLogo } from '@/lib/order-exports';
import { renderBrandPdf } from '@/lib/pdf';
import { getSettings } from '@/lib/settings';

export const runtime = 'nodejs';

// PDF para a marca: agrupado por empresa, totais por empresa e total geral (uma seção por marca).
export async function GET(req: Request) {
  const admin = await requireAdminApi('orders:export');
  if (admin instanceof Response) return admin;
  const f = parseOrderFilters(new URL(req.url).searchParams);
  const [lines, desc, settings] = await Promise.all([listOrderLines(f), describeFilters(f), getSettings()]);
  const lives = new Set(lines.map((l) => l.liveName));
  const title = desc.live ?? (lives.size === 1 ? [...lives][0] : `Pedidos de ${lives.size} lives`);
  const pdf = await renderBrandPdf({
    platformName: settings.platformName,
    logo: await pdfLogo(settings.logoUrl),
    title,
    filters: desc.text,
    generatedAt: dateTimeCell(new Date().toISOString()),
    brands: brandPdfSections(lines),
  });
  return new Response(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${exportFileName(desc.live ?? (lives.size === 1 ? [...lives][0] : null), 'pdf')}"` },
  });
}
