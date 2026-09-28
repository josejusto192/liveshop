import { NextResponse } from 'next/server';
import { inArray, sql } from 'drizzle-orm';
import { apiError } from '@/lib/api';
import { requireAdminApi } from '@/lib/admin-api';
import { db, schema } from '@/lib/db';
import { listOrderLines, parseOrderFilters } from '@/lib/admin-orders';
import { brandPdfSections, dateTimeCell, describeFilters, exportFileName, pdfLogo } from '@/lib/order-exports';
import { renderBrandPdf } from '@/lib/pdf';
import { mailBrandPdf } from '@/lib/post-live';
import { getSettings } from '@/lib/settings';

export const runtime = 'nodejs';

// Envia o PDF para a marca por e-mail (mesmos filtros da tela). Os pedidos enviados ganham a data de "Enviado à marca".
export async function POST(req: Request) {
  const admin = await requireAdminApi('orders:export');
  if (admin instanceof Response) return admin;
  const f = parseOrderFilters(new URL(req.url).searchParams);
  const [lines, desc, settings] = await Promise.all([listOrderLines(f), describeFilters(f), getSettings()]);
  if (!lines.length) return apiError('empty', 'Nenhum pedido no filtro para enviar.');
  const brandIds = [...new Set(lines.map((l) => l.brandId))];
  const brands = await db.select({ id: schema.brands.id, name: schema.brands.name, email: schema.brands.ordersEmail }).from(schema.brands).where(inArray(schema.brands.id, brandIds));
  const logo = await pdfLogo(settings.logoUrl);
  const sent: { brand: string; email: string }[] = [];
  const missing: string[] = [];
  for (const b of brands) {
    const mine = lines.filter((l) => l.brandId === b.id);
    if (!b.email) {
      missing.push(b.name);
      continue;
    }
    const lives = new Set(mine.map((l) => l.liveName));
    const title = desc.live ?? (lives.size === 1 ? [...lives][0] : `Pedidos de ${lives.size} lives`);
    const pdf = await renderBrandPdf({ platformName: settings.platformName, logo, title, filters: desc.text, generatedAt: dateTimeCell(new Date().toISOString()), brands: brandPdfSections(mine) });
    await mailBrandPdf({
      brandEmail: b.email,
      brandName: b.name,
      title,
      companies: new Set(mine.map((l) => l.companyId)).size,
      units: mine.reduce((a, l) => a + l.qty, 0),
      cents: mine.reduce((a, l) => a + l.subtotalCents, 0),
      pdf,
      fileName: exportFileName(title, 'pdf'),
    });
    const orderIds = [...new Set(mine.map((l) => l.orderId))];
    await db.execute(sql`update orders set sent_to_brand_at = coalesce(sent_to_brand_at, now()), updated_at = now()
      where id in (${sql.join(orderIds.map((id) => sql`${id}::uuid`), sql`, `)})`);
    sent.push({ brand: b.name, email: b.email });
  }
  if (!sent.length) return apiError('no_email', `Cadastre o e-mail de pedidos da marca ${missing.join(', ')} em Marcas.`);
  return NextResponse.json({ sent, missing });
}
