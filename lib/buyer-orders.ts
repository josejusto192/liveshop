// Pedidos do comprador (Live encerrada, Minha conta, resumo em PDF).
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from './db';
import { TZ } from './dates';

export const ORDER_STATUS_LABEL: Record<string, string> = {
  draft: 'Registrado',
  invoicing: 'Em faturamento',
  invoiced: 'Faturado',
  delivered: 'Entregue',
  canceled: 'Cancelado',
};

export type BuyerOrderLine = { id: string; productId: string; name: string; sku: string; imageUrl: string | null; qty: number; unitPriceCents: number; subtotalCents: number };

export async function orderLines(orderId: string): Promise<BuyerOrderLine[]> {
  const rows = await db
    .select({
      id: schema.orderItems.id,
      productId: schema.orderItems.productId,
      name: schema.products.name,
      sku: schema.products.sku,
      imageUrl: schema.products.imageUrl,
      qty: schema.orderItems.qty,
      unitPriceCents: schema.orderItems.unitPriceCents,
    })
    .from(schema.orderItems)
    .innerJoin(schema.products, eq(schema.products.id, schema.orderItems.productId))
    .where(and(eq(schema.orderItems.orderId, orderId), isNull(schema.orderItems.canceledAt)))
    .orderBy(schema.orderItems.createdAt);
  return rows.map((r) => ({ ...r, subtotalCents: r.qty * r.unitPriceCents }));
}

export async function orderForCompany(orderId: string, companyId: string) {
  const [row] = await db
    .select({
      order: schema.orders,
      liveName: schema.lives.name,
      liveSlug: schema.lives.slug,
      liveStartsAt: schema.lives.startsAt,
      liveStartedAt: schema.lives.startedAt,
      liveEndedAt: schema.lives.endedAt,
      liveStatus: schema.lives.status,
      brandName: schema.brands.name,
    })
    .from(schema.orders)
    .innerJoin(schema.lives, eq(schema.lives.id, schema.orders.liveId))
    .innerJoin(schema.brands, eq(schema.brands.id, schema.lives.brandId))
    .where(and(eq(schema.orders.id, orderId), eq(schema.orders.companyId, companyId)));
  if (!row) return null;
  const lines = await orderLines(orderId);
  return {
    ...row,
    lines,
    totalUnits: lines.reduce((a, l) => a + l.qty, 0),
    totalCents: lines.reduce((a, l) => a + l.subtotalCents, 0),
  };
}
export type BuyerOrderDetail = NonNullable<Awaited<ReturnType<typeof orderForCompany>>>;

export async function ordersForCompany(companyId: string) {
  const rows = await db.execute<{
    id: string; code: string; status: string; created_at: string; invoice_url: string | null;
    sent_to_brand_at: string | null; invoicing_at: string | null; invoiced_at: string | null; delivered_at: string | null; canceled_at: string | null;
    live_name: string; live_status: string; brand_name: string; starts_at: string; started_at: string | null; units: number; cents: number; lines: number;
  }>(sql`
    select o.id, o.code, o.status, o.created_at, o.invoice_url, o.sent_to_brand_at, o.invoicing_at, o.invoiced_at, o.delivered_at, o.canceled_at,
      l.name as live_name, l.status as live_status, b.name as brand_name, l.starts_at, l.started_at,
      coalesce(sum(oi.qty) filter (where oi.canceled_at is null), 0)::int as units,
      coalesce(sum(oi.qty * oi.unit_price_cents) filter (where oi.canceled_at is null), 0)::int as cents,
      count(oi.id) filter (where oi.canceled_at is null)::int as lines
    from orders o
    join lives l on l.id = o.live_id
    join brands b on b.id = l.brand_id
    left join order_items oi on oi.order_id = o.id
    where o.company_id = ${companyId}
    group by o.id, l.id, b.id
    having count(oi.id) filter (where oi.canceled_at is null) > 0 or o.status <> 'draft'
    order by coalesce(l.started_at, l.starts_at) desc`);
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    status: r.status,
    createdAt: new Date(r.created_at),
    hasInvoice: !!r.invoice_url,
    sentToBrandAt: r.sent_to_brand_at ? new Date(r.sent_to_brand_at) : null,
    invoicingAt: r.invoicing_at ? new Date(r.invoicing_at) : null,
    invoicedAt: r.invoiced_at ? new Date(r.invoiced_at) : null,
    deliveredAt: r.delivered_at ? new Date(r.delivered_at) : null,
    canceledAt: r.canceled_at ? new Date(r.canceled_at) : null,
    liveName: r.live_name,
    liveStatus: r.live_status,
    brandName: r.brand_name,
    liveAt: new Date(r.started_at ?? r.starts_at),
    units: r.units,
    cents: r.cents,
    lines: r.lines,
  }));
}
export type BuyerOrderRow = Awaited<ReturnType<typeof ordersForCompany>>[number];

export async function orderIdFor(liveId: string, companyId: string) {
  const [o] = await db.select({ id: schema.orders.id }).from(schema.orders).where(and(eq(schema.orders.liveId, liveId), eq(schema.orders.companyId, companyId)));
  return o?.id ?? null;
}

export function dateTimeBR(d: Date) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}

export async function latestOrderIds(companyId: string, limit = 50) {
  return db.select({ id: schema.orders.id }).from(schema.orders).where(eq(schema.orders.companyId, companyId)).orderBy(desc(schema.orders.createdAt)).limit(limit);
}
