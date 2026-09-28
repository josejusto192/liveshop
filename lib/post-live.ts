// Avisos por e-mail depois da live: resumo para cada empresa, mudança de status do pedido e PDF para a marca.
import { eq, inArray } from 'drizzle-orm';
import { db, schema } from './db';
import { dateTimeBR, orderLines, type BuyerOrderLine } from './buyer-orders';
import { appUrl, mailHtml, senderFrom, sendMail } from './mail';
import { formatBRL, formatInt } from './money';
import { renderSummaryPdf } from './pdf';
import { getSettings } from './settings';
import { readUpload } from './uploads';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// simplificação: envio um a um com pausa (limite padrão do Resend é 2 por segundo), trocar por uma fila quando passar de ~1.000 e-mails por live
const pause = () => (process.env.RESEND_API_KEY && process.env.NODE_ENV !== 'test' ? sleep(550) : Promise.resolve());

function linesText(lines: BuyerOrderLine[]) {
  return lines.map((l) => `- ${l.name}: ${formatInt(l.qty)} un. × ${formatBRL(l.unitPriceCents)} = ${formatBRL(l.subtotalCents)}`).join('\n');
}

async function ordersOf(where: ReturnType<typeof eq> | ReturnType<typeof inArray>) {
  return db
    .select({ order: schema.orders, company: schema.companies, live: schema.lives, brandName: schema.brands.name })
    .from(schema.orders)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.orders.companyId))
    .innerJoin(schema.lives, eq(schema.lives.id, schema.orders.liveId))
    .innerJoin(schema.brands, eq(schema.brands.id, schema.lives.brandId))
    .where(where);
}

/** Resumo pós-live (com o PDF do resumo) para cada empresa que pediu e aceita receber por e-mail. */
export async function afterLiveEnded(liveId: string) {
  const settings = await getSettings();
  const from = senderFrom(settings);
  const rows = await ordersOf(eq(schema.orders.liveId, liveId));
  let sent = 0;
  for (const r of rows) {
    if (!r.company.notifyEmail || r.order.status === 'canceled') continue;
    const lines = await orderLines(r.order.id);
    if (!lines.length) continue;
    const units = lines.reduce((a, l) => a + l.qty, 0);
    const total = lines.reduce((a, l) => a + l.subtotalCents, 0);
    const link = appUrl(`/conta?pedido=${r.order.id}`);
    const pdf = await renderSummaryPdf({
      platformName: settings.platformName,
      liveName: r.live.name,
      brandName: r.brandName,
      liveDate: dateTimeBR(r.live.startedAt ?? r.live.startsAt),
      companyName: r.company.name,
      orderCode: r.order.code,
      statusLabel: 'Registrado',
      items: lines.map((l) => ({ name: l.name, sku: l.sku, qty: l.qty, unitPriceCents: l.unitPriceCents })),
    });
    const after = `Valores de atacado sem frete e impostos. A fatura chega por e-mail ${settings.invoiceDeadline}, com frete e impostos. Pagamento e entrega são combinados com a marca.`;
    try {
      await sendMail({
        to: r.company.email,
        from,
        subject: `Resumo dos seus pedidos · ${r.live.name}`,
        text: `Olá, ${r.company.name}!\n\nA live ${r.live.name} da ${r.brandName} terminou. Estes são os pedidos da sua empresa (pedido ${r.order.code}):\n\n${linesText(lines)}\n\nTotal estimado: ${formatBRL(total)} (${formatInt(units)} un.)\n\n${after}\n\nAcompanhe o pedido: ${link}\n`,
        html: mailHtml({
          title: 'A live terminou. Obrigado por participar.',
          paragraphs: [`Estes são os pedidos da ${r.company.name} na live ${r.live.name} da ${r.brandName} (pedido ${r.order.code}).`],
          table: {
            head: ['Produto', 'Quantidade', 'Subtotal'],
            rows: lines.map((l) => [l.name, `${formatInt(l.qty)} × ${formatBRL(l.unitPriceCents)}`, formatBRL(l.subtotalCents)]),
            foot: ['Total estimado', `${formatInt(units)} un.`, formatBRL(total)],
          },
          button: { label: 'Acompanhar meus pedidos', href: link },
          footer: after,
        }),
        attachments: [{ filename: `resumo-${r.order.code.replace('#', '')}.pdf`, content: pdf }],
      });
      sent++;
    } catch (e) {
      console.error('[pós-live] resumo não enviado para', r.company.email, e);
    }
    await pause();
  }
  return sent;
}

const STATUS_MAIL: Record<string, ((o: { code: string; live: string; brand: string }) => { subject: string; lead: string }) | undefined> = {
  invoicing: (o) => ({ subject: `Seu pedido ${o.code} foi enviado à marca`, lead: `O pedido ${o.code} da live ${o.live} foi enviado para a ${o.brand} e está em faturamento.` }),
  invoiced: (o) => ({ subject: `Fatura do pedido ${o.code} emitida`, lead: `A fatura do pedido ${o.code} da live ${o.live} foi emitida.` }),
  delivered: (o) => ({ subject: `Pedido ${o.code} entregue`, lead: `O pedido ${o.code} da live ${o.live} foi marcado como entregue.` }),
  canceled: (o) => ({ subject: `Pedido ${o.code} cancelado`, lead: `O pedido ${o.code} da live ${o.live} foi cancelado. Se tiver dúvidas, fale com o suporte.` }),
};

/** E-mail para o comprador a cada mudança de status (voltar para rascunho não avisa). */
export async function notifyOrderStatus(orderIds: string[], status: string) {
  const build = STATUS_MAIL[status];
  if (!build || !orderIds.length) return 0;
  const settings = await getSettings();
  const from = senderFrom(settings);
  const rows = await ordersOf(inArray(schema.orders.id, orderIds));
  let sent = 0;
  for (const r of rows) {
    if (!r.company.notifyEmail) continue;
    const m = build({ code: r.order.code, live: r.live.name, brand: r.brandName });
    const link = appUrl(`/conta?pedido=${r.order.id}`);
    const invoiceName = status === 'invoiced' ? r.order.invoiceUrl?.match(/([0-9a-f-]{36}\.pdf)$/)?.[1] : undefined;
    const invoice = invoiceName ? await readUpload(invoiceName) : null;
    const extra = status === 'invoiced' ? (invoice ? 'A fatura está anexada e também pode ser baixada em Minha conta.' : 'A fatura segue por e-mail em seguida.') : '';
    try {
      await sendMail({
        to: r.company.email,
        from,
        subject: m.subject,
        text: `Olá, ${r.company.name}!\n\n${m.lead}${extra ? `\n${extra}` : ''}\n\nAcompanhe o pedido: ${link}\n`,
        html: mailHtml({ title: m.subject, paragraphs: [`Olá, ${r.company.name}!`, m.lead, ...(extra ? [extra] : [])], button: { label: 'Ver o pedido', href: link } }),
        attachments: invoice ? [{ filename: `fatura-${r.order.code.replace('#', '')}.pdf`, content: invoice }] : undefined,
      });
      sent++;
    } catch (e) {
      console.error('[pedidos] aviso de status não enviado para', r.company.email, e);
    }
    await pause();
  }
  return sent;
}

/** Envia o PDF para a marca (um e-mail por marca, para o e-mail de pedidos dela). */
export async function mailBrandPdf(o: { brandEmail: string; brandName: string; title: string; companies: number; units: number; cents: number; pdf: Buffer; fileName: string }) {
  const settings = await getSettings();
  const lead = `Seguem os pedidos de ${formatInt(o.companies)} ${o.companies === 1 ? 'empresa' : 'empresas'} (${o.title}): ${formatInt(o.units)} un., ${formatBRL(o.cents)} em valores de atacado, sem frete e impostos.`;
  await sendMail({
    to: o.brandEmail,
    from: senderFrom(settings),
    subject: `Pedidos para ${o.brandName} · ${o.title}`,
    text: `Olá!\n\n${lead}\n\nO PDF em anexo traz os pedidos agrupados por empresa, com os contatos para faturamento.\n\n${settings.platformName}`,
    html: mailHtml({ title: `Pedidos para ${o.brandName}`, paragraphs: [lead, 'O PDF em anexo traz os pedidos agrupados por empresa, com os contatos para faturamento.'], footer: settings.platformName }),
    attachments: [{ filename: o.fileName, content: o.pdf }],
  });
}
