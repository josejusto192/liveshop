// Pedidos na live (docs/03, "Pedido"). Tudo validado no servidor, com lock da linha do produto
// (SELECT ... FOR UPDATE) na mesma transação para nunca vender além do estoque.
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema, type Tx } from './db';
import { publish, publishThrottled } from './events';
import { companyInitials, graceItemId } from './live-state';
import { formatInt } from './money';

export type OrderFail = { ok: false; code: string; message: string; status: number; extra?: Record<string, unknown> };
/** Desfaz a transação devolvendo uma falha pronta para a tela. */
class Rollback extends Error {
  constructor(public result: OrderFail) {
    super(result.code);
  }
}
const fail = (code: string, message: string, status = 400, extra?: Record<string, unknown>): OrderFail => ({ ok: false, code, message, status, extra });

export type MyOrderItem = {
  id: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  qty: number;
  unitPriceCents: number;
  subtotalCents: number;
  liveOffsetS: number;
  minQty: number;
  stepQty: number;
};
export type MyOrder = { orderId: string | null; code: string | null; items: MyOrderItem[]; totalUnits: number; totalCents: number };

export async function getMyOrder(liveId: string, companyId: string, tx: Tx | typeof db = db): Promise<MyOrder> {
  const [order] = await tx
    .select({ id: schema.orders.id, code: schema.orders.code })
    .from(schema.orders)
    .where(and(eq(schema.orders.liveId, liveId), eq(schema.orders.companyId, companyId)));
  if (!order) return { orderId: null, code: null, items: [], totalUnits: 0, totalCents: 0 };
  const rows = await tx
    .select({
      id: schema.orderItems.id,
      productId: schema.orderItems.productId,
      name: schema.products.name,
      imageUrl: schema.products.imageUrl,
      qty: schema.orderItems.qty,
      unitPriceCents: schema.orderItems.unitPriceCents,
      liveOffsetS: schema.orderItems.liveOffsetS,
      minQty: schema.products.minQty,
      stepQty: schema.products.stepQty,
    })
    .from(schema.orderItems)
    .innerJoin(schema.products, eq(schema.products.id, schema.orderItems.productId))
    .where(and(eq(schema.orderItems.orderId, order.id), isNull(schema.orderItems.canceledAt)))
    .orderBy(schema.orderItems.createdAt);
  const items = rows.map((r) => ({ ...r, subtotalCents: r.qty * r.unitPriceCents }));
  return {
    orderId: order.id,
    code: order.code,
    items,
    totalUnits: items.reduce((a, i) => a + i.qty, 0),
    totalCents: items.reduce((a, i) => a + i.subtotalCents, 0),
  };
}

async function lockProduct(tx: Tx, productId: string) {
  const [p] = await tx.select().from(schema.products).where(eq(schema.products.id, productId)).for('no key update');
  // Mesma conta da view product_stock: itens ativos de pedidos não cancelados.
  const [{ reserved }] = await tx
    .select({ reserved: sql<number>`coalesce(sum(${schema.orderItems.qty}), 0)::int` })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
    .where(and(eq(schema.orderItems.productId, productId), isNull(schema.orderItems.canceledAt), sql`${schema.orders.status} <> 'canceled'`));
  return { product: p, reserved, available: p.stockTotal - reserved };
}

function validateQty(qty: unknown): qty is number {
  return typeof qty === 'number' && Number.isInteger(qty) && qty > 0 && qty <= 10_000_000;
}

const offsetOf = (startedAt: Date | null, now: Date) => (startedAt ? Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000)) : 0);

type Effects = { liveId: string; companyId: string; productId: string; available: number; feed?: { company: string; product: string; qty: number; liveOffsetS: number; id: string }; activity?: string };

async function emit(e: Effects): Promise<MyOrder> {
  publishThrottled(`${e.liveId}:stock:${e.productId}`, 250, e.liveId, 'stock', { productId: e.productId, available: Math.max(0, e.available) }, 'all');
  if (e.feed) {
    publish(e.liveId, 'order', { id: e.feed.id, company: e.feed.company, initials: companyInitials(e.feed.company), product: e.feed.product, qty: e.feed.qty, liveOffsetS: e.feed.liveOffsetS, at: Date.now() }, 'admin');
  }
  if (e.activity) publishThrottled(`${e.liveId}:activity`, 500, e.liveId, 'activity', { text: e.activity, at: Date.now() }, 'all');
  const my = await getMyOrder(e.liveId, e.companyId);
  publish(e.liveId, 'my-order', { companyId: e.companyId, order: my }, 'buyer');
  return my;
}

/** Registra um pedido do produto no ar. Mesmo produto de novo: soma na mesma linha. */
export async function registerOrder(input: { liveId: string; companyId: string; liveItemId: string; qty: unknown; now?: Date }): Promise<{ ok: true; order: MyOrder; itemId: string } | OrderFail> {
  const now = input.now ?? new Date();
  if (!validateQty(input.qty)) return fail('invalid_qty', 'Digite uma quantidade.');
  const qty = input.qty;
  let effects: Effects | null = null;

  const res = await db.transaction(async (tx) => {
    // Lock compartilhado da live: uma troca de produto espera o registro terminar (e vice-versa).
    const [live] = await tx.select().from(schema.lives).where(eq(schema.lives.id, input.liveId)).for('share');
    if (!live) return fail('not_found', 'Live não encontrada.', 404);
    if (live.status !== 'live') return fail('live_not_running', 'A live não está no ar. Os pedidos estão fechados.', 409);
    const [item] = await tx
      .select()
      .from(schema.liveItems)
      .where(and(eq(schema.liveItems.id, input.liveItemId), eq(schema.liveItems.liveId, input.liveId)));
    const onAir = !!item && item.id === live.currentItemId && !live.itemHidden;
    // Atraso do vídeo: o comprador ainda vê o produto anterior por alguns segundos depois da troca.
    const inGrace = !!item && graceItemId(live.id, live.videoDelayS, now.getTime()) === item.id;
    if (!item || (!onAir && !inGrace)) return fail('not_on_air', 'Este produto não está mais no ar.', 409);

    // Produto lido sem trava: a trava do estoque só é pega no fim, para os pedidos simultâneos esperarem o mínimo.
    const [product] = await tx.select().from(schema.products).where(eq(schema.products.id, item.productId));
    if (!product.active) return fail('not_on_air', 'Este produto não está disponível.', 409);

    const [company] = await tx.select({ name: schema.companies.name, city: schema.companies.city }).from(schema.companies).where(eq(schema.companies.id, input.companyId));
    if (!company) return fail('unauthorized', 'Entre novamente para pedir.', 401);

    // Pedido da empresa nesta live (criado no primeiro registro).
    let [order] = await tx
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.liveId, live.id), eq(schema.orders.companyId, input.companyId)));
    if (!order) {
      const [{ n }] = await tx.execute<{ n: string }>(sql`select nextval('order_code_seq') as n`);
      [order] = await tx
        .insert(schema.orders)
        .values({ liveId: live.id, companyId: input.companyId, code: `#LV-${String(n).padStart(4, '0')}`, createdAt: now, updatedAt: now })
        .onConflictDoNothing({ target: [schema.orders.liveId, schema.orders.companyId] })
        .returning();
      if (!order) [order] = await tx.select().from(schema.orders).where(and(eq(schema.orders.liveId, live.id), eq(schema.orders.companyId, input.companyId)));
    }
    if (order.status !== 'draft') return fail('order_locked', 'Seu pedido nesta live já está com a agência. Fale com o suporte para alterar.', 409);

    const [line] = await tx
      .select()
      .from(schema.orderItems)
      .where(and(eq(schema.orderItems.orderId, order.id), eq(schema.orderItems.productId, product.id)))
      .for('update');
    const active = line && !line.canceledAt ? line : null;
    const newTotal = (active?.qty ?? 0) + qty;

    if (product.stepQty > 1 && qty % product.stepQty !== 0) return fail('not_multiple', `Use múltiplos de ${formatInt(product.stepQty)}`, 400, { step: product.stepQty });
    if (newTotal < product.minQty) return fail('below_min', `Pedido mínimo ${formatInt(product.minQty)} un.`, 400, { min: product.minQty });

    const offset = offsetOf(live.startedAt, now);
    let itemId: string;
    let kind: 'registered' | 'added';
    if (active) {
      await tx.update(schema.orderItems).set({ qty: newTotal, updatedAt: now }).where(eq(schema.orderItems.id, active.id));
      itemId = active.id;
      kind = 'added';
    } else if (line) {
      // A linha tinha sido excluída: volta com o preço e o minuto de agora.
      await tx
        .update(schema.orderItems)
        .set({ qty, canceledAt: null, unitPriceCents: product.priceCents, liveOffsetS: offset, liveItemId: item.id, updatedAt: now })
        .where(eq(schema.orderItems.id, line.id));
      itemId = line.id;
      kind = 'registered';
    } else {
      const [created] = await tx
        .insert(schema.orderItems)
        .values({ orderId: order.id, productId: product.id, liveItemId: item.id, qty, unitPriceCents: product.priceCents, liveOffsetS: offset, createdAt: now, updatedAt: now })
        .returning({ id: schema.orderItems.id });
      itemId = created.id;
      kind = 'registered';
    }
    const [ev] = await tx
      .insert(schema.orderItemEvents)
      .values({ orderItemId: itemId, kind, qtyBefore: active?.qty ?? 0, qtyAfter: newTotal, liveOffsetS: offset, byCompany: true, createdAt: now })
      .returning({ id: schema.orderItemEvents.id });
    await tx.update(schema.orders).set({ updatedAt: now }).where(eq(schema.orders.id, order.id));

    // Trava do produto + conferência do estoque já contando este registro. Passou do estoque: desfaz tudo.
    const { available: after } = await lockProduct(tx, product.id);
    const available = after + qty;
    if (product.blockOverStock && after < 0) {
      const a = Math.max(0, available);
      throw new Rollback(fail('over_stock', a > 0 ? `Só temos ${formatInt(a)} un. em estoque` : 'Todo o estoque foi pedido', 409, { available: a }));
    }

    effects = {
      liveId: live.id,
      companyId: input.companyId,
      productId: product.id,
      available: available - qty,
      feed: { id: String(ev.id), company: company.name, product: product.name, qty, liveOffsetS: offset },
      activity: live.showActivity ? (company.city ? `Uma empresa de ${company.city} pediu ${formatInt(qty)} un.` : `Uma empresa pediu ${formatInt(qty)} un.`) : undefined,
    };
    return { ok: true as const, itemId };
  }).catch((e) => {
    if (e instanceof Rollback) return e.result;
    throw e;
  });

  if (!res.ok) return res;
  const order = effects ? await emit(effects) : await getMyOrder(input.liveId, input.companyId);
  return { ok: true, itemId: res.itemId, order };
}

/** Comprador altera a quantidade (0 = excluir). Só com a live no ar. */
export async function changeOrderItem(input: { itemId: string; companyId: string; qty: unknown; now?: Date }): Promise<{ ok: true; order: MyOrder } | OrderFail> {
  const now = input.now ?? new Date();
  if (input.qty === 0) return cancelOrderItem(input);
  if (!validateQty(input.qty)) return fail('invalid_qty', 'Digite uma quantidade.');
  const qty = input.qty;
  let effects: Effects | null = null;
  let liveId = '';

  const res = await db.transaction(async (tx) => {
    const row = await lockOwnedItem(tx, input.itemId, input.companyId);
    if (!row.ok) return row;
    const { item, live } = row;
    liveId = live.id;
    const { product, available } = await lockProduct(tx, item.productId);
    if (product.stepQty > 1 && qty % product.stepQty !== 0) return fail('not_multiple', `Use múltiplos de ${formatInt(product.stepQty)}`, 400, { step: product.stepQty });
    if (qty < product.minQty) return fail('below_min', `Pedido mínimo ${formatInt(product.minQty)} un.`, 400, { min: product.minQty });
    const max = available + item.qty;
    if (product.blockOverStock && qty > max) return fail('over_stock', `Só temos ${formatInt(Math.max(0, max))} un. em estoque`, 409, { available: Math.max(0, max) });
    if (qty === item.qty) return { ok: true as const };
    await tx.update(schema.orderItems).set({ qty, updatedAt: now }).where(eq(schema.orderItems.id, item.id));
    await tx.insert(schema.orderItemEvents).values({ orderItemId: item.id, kind: 'changed', qtyBefore: item.qty, qtyAfter: qty, liveOffsetS: offsetOf(live.startedAt, now), byCompany: true, createdAt: now });
    await tx.update(schema.orders).set({ updatedAt: now }).where(eq(schema.orders.id, item.orderId));
    effects = { liveId: live.id, companyId: input.companyId, productId: product.id, available: max - qty };
    return { ok: true as const };
  });
  if (!res.ok) return res;
  const order = effects ? await emit(effects) : await getMyOrder(liveId, input.companyId);
  return { ok: true, order };
}

/** Exclusão lógica (canceled_at): devolve o estoque. Só com a live no ar. */
export async function cancelOrderItem(input: { itemId: string; companyId: string; now?: Date }): Promise<{ ok: true; order: MyOrder } | OrderFail> {
  const now = input.now ?? new Date();
  let effects: Effects | null = null;
  let liveId = '';
  const res = await db.transaction(async (tx) => {
    const row = await lockOwnedItem(tx, input.itemId, input.companyId);
    if (!row.ok) return row;
    const { item, live } = row;
    liveId = live.id;
    const { product, available } = await lockProduct(tx, item.productId);
    await tx.update(schema.orderItems).set({ canceledAt: now, updatedAt: now }).where(eq(schema.orderItems.id, item.id));
    await tx.insert(schema.orderItemEvents).values({ orderItemId: item.id, kind: 'canceled', qtyBefore: item.qty, qtyAfter: 0, liveOffsetS: offsetOf(live.startedAt, now), byCompany: true, createdAt: now });
    await tx.update(schema.orders).set({ updatedAt: now }).where(eq(schema.orders.id, item.orderId));
    effects = { liveId: live.id, companyId: input.companyId, productId: product.id, available: available + item.qty };
    return { ok: true as const };
  });
  if (!res.ok) return res;
  const order = effects ? await emit(effects) : await getMyOrder(liveId, input.companyId);
  return { ok: true, order };
}

async function lockOwnedItem(tx: Tx, itemId: string, companyId: string) {
  const [row] = await tx
    .select({ item: schema.orderItems, companyId: schema.orders.companyId, liveId: schema.orders.liveId, orderStatus: schema.orders.status })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
    .where(eq(schema.orderItems.id, itemId))
    .for('update', { of: schema.orderItems });
  if (!row || row.companyId !== companyId || row.item.canceledAt) return fail('not_found', 'Pedido não encontrado.', 404);
  const [live] = await tx.select().from(schema.lives).where(eq(schema.lives.id, row.liveId)).for('share');
  if (!live || live.status !== 'live') return fail('live_not_running', 'A live terminou: os pedidos não podem mais ser alterados.', 409);
  if (row.orderStatus !== 'draft') return fail('order_locked', 'Seu pedido nesta live já está com a agência. Fale com o suporte para alterar.', 409);
  return { ok: true as const, item: row.item, live };
}

// ---------- Avisar se voltar ao estoque ----------

export async function setStockAlert(productId: string, companyId: string, on: boolean) {
  if (on) await db.insert(schema.stockAlerts).values({ productId, companyId }).onConflictDoNothing();
  else await db.delete(schema.stockAlerts).where(and(eq(schema.stockAlerts.productId, productId), eq(schema.stockAlerts.companyId, companyId)));
}

export async function myStockAlerts(companyId: string, productIds: string[]) {
  if (!productIds.length) return [];
  const rows = await db
    .select({ productId: schema.stockAlerts.productId })
    .from(schema.stockAlerts)
    .where(and(eq(schema.stockAlerts.companyId, companyId), inArray(schema.stockAlerts.productId, productIds)));
  return rows.map((r) => r.productId!).filter(Boolean);
}
