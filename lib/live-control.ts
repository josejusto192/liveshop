// Controles da live (Central e tela Transmitir). Tudo em transação com lock da linha da live,
// para o relógio e os cliques do operador não se atropelarem.
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema, type Tx } from './db';
import { itemTiming, nextItemOf, shouldAutoAdvance, sortItems } from './live-timing';
import { broadcastItem, broadcastItems, broadcastStatus, clearNoNext } from './live-state';

export type ControlResult = { ok: true } | { ok: false; code: string; message: string; status: number };

const fail = (code: string, message: string, status = 400): ControlResult => ({ ok: false, code, message, status });

type Locked = { live: typeof schema.lives.$inferSelect; items: { id: string; position: number; durationS: number; status: string }[] };

async function lockLive(tx: Tx, liveId: string): Promise<Locked | null> {
  const rows = await tx.select().from(schema.lives).where(eq(schema.lives.id, liveId)).for('update');
  const live = rows[0];
  if (!live) return null;
  const items = await tx
    .select({ id: schema.liveItems.id, position: schema.liveItems.position, durationS: schema.liveItems.durationS, status: schema.liveItems.status })
    .from(schema.liveItems)
    .where(eq(schema.liveItems.liveId, liveId));
  return { live, items: sortItems(items) };
}

type After = { status?: boolean; item?: { switchedFrom?: string | null } | true; items?: boolean };

async function run(liveId: string, fn: (tx: Tx, l: Locked) => Promise<ControlResult & { after?: After }>): Promise<ControlResult> {
  let after: After | undefined;
  let statusLive: typeof schema.lives.$inferSelect | undefined;
  const res = await db.transaction(async (tx) => {
    const l = await lockLive(tx, liveId);
    if (!l) return fail('not_found', 'Live não encontrada.', 404);
    const r = await fn(tx, l);
    after = r.after;
    if (r.ok && after?.status) {
      statusLive = (await tx.select().from(schema.lives).where(eq(schema.lives.id, liveId)))[0];
    }
    return r;
  });
  if (res.ok && after) {
    if (after.status && statusLive) broadcastStatus(statusLive);
    if (after.item) await broadcastItem(liveId, after.item === true ? { changed: true } : { changed: true, switchedFrom: after.item.switchedFrom ?? null });
    if (after.items) {
      clearNoNext(liveId);
      await broadcastItems(liveId);
    }
  }
  if (!res.ok) return res;
  return { ok: true };
}

async function switchTo(tx: Tx, l: Locked, targetId: string, now: Date) {
  const cur = l.live.currentItemId;
  if (cur && cur !== targetId) {
    await tx.update(schema.liveItems).set({ status: 'presented' }).where(eq(schema.liveItems.id, cur));
  }
  await tx
    .update(schema.liveItems)
    .set({ status: 'on_air', firstAiredAt: sql`coalesce(${schema.liveItems.firstAiredAt}, ${now.toISOString()}::timestamptz)` })
    .where(eq(schema.liveItems.id, targetId));
  await tx
    .update(schema.lives)
    .set({ currentItemId: targetId, itemStartedAt: now, pausedAt: null, extraMs: 0, itemHidden: false })
    .where(eq(schema.lives.id, l.live.id));
  return cur;
}

export function startLive(liveId: string, now = new Date()) {
  return run(liveId, async (tx, l) => {
    if (l.live.status === 'live') return fail('already_live', 'A live já está no ar.', 409);
    if (l.live.status === 'ended') return fail('ended', 'Esta live já foi encerrada.', 409);
    const first = l.items[0];
    if (!first) return fail('empty_lineup', 'Adicione produtos ao roteiro antes de iniciar a live.');
    await tx.update(schema.liveItems).set({ status: 'queued' }).where(eq(schema.liveItems.liveId, liveId));
    await tx.update(schema.lives).set({ status: 'live', startedAt: now, endedAt: null, currentItemId: null }).where(eq(schema.lives.id, liveId));
    await switchTo(tx, { ...l, live: { ...l.live, currentItemId: null } }, first.id, now);
    return { ok: true, after: { status: true, item: { switchedFrom: null }, items: true } };
  });
}

export function endLive(liveId: string, now = new Date()) {
  return run(liveId, async (tx, l) => {
    if (l.live.status !== 'live') return fail('not_live', 'A live não está no ar.', 409);
    await tx
      .update(schema.liveItems)
      .set({ status: 'presented' })
      .where(and(eq(schema.liveItems.liveId, liveId), eq(schema.liveItems.status, 'on_air')));
    await tx
      .update(schema.lives)
      .set({ status: 'ended', endedAt: now, pausedAt: null, itemHidden: false })
      .where(eq(schema.lives.id, liveId));
    return { ok: true, after: { status: true, items: true } };
  });
}

export function nextItem(liveId: string, now = new Date()) {
  return run(liveId, async (tx, l) => {
    if (l.live.status !== 'live') return fail('not_live', 'A live não está no ar.', 409);
    const next = nextItemOf(l.items, l.live.currentItemId);
    if (!next) return fail('last_item', 'Este é o último produto do roteiro.');
    const from = await switchTo(tx, l, next.id, now);
    return { ok: true, after: { item: { switchedFrom: from }, items: true } };
  });
}

export function gotoItem(liveId: string, itemId: string, now = new Date()) {
  return run(liveId, async (tx, l) => {
    if (l.live.status !== 'live') return fail('not_live', 'A live não está no ar.', 409);
    if (!l.items.some((i) => i.id === itemId)) return fail('not_found', 'Produto não está no roteiro.', 404);
    if (l.live.currentItemId === itemId) return { ok: true };
    const from = await switchTo(tx, l, itemId, now);
    return { ok: true, after: { item: { switchedFrom: from }, items: true } };
  });
}

/** Chamado pelo relógio: troca se o tempo acabou (reconfere com a linha travada). */
export function autoAdvance(liveId: string, now = new Date()) {
  return run(liveId, async (tx, l) => {
    const next = shouldAutoAdvance(l.live, l.items, now);
    if (!next) return { ok: true };
    const from = await switchTo(tx, l, next.id, now);
    return { ok: true, after: { item: { switchedFrom: from }, items: true } };
  });
}

export function pauseItem(liveId: string, now = new Date()) {
  return run(liveId, async (tx, l) => {
    if (l.live.status !== 'live') return fail('not_live', 'A live não está no ar.', 409);
    if (l.live.pausedAt) return { ok: true };
    await tx.update(schema.lives).set({ pausedAt: now }).where(eq(schema.lives.id, liveId));
    return { ok: true, after: { item: true } };
  });
}

export function resumeItem(liveId: string, now = new Date()) {
  return run(liveId, async (tx, l) => {
    if (l.live.status !== 'live') return fail('not_live', 'A live não está no ar.', 409);
    if (!l.live.pausedAt || !l.live.itemStartedAt) return { ok: true };
    // Empurra o início do item pelo tempo que ficou pausado.
    const shifted = new Date(l.live.itemStartedAt.getTime() + (now.getTime() - l.live.pausedAt.getTime()));
    await tx.update(schema.lives).set({ pausedAt: null, itemStartedAt: shifted }).where(eq(schema.lives.id, liveId));
    return { ok: true, after: { item: true } };
  });
}

export function extendItem(liveId: string, seconds: number) {
  return run(liveId, async (tx, l) => {
    if (l.live.status !== 'live') return fail('not_live', 'A live não está no ar.', 409);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) return fail('invalid', 'Tempo inválido.');
    await tx
      .update(schema.lives)
      .set({ extraMs: sql`${schema.lives.extraMs} + ${seconds * 1000}` })
      .where(eq(schema.lives.id, liveId));
    return { ok: true, after: { item: true } };
  });
}

export function setHidden(liveId: string, hidden: boolean) {
  return run(liveId, async (tx, l) => {
    if (l.live.status !== 'live') return fail('not_live', 'A live não está no ar.', 409);
    if (l.live.itemHidden === hidden) return { ok: true };
    await tx.update(schema.lives).set({ itemHidden: hidden }).where(eq(schema.lives.id, liveId));
    return { ok: true, after: { item: true } };
  });
}

export function setMode(liveId: string, mode: 'auto' | 'manual', now = new Date()) {
  return run(liveId, async (tx, l) => {
    if (mode !== 'auto' && mode !== 'manual') return fail('invalid', 'Modo inválido.');
    if (l.live.mode === mode) return { ok: true };
    const set: Partial<typeof schema.lives.$inferInsert> = { mode };
    if (mode === 'auto' && l.live.status === 'live') {
      // Voltando ao automático com o tempo esgotado: o item atual recomeça a contar, em vez de trocar na hora.
      const cur = l.items.find((i) => i.id === l.live.currentItemId);
      const t = itemTiming(l.live, cur, now);
      if (t && t.remainingMs <= 0) Object.assign(set, { itemStartedAt: now, extraMs: 0, pausedAt: null });
    }
    await tx.update(schema.lives).set(set).where(eq(schema.lives.id, liveId));
    return { ok: true, after: { item: true } };
  });
}

/** Acrescenta um produto ao fim do roteiro (também durante a live, pela Central). */
export function appendItem(liveId: string, productId: string, durationS = 900) {
  return run(liveId, async (tx, l) => {
    if (l.live.status === 'ended') return fail('ended', 'Esta live já foi encerrada.', 409);
    if (!Number.isInteger(durationS) || durationS < 300 || durationS > 3600) return fail('invalid', 'Duração entre 5 e 60 minutos.');
    const [p] = await tx
      .select({ id: schema.products.id, brandId: schema.products.brandId, active: schema.products.active })
      .from(schema.products)
      .where(eq(schema.products.id, productId));
    if (!p || !p.active || p.brandId !== l.live.brandId) return fail('invalid', 'Produto não pertence à marca desta live.');
    if (l.items.length) {
      const ids = await tx
        .select({ id: schema.liveItems.id })
        .from(schema.liveItems)
        .where(and(eq(schema.liveItems.liveId, liveId), eq(schema.liveItems.productId, productId)));
      if (ids.length) return fail('duplicate', 'Este produto já está no roteiro.', 409);
    }
    const position = (l.items[l.items.length - 1]?.position ?? 0) + 1;
    await tx.insert(schema.liveItems).values({ liveId, productId, position, durationS });
    return { ok: true, after: { items: true } };
  });
}

export type LineupInput = { productId: string; durationS: number }[];

/** Substitui o roteiro inteiro (só antes da live começar). */
export function replaceLineup(liveId: string, lineup: LineupInput) {
  return run(liveId, async (tx, l) => {
    if (l.live.status === 'live') return fail('live_running', 'A live está no ar: ajuste o roteiro pela Central.', 409);
    if (l.live.status === 'ended') return fail('ended', 'Esta live já foi encerrada.', 409);
    const err = validateLineup(lineup);
    if (err) return fail('invalid', err);
    if (lineup.length) {
      const prods = await tx
        .select({ id: schema.products.id })
        .from(schema.products)
        .where(and(inArray(schema.products.id, lineup.map((i) => i.productId)), eq(schema.products.brandId, l.live.brandId), eq(schema.products.active, true)));
      if (prods.length !== lineup.length) return fail('invalid', 'Há produtos que não pertencem à marca desta live.');
    }
    // Itens que já receberam pedido não podem sair do roteiro (o pedido guarda a referência).
    const withOrders = await tx
      .select({ productId: schema.liveItems.productId })
      .from(schema.liveItems)
      .innerJoin(schema.orderItems, eq(schema.orderItems.liveItemId, schema.liveItems.id))
      .where(eq(schema.liveItems.liveId, liveId));
    const keep = new Set(lineup.map((i) => i.productId));
    if (withOrders.some((w) => !keep.has(w.productId))) return fail('has_orders', 'Um produto com pedidos não pode sair do roteiro.', 409);

    const existing = await tx.select().from(schema.liveItems).where(eq(schema.liveItems.liveId, liveId));
    const byProduct = new Map(existing.map((e) => [e.productId, e]));
    for (const [i, it] of lineup.entries()) {
      const ex = byProduct.get(it.productId);
      if (ex) await tx.update(schema.liveItems).set({ position: i + 1, durationS: it.durationS }).where(eq(schema.liveItems.id, ex.id));
      else await tx.insert(schema.liveItems).values({ liveId, productId: it.productId, position: i + 1, durationS: it.durationS });
    }
    const removed = existing.filter((e) => !keep.has(e.productId)).map((e) => e.id);
    if (removed.length) await tx.delete(schema.liveItems).where(inArray(schema.liveItems.id, removed));
    return { ok: true, after: { items: true } };
  });
}

export function validateLineup(lineup: unknown): string | null {
  if (!Array.isArray(lineup)) return 'Roteiro inválido.';
  const seen = new Set<string>();
  for (const it of lineup as LineupInput) {
    if (!it || typeof it.productId !== 'string') return 'Roteiro inválido.';
    if (seen.has(it.productId)) return 'Um produto aparece duas vezes no roteiro.';
    seen.add(it.productId);
    if (!Number.isInteger(it.durationS) || it.durationS < 300 || it.durationS > 3600) return 'Cada produto fica entre 5 e 60 minutos.';
  }
  return null;
}
