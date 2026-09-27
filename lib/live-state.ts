// Estado da live para as telas (comprador e Central) e publicação das mudanças no barramento.
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from './db';
import { publish, viewerCount } from './events';
import { itemTiming, sortItems } from './live-timing';

export type LiveRow = typeof schema.lives.$inferSelect & { brandName: string };

export type LiveItemFull = {
  id: string;
  productId: string;
  position: number;
  durationS: number;
  status: 'queued' | 'on_air' | 'presented';
  firstAiredAt: Date | null;
  name: string;
  sku: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  minQty: number;
  stepQty: number;
  stockTotal: number;
  reserved: number;
  available: number;
  blockOverStock: boolean;
};

export type LiveFull = { live: LiveRow; items: LiveItemFull[] };

export async function loadLive(liveId: string): Promise<LiveFull | null> {
  const [live] = await db
    .select({ l: schema.lives, brandName: schema.brands.name })
    .from(schema.lives)
    .innerJoin(schema.brands, eq(schema.brands.id, schema.lives.brandId))
    .where(eq(schema.lives.id, liveId));
  if (!live) return null;
  const items = await loadItems(liveId);
  return { live: { ...live.l, brandName: live.brandName }, items };
}

export async function loadItems(liveId: string): Promise<LiveItemFull[]> {
  const li = schema.liveItems;
  const p = schema.products;
  const s = schema.productStock;
  const rows = await db
    .select({
      id: li.id,
      productId: li.productId,
      position: li.position,
      durationS: li.durationS,
      status: li.status,
      firstAiredAt: li.firstAiredAt,
      name: p.name,
      sku: p.sku,
      description: p.description,
      imageUrl: p.imageUrl,
      priceCents: p.priceCents,
      minQty: p.minQty,
      stepQty: p.stepQty,
      stockTotal: p.stockTotal,
      reserved: s.reserved,
      available: s.available,
      blockOverStock: p.blockOverStock,
    })
    .from(li)
    .innerJoin(p, eq(p.id, li.productId))
    .innerJoin(s, eq(s.productId, li.productId))
    .where(eq(li.liveId, liveId));
  return sortItems(rows);
}

// ---------- Memória da última troca (para o atraso do vídeo) ----------

export type BuyerItemState = {
  itemId: string | null;
  productId: string | null;
  position: number | null;
  /** Fim do tempo do item na linha do tempo do comprador (já somado o atraso do vídeo). */
  endsAt: number | null;
  remainingMs: number | null;
  paused: boolean;
  hidden: boolean;
  showTimer: boolean;
  /** Instante em que o navegador do comprador aplica este estado (troca + atraso do vídeo). */
  effectiveAt: number;
  serverNow: number;
};

type Mem = { lastChangeAt: number; last: BuyerItemState | null; prev: BuyerItemState | null; prevItemId: string | null };
const g = globalThis as unknown as { __lsLiveMem?: Map<string, Mem> };
const mem = g.__lsLiveMem ?? (g.__lsLiveMem = new Map());

function memFor(liveId: string): Mem {
  let m = mem.get(liveId);
  if (!m) {
    m = { lastChangeAt: 0, last: null, prev: null, prevItemId: null };
    mem.set(liveId, m);
  }
  return m;
}

/** Item que ainda aparece para o comprador por causa do atraso (aceita pedido nesse intervalo). */
export function graceItemId(liveId: string, videoDelayS: number, now = Date.now()): string | null {
  const m = mem.get(liveId);
  if (!m?.prevItemId) return null;
  return now < m.lastChangeAt + videoDelayS * 1000 + 2000 ? m.prevItemId : null;
}

export function buyerItemState(full: LiveFull, now: Date): BuyerItemState {
  const { live, items } = full;
  const cur = items.find((i) => i.id === live.currentItemId) ?? null;
  const t = live.status === 'live' ? itemTiming(live, cur, now) : null;
  const delayMs = live.videoDelayS * 1000;
  const m = memFor(live.id);
  return {
    itemId: live.status === 'live' ? (cur?.id ?? null) : null,
    productId: live.status === 'live' ? (cur?.productId ?? null) : null,
    position: live.status === 'live' ? (cur?.position ?? null) : null,
    endsAt: t?.endsAt ? t.endsAt.getTime() + delayMs : null,
    remainingMs: t ? t.remainingMs : null,
    paused: t?.paused ?? false,
    hidden: live.itemHidden,
    showTimer: live.mode === 'auto' && live.showTimer,
    effectiveAt: m.lastChangeAt ? m.lastChangeAt + delayMs : now.getTime(),
    serverNow: now.getTime(),
  };
}

export type AdminItemState = {
  itemId: string | null;
  position: number | null;
  remainingMs: number | null;
  totalMs: number | null;
  endsAt: number | null;
  paused: boolean;
  hidden: boolean;
  mode: 'auto' | 'manual';
  serverNow: number;
};

export function adminItemState(full: LiveFull, now: Date): AdminItemState {
  const { live, items } = full;
  const cur = items.find((i) => i.id === live.currentItemId) ?? null;
  const t = live.status === 'live' ? itemTiming(live, cur, now) : null;
  return {
    itemId: live.status === 'live' ? (cur?.id ?? null) : null,
    position: live.status === 'live' ? (cur?.position ?? null) : null,
    remainingMs: t?.remainingMs ?? null,
    totalMs: t?.totalMs ?? null,
    endsAt: t?.endsAt?.getTime() ?? null,
    paused: t?.paused ?? false,
    hidden: live.itemHidden,
    mode: live.mode,
    serverNow: now.getTime(),
  };
}

// Campos públicos do roteiro para o comprador.
export function publicItems(items: LiveItemFull[]) {
  return items.map((i) => ({
    id: i.id,
    productId: i.productId,
    position: i.position,
    status: i.status,
    name: i.name,
    sku: i.sku,
    description: i.description,
    imageUrl: i.imageUrl,
    priceCents: i.priceCents,
    minQty: i.minQty,
    stepQty: i.stepQty,
    stockTotal: i.stockTotal,
    available: Math.max(0, i.available),
    blockOverStock: i.blockOverStock,
  }));
}
export type PublicItem = ReturnType<typeof publicItems>[number];

export function adminItems(items: LiveItemFull[]) {
  return items.map((i) => ({ ...publicItems([i])[0], durationS: i.durationS, reserved: i.reserved }));
}
export type AdminItem = ReturnType<typeof adminItems>[number];

export function liveInfo(live: LiveRow) {
  return {
    id: live.id,
    name: live.name,
    slug: live.slug,
    brandName: live.brandName,
    status: live.status,
    format: live.format,
    mode: live.mode,
    startsAt: live.startsAt.getTime(),
    startedAt: live.startedAt?.getTime() ?? null,
    endedAt: live.endedAt?.getTime() ?? null,
    videoDelayS: live.videoDelayS,
    showTimer: live.showTimer,
    showActivity: live.showActivity,
  };
}
export type LiveInfo = ReturnType<typeof liveInfo>;

/** Estado completo do comprador ao conectar (evento `snapshot`). */
export function buyerSnapshot(full: LiveFull, now = new Date()) {
  const current = buyerItemState(full, now);
  const m = memFor(full.live.id);
  const previous = m.prev && now.getTime() < current.effectiveAt ? m.prev : null;
  return {
    live: liveInfo(full.live),
    items: publicItems(full.items),
    current,
    previous,
    viewers: viewerCount(full.live.id),
  };
}
export type BuyerSnapshot = ReturnType<typeof buyerSnapshot>;

// ---------- Publicação ----------

/**
 * Publica o estado do item no ar. `changed` marca uma mudança real (troca, pausa, +5 min, ocultar),
 * que o comprador aplica depois do atraso do vídeo; reenvios periódicos não empurram esse instante.
 */
export async function broadcastItem(liveId: string, opts: { changed: boolean; switchedFrom?: string | null } = { changed: true }) {
  const full = await loadLive(liveId);
  if (!full) return;
  const now = new Date();
  const m = memFor(liveId);
  if (opts.changed) {
    m.prev = m.last;
    m.lastChangeAt = now.getTime();
    if (opts.switchedFrom !== undefined) m.prevItemId = opts.switchedFrom;
  }
  const b = buyerItemState(full, now);
  m.last = b;
  publish(liveId, 'item', b, 'buyer');
  publish(liveId, 'item', adminItemState(full, now), 'admin');
}

export async function broadcastItems(liveId: string) {
  const full = await loadLive(liveId);
  if (!full) return;
  publish(liveId, 'items', { items: publicItems(full.items) }, 'buyer');
  publish(liveId, 'items', { items: adminItems(full.items) }, 'admin');
}

export function broadcastStatus(live: { id: string; status: string; startedAt: Date | null; endedAt: Date | null; videoDelayS: number }) {
  const now = Date.now();
  // O fim da live espera o atraso do vídeo para o comprador não perder os últimos segundos.
  const effectiveAt = live.status === 'ended' ? now + live.videoDelayS * 1000 : now;
  const data = { status: live.status, startedAt: live.startedAt?.getTime() ?? null, endedAt: live.endedAt?.getTime() ?? null };
  publish(live.id, 'status', { ...data, effectiveAt }, 'buyer');
  publish(live.id, 'status', { ...data, effectiveAt: now }, 'admin');
}

// Lives cujo último item já esgotou o tempo (o relógio não tenta trocar de novo a cada segundo).
const gn = globalThis as unknown as { __lsNoNext?: Set<string> };
export const noNextMemo = gn.__lsNoNext ?? (gn.__lsNoNext = new Set<string>());
export function clearNoNext(liveId: string) {
  for (const k of noNextMemo) if (k.startsWith(`${liveId}:`)) noNextMemo.delete(k);
}

// ---------- KPIs da Central ----------

export type Kpis = { viewers: number; buyingCompanies: number; orders: number; units: number };

export async function computeKpis(liveId: string): Promise<Kpis> {
  const [r] = await db
    .select({
      buying: sql<number>`count(distinct ${schema.orders.companyId})::int`,
      lines: sql<number>`count(${schema.orderItems.id})::int`,
      units: sql<number>`coalesce(sum(${schema.orderItems.qty}), 0)::int`,
    })
    .from(schema.orders)
    .innerJoin(schema.orderItems, and(eq(schema.orderItems.orderId, schema.orders.id), isNull(schema.orderItems.canceledAt)))
    .where(eq(schema.orders.liveId, liveId));
  return { viewers: viewerCount(liveId), buyingCompanies: r?.buying ?? 0, orders: r?.lines ?? 0, units: r?.units ?? 0 };
}

// Histórico curto para os mini gráficos dos KPIs (amostra a cada 30 s, últimas 8).
const gs = globalThis as unknown as { __lsSparks?: Map<string, { at: number; samples: Kpis[] }> };
const sparks = gs.__lsSparks ?? (gs.__lsSparks = new Map());

export function recordKpis(liveId: string, k: Kpis, now = Date.now()) {
  const cur = sparks.get(liveId) ?? { at: 0, samples: [] };
  if (now - cur.at >= 30_000) {
    cur.samples = [...cur.samples, k].slice(-8);
    cur.at = now;
  } else if (cur.samples.length) {
    cur.samples[cur.samples.length - 1] = k;
  } else cur.samples = [k];
  sparks.set(liveId, cur);
  return cur.samples;
}

export function kpiHistory(liveId: string): Kpis[] {
  return sparks.get(liveId)?.samples ?? [];
}

// ---------- Pedidos em tempo real (Central) ----------

export type FeedEntry = { id: string; company: string; initials: string; product: string; qty: number; liveOffsetS: number | null; at: number };

export async function recentFeed(liveId: string, limit = 30): Promise<FeedEntry[]> {
  const e = schema.orderItemEvents;
  const rows = await db
    .select({
      id: e.id,
      kind: e.kind,
      qtyBefore: e.qtyBefore,
      qtyAfter: e.qtyAfter,
      liveOffsetS: e.liveOffsetS,
      at: e.createdAt,
      company: schema.companies.name,
      product: schema.products.name,
    })
    .from(e)
    .innerJoin(schema.orderItems, eq(schema.orderItems.id, e.orderItemId))
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
    .innerJoin(schema.companies, eq(schema.companies.id, schema.orders.companyId))
    .innerJoin(schema.products, eq(schema.products.id, schema.orderItems.productId))
    .where(and(eq(schema.orders.liveId, liveId), inArray(e.kind, ['registered', 'added'])))
    .orderBy(desc(e.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: String(r.id),
    company: r.company,
    initials: companyInitials(r.company),
    product: r.product,
    qty: (r.qtyAfter ?? 0) - (r.qtyBefore ?? 0),
    liveOffsetS: r.liveOffsetS,
    at: r.at.getTime(),
  }));
}

export function companyInitials(name: string) {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? '') + (w[1]?.[0] ?? '')).toUpperCase();
}

/** Estado completo da Central ao conectar. */
export async function adminSnapshot(full: LiveFull, extra: { signal: unknown }, now = new Date()) {
  const kpis = await computeKpis(full.live.id);
  return {
    live: liveInfo(full.live),
    items: adminItems(full.items),
    current: adminItemState(full, now),
    kpis,
    history: kpiHistory(full.live.id),
    feed: await recentFeed(full.live.id),
    signal: extra.signal,
  };
}
export type AdminSnapshot = Awaited<ReturnType<typeof adminSnapshot>>;
