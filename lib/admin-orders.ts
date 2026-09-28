// Pedidos no admin (AdminPedidos): filtros, contagens por aba, mudança de status e fatura.
// Cada linha da tela é um item de pedido (empresa + produto); o status é do pedido (empresa + live).
import { sql, type SQL } from 'drizzle-orm';
import { db } from './db';
import { TZ } from './dates';
import { publish } from './events';
import { notifyOrderStatus } from './post-live';
import { ORDER_STATUSES, TAB_STATUSES, type OrderFilters, type OrderStatus, type OrderTab } from './orders-shared';

export * from './orders-shared';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function uuidOrNull(v: string | null | undefined) {
  return v && UUID.test(v) ? v : null;
}
function minuteOrNull(v: string | null | undefined) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 24 * 60 ? n : null;
}

/** Lê os filtros da URL (a mesma query serve para a tela, a lista e as exportações). */
export function parseOrderFilters(sp: URLSearchParams): OrderFilters {
  const tabRaw = sp.get('status') ?? sp.get('tab') ?? 'draft';
  const tab: OrderTab = tabRaw === 'invoiced' || tabRaw === 'canceled' ? tabRaw : 'draft';
  let minFrom = minuteOrNull(sp.get('minFrom'));
  let minTo = minuteOrNull(sp.get('minTo'));
  if (minFrom !== null && minTo !== null && minFrom > minTo) [minFrom, minTo] = [minTo, minFrom];
  const ids = (sp.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => UUID.test(s));
  return {
    tab,
    liveId: uuidOrNull(sp.get('liveId')),
    productId: uuidOrNull(sp.get('productId')),
    brandId: uuidOrNull(sp.get('brandId')),
    companyId: uuidOrNull(sp.get('companyId')),
    minFrom,
    minTo,
    q: (sp.get('q') ?? '').trim().slice(0, 100),
    from: DATE.test(sp.get('from') ?? '') ? sp.get('from') : null,
    to: DATE.test(sp.get('to') ?? '') ? sp.get('to') : null,
    ids: ids.length ? ids.slice(0, 5000) : null,
  };
}

type Parts = { status?: boolean; minutes?: boolean };

/** Condições SQL dos filtros. `skip` deixa de fora o status (contagem das abas) ou o minuto (gráfico). */
function where(f: OrderFilters, skip: Parts = {}): SQL {
  const c: SQL[] = [sql`oi.canceled_at is null`];
  if (!skip.status) c.push(sql`o.status in (${sql.join(TAB_STATUSES[f.tab].map((s) => sql`${s}::order_status`), sql`, `)})`);
  if (f.liveId) c.push(sql`o.live_id = ${f.liveId}`);
  if (f.productId) c.push(sql`oi.product_id = ${f.productId}`);
  if (f.brandId) c.push(sql`l.brand_id = ${f.brandId}`);
  if (f.companyId) c.push(sql`o.company_id = ${f.companyId}`);
  if (!skip.minutes) {
    if (f.minFrom !== null) c.push(sql`oi.live_offset_s >= ${f.minFrom * 60}`);
    if (f.minTo !== null) c.push(sql`oi.live_offset_s < ${(f.minTo + 1) * 60}`);
  }
  if (f.q) {
    const like = `%${f.q.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const digits = f.q.replace(/\D/g, '');
    const byPhone = digits.length >= 4 ? sql` or regexp_replace(c.whatsapp, '\\D', '', 'g') like ${`%${digits}%`}` : sql``;
    c.push(sql`(lower(c.name) like ${like} or c.email like ${like}${byPhone})`);
  }
  if (f.from) c.push(sql`(oi.created_at at time zone ${TZ})::date >= ${f.from}::date`);
  if (f.to) c.push(sql`(oi.created_at at time zone ${TZ})::date <= ${f.to}::date`);
  if (f.ids) c.push(sql`oi.id in (${sql.join(f.ids.map((id) => sql`${id}::uuid`), sql`, `)})`);
  return sql.join(c, sql` and `);
}

const FROM = sql`
  from order_items oi
  join orders o on o.id = oi.order_id
  join lives l on l.id = o.live_id
  join brands b on b.id = l.brand_id
  join companies c on c.id = o.company_id
  join products p on p.id = oi.product_id`;

export type AdminOrderLine = {
  itemId: string;
  orderId: string;
  code: string;
  status: OrderStatus;
  hasInvoice: boolean;
  liveId: string;
  liveName: string;
  liveStatus: string;
  liveAt: string;
  brandId: string;
  brandName: string;
  companyId: string;
  company: string;
  cnpj: string | null;
  email: string;
  whatsapp: string;
  productId: string;
  product: string;
  sku: string;
  qty: number;
  unitPriceCents: number;
  subtotalCents: number;
  offsetS: number;
  createdAt: string;
};

export async function listOrderLines(f: OrderFilters, limit = 20000): Promise<AdminOrderLine[]> {
  const rows = await db.execute<{
    item_id: string; order_id: string; code: string; status: OrderStatus; invoice_url: string | null;
    live_id: string; live_name: string; live_status: string; live_at: string; brand_id: string; brand_name: string;
    company_id: string; company: string; cnpj: string | null; email: string; whatsapp: string;
    product_id: string; product: string; sku: string; qty: number; unit_price_cents: number; offset_s: number; created_at: string;
  }>(sql`
    select oi.id as item_id, o.id as order_id, o.code, o.status, o.invoice_url,
      l.id as live_id, l.name as live_name, l.status as live_status, coalesce(l.started_at, l.starts_at) as live_at,
      b.id as brand_id, b.name as brand_name,
      c.id as company_id, c.name as company, c.cnpj, c.email, c.whatsapp,
      p.id as product_id, p.name as product, p.sku, oi.qty, oi.unit_price_cents, oi.live_offset_s as offset_s, oi.created_at
    ${FROM}
    where ${where(f)}
    order by coalesce(l.started_at, l.starts_at) desc, oi.live_offset_s desc, oi.created_at desc
    limit ${limit}`);
  return rows.map((r) => ({
    itemId: r.item_id,
    orderId: r.order_id,
    code: r.code,
    status: r.status,
    hasInvoice: !!r.invoice_url,
    liveId: r.live_id,
    liveName: r.live_name,
    liveStatus: r.live_status,
    liveAt: new Date(r.live_at).toISOString(),
    brandId: r.brand_id,
    brandName: r.brand_name,
    companyId: r.company_id,
    company: r.company,
    cnpj: r.cnpj,
    email: r.email,
    whatsapp: r.whatsapp,
    productId: r.product_id,
    product: r.product,
    sku: r.sku,
    qty: r.qty,
    unitPriceCents: r.unit_price_cents,
    subtotalCents: r.qty * r.unit_price_cents,
    offsetS: r.offset_s,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/** KPIs do filtro: linhas (pedidos), unidades e empresas. */
export async function lineKpis(f: OrderFilters) {
  const [r] = await db.execute<{ orders: number; units: number; companies: number; cents: number }>(sql`
    select count(*)::int as orders, coalesce(sum(oi.qty), 0)::int as units, count(distinct o.company_id)::int as companies,
      coalesce(sum(oi.qty::bigint * oi.unit_price_cents), 0)::bigint as cents
    ${FROM} where ${where(f)}`);
  return { orders: r?.orders ?? 0, units: r?.units ?? 0, companies: r?.companies ?? 0, cents: Number(r?.cents ?? 0) };
}

/** Linhas por aba com os filtros atuais (menos o status). */
export async function tabCounts(f: OrderFilters): Promise<Record<OrderTab, number>> {
  const rows = await db.execute<{ status: OrderStatus; n: number }>(sql`
    select o.status, count(*)::int as n ${FROM} where ${where(f, { status: true })} group by o.status`);
  const out: Record<OrderTab, number> = { draft: 0, invoiced: 0, canceled: 0 };
  for (const r of rows) {
    const tab = (Object.keys(TAB_STATUSES) as OrderTab[]).find((t) => TAB_STATUSES[t].includes(r.status));
    if (tab) out[tab] += r.n;
  }
  return out;
}

/** Linhas por minuto da live (sem o filtro de minuto, para mostrar a live inteira). */
export async function linesPerMinute(f: OrderFilters): Promise<number[]> {
  const rows = await db.execute<{ m: number; n: number }>(sql`
    select (oi.live_offset_s / 60)::int as m, count(*)::int as n ${FROM}
    where ${where(f, { minutes: true })} group by 1 order by 1`);
  if (!rows.length) return [];
  const last = Math.min(rows[rows.length - 1].m, 24 * 60);
  const out = new Array(last + 1).fill(0);
  for (const r of rows) if (r.m <= last) out[r.m] = r.n;
  return out;
}

// ---------- Mudança de status ----------

export type StatusResult = { ok: true; changed: number } | { ok: false; code: string; message: string; status: number };

/**
 * Muda o status dos pedidos (empresa + live). Só depois que a live terminou, para não disputar com
 * as alterações do comprador durante a live. Cada mudança grava a data usada na linha do tempo.
 */
export async function setOrdersStatus(orderIds: string[], status: OrderStatus, now = new Date()): Promise<StatusResult> {
  const ids = [...new Set(orderIds.filter((id) => UUID.test(id)))];
  if (!ids.length) return { ok: false, code: 'empty', message: 'Selecione ao menos um pedido.', status: 400 };
  if (!ORDER_STATUSES.includes(status)) return { ok: false, code: 'invalid_status', message: 'Status inválido.', status: 400 };
  const idList = sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);

  const res = await db.transaction(async (tx) => {
    const rows = await tx.execute<{ id: string; status: OrderStatus; live_status: string }>(sql`
      select o.id, o.status, l.status as live_status from orders o join lives l on l.id = o.live_id
      where o.id in (${idList}) for update of o`);
    if (rows.length !== ids.length) return { ok: false as const, code: 'not_found', message: 'Pedido não encontrado.', status: 404 };
    if (rows.some((r) => r.live_status !== 'ended')) {
      return { ok: false as const, code: 'live_running', message: 'A live ainda não terminou. Mude o status depois de encerrar.', status: 409 };
    }
    const changing = rows.filter((r) => r.status !== status).map((r) => r.id);
    if (!changing.length) return { ok: true as const, changed: 0, touched: [] as string[], wasCanceled: false };
    const list = sql.join(changing.map((id) => sql`${id}::uuid`), sql`, `);
    const t = now.toISOString();
    // Avançar preenche as etapas anteriores que ficaram sem data; voltar limpa as etapas seguintes.
    const set = {
      draft: sql`invoicing_at = null, invoiced_at = null, delivered_at = null, canceled_at = null`,
      invoicing: sql`sent_to_brand_at = coalesce(sent_to_brand_at, ${t}), invoicing_at = coalesce(invoicing_at, ${t}), invoiced_at = null, delivered_at = null, canceled_at = null`,
      invoiced: sql`sent_to_brand_at = coalesce(sent_to_brand_at, ${t}), invoiced_at = coalesce(invoiced_at, ${t}), delivered_at = null, canceled_at = null`,
      delivered: sql`sent_to_brand_at = coalesce(sent_to_brand_at, ${t}), invoiced_at = coalesce(invoiced_at, ${t}), delivered_at = coalesce(delivered_at, ${t}), canceled_at = null`,
      canceled: sql`canceled_at = ${t}`,
    }[status];
    await tx.execute(sql`update orders set status = ${status}::order_status, ${set}, updated_at = ${t} where id in (${list})`);
    const wasCanceled = rows.some((r) => changing.includes(r.id) && r.status === 'canceled');
    return { ok: true as const, changed: changing.length, touched: changing, wasCanceled };
  });
  if (!res.ok) return res;
  if (res.touched.length) {
    // Cancelar (ou desfazer o cancelamento) muda o estoque: avisa as lives no ar com esses produtos.
    if (status === 'canceled' || res.wasCanceled) await broadcastStockFor(res.touched);
    // E-mails saem em segundo plano para não segurar a resposta (nos testes, espera para conferir a caixa de saída).
    const mails = notifyOrderStatus(res.touched, status).catch((e) => console.error('[pedidos] aviso de status falhou', e));
    if (process.env.NODE_ENV === 'test') await mails;
  }
  return { ok: true, changed: res.changed };
}

async function broadcastStockFor(orderIds: string[]) {
  const list = sql.join(orderIds.map((id) => sql`${id}::uuid`), sql`, `);
  const rows = await db.execute<{ live_id: string; product_id: string; available: number }>(sql`
    select distinct li.live_id, s.product_id, s.available
    from order_items oi
    join product_stock s on s.product_id = oi.product_id
    join live_items li on li.product_id = oi.product_id
    join lives l on l.id = li.live_id and l.status = 'live'
    where oi.order_id in (${list})`);
  for (const r of rows) publish(r.live_id, 'stock', { productId: r.product_id, available: Math.max(0, r.available) }, 'all');
}

// ---------- Detalhe e fatura ----------

export async function adminOrderDetail(orderId: string) {
  if (!UUID.test(orderId)) return null;
  const [o] = await db.execute<{
    id: string; code: string; status: OrderStatus; invoice_url: string | null; created_at: string;
    sent_to_brand_at: string | null; invoicing_at: string | null; invoiced_at: string | null; delivered_at: string | null; canceled_at: string | null;
    live_id: string; live_name: string; live_status: string; live_at: string; brand_name: string;
    company_id: string; company: string; cnpj: string | null; email: string; whatsapp: string; contact_name: string | null; city: string | null; address: string | null; cep: string | null;
  }>(sql`
    select o.id, o.code, o.status, o.invoice_url, o.created_at, o.sent_to_brand_at, o.invoicing_at, o.invoiced_at, o.delivered_at, o.canceled_at,
      l.id as live_id, l.name as live_name, l.status as live_status, coalesce(l.started_at, l.starts_at) as live_at, b.name as brand_name,
      c.id as company_id, c.name as company, c.cnpj, c.email, c.whatsapp, c.contact_name, c.city, c.address, c.cep
    from orders o join lives l on l.id = o.live_id join brands b on b.id = l.brand_id join companies c on c.id = o.company_id
    where o.id = ${orderId}`);
  if (!o) return null;
  const lines = await db.execute<{ id: string; product: string; sku: string; qty: number; unit_price_cents: number; offset_s: number }>(sql`
    select oi.id, p.name as product, p.sku, oi.qty, oi.unit_price_cents, oi.live_offset_s as offset_s
    from order_items oi join products p on p.id = oi.product_id
    where oi.order_id = ${orderId} and oi.canceled_at is null order by oi.created_at`);
  const iso = (v: string | null) => (v ? new Date(v).toISOString() : null);
  return {
    id: o.id,
    code: o.code,
    status: o.status,
    hasInvoice: !!o.invoice_url,
    createdAt: new Date(o.created_at).toISOString(),
    sentToBrandAt: iso(o.sent_to_brand_at),
    invoicingAt: iso(o.invoicing_at),
    invoicedAt: iso(o.invoiced_at),
    deliveredAt: iso(o.delivered_at),
    canceledAt: iso(o.canceled_at),
    live: { id: o.live_id, name: o.live_name, status: o.live_status, at: new Date(o.live_at).toISOString(), brandName: o.brand_name },
    company: { id: o.company_id, name: o.company, cnpj: o.cnpj, email: o.email, whatsapp: o.whatsapp, contactName: o.contact_name, city: o.city, address: o.address, cep: o.cep },
    lines: lines.map((l) => ({ id: l.id, product: l.product, sku: l.sku, qty: l.qty, unitPriceCents: l.unit_price_cents, subtotalCents: l.qty * l.unit_price_cents, offsetS: l.offset_s })),
  };
}
export type AdminOrderDetail = NonNullable<Awaited<ReturnType<typeof adminOrderDetail>>>;

/** Anexa (ou troca) a fatura. Pedido ainda não faturado passa para Faturado. */
export async function attachInvoice(orderId: string, invoiceUrl: string, now = new Date()): Promise<StatusResult> {
  const [o] = await db.execute<{ status: OrderStatus; live_status: string }>(sql`
    select o.status, l.status as live_status from orders o join lives l on l.id = o.live_id where o.id = ${orderId}`);
  if (!o) return { ok: false, code: 'not_found', message: 'Pedido não encontrado.', status: 404 };
  if (o.live_status !== 'ended') return { ok: false, code: 'live_running', message: 'A live ainda não terminou. Anexe a fatura depois de encerrar.', status: 409 };
  if (o.status === 'canceled') return { ok: false, code: 'canceled', message: 'Pedido cancelado não recebe fatura.', status: 409 };
  await db.execute(sql`update orders set invoice_url = ${invoiceUrl}, updated_at = ${now.toISOString()} where id = ${orderId}`);
  if (o.status === 'draft' || o.status === 'invoicing') return setOrdersStatus([orderId], 'invoiced', now);
  return { ok: true, changed: 0 };
}
