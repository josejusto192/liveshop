import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { appendItem, endLive, extendItem, gotoItem, nextItem, pauseItem, replaceLineup, resumeItem, setHidden, setMode, startLive } from '@/lib/live-control';
import { tick } from '@/lib/live-clock';
import { adminItemState, buyerItemState, loadLive } from '@/lib/live-state';
import { subscribe, type LiveEvent } from '@/lib/events';
import { at, resetDb, seedLive } from './helpers';

const T0 = new Date('2026-10-01T17:00:00Z');

async function state(liveId: string, now: Date) {
  const full = (await loadLive(liveId))!;
  return { full, admin: adminItemState(full, now), buyer: buyerItemState(full, now) };
}

describe('relógio e controles da live', () => {
  beforeEach(resetDb);

  it('iniciar coloca o primeiro produto no ar e publica status e item', async () => {
    const { live, items } = await seedLive();
    const events: LiveEvent[] = [];
    const unsub = subscribe(live.id, (e) => events.push(e));
    expect((await startLive(live.id, T0)).ok).toBe(true);
    unsub();
    const { full, admin } = await state(live.id, at(T0, 10));
    expect(full.live.status).toBe('live');
    expect(full.live.startedAt).toEqual(T0);
    expect(admin).toMatchObject({ itemId: items[0].id, position: 1, remainingMs: 590_000, paused: false });
    expect(full.items.map((i) => i.status)).toEqual(['on_air', 'queued', 'queued']);
    expect(events.map((e) => `${e.event}:${e.audience}`)).toEqual(expect.arrayContaining(['status:buyer', 'status:admin', 'item:buyer', 'item:admin', 'items:buyer']));
  });

  it('não inicia sem roteiro e não inicia duas vezes', async () => {
    const { live } = await seedLive({ durations: [] });
    expect(await startLive(live.id, T0)).toMatchObject({ ok: false, code: 'empty_lineup' });
    const other = await seedLive();
    await startLive(other.live.id, T0);
    expect(await startLive(other.live.id, T0)).toMatchObject({ ok: false, code: 'already_live' });
  });

  it('troca automática acontece quando o tempo acaba, e o último fica no ar', async () => {
    const { live, items } = await seedLive({ durations: [300, 300] });
    await startLive(live.id, T0);
    await tick(at(T0, 299), 1);
    expect((await state(live.id, at(T0, 299))).admin.itemId).toBe(items[0].id);
    await tick(at(T0, 300), 1);
    const s = await state(live.id, at(T0, 301));
    expect(s.admin.itemId).toBe(items[1].id);
    expect(s.admin.remainingMs).toBe(299_000);
    expect(s.full.items.map((i) => i.status)).toEqual(['presented', 'on_air']);
    // Último item: o tempo zera e ele continua no ar.
    await tick(at(T0, 700), 1);
    const last = await state(live.id, at(T0, 700));
    expect(last.admin.itemId).toBe(items[1].id);
    expect(last.admin.remainingMs).toBe(0);
  });

  it('pausa congela o tempo; retomar continua de onde parou', async () => {
    const { live, items } = await seedLive({ durations: [300, 300] });
    await startLive(live.id, T0);
    await pauseItem(live.id, at(T0, 100));
    await tick(at(T0, 1000), 1); // pausado: não troca
    let s = await state(live.id, at(T0, 1000));
    expect(s.admin).toMatchObject({ itemId: items[0].id, remainingMs: 200_000, paused: true, endsAt: null });
    await resumeItem(live.id, at(T0, 1000));
    s = await state(live.id, at(T0, 1100));
    expect(s.admin).toMatchObject({ remainingMs: 100_000, paused: false });
    await tick(at(T0, 1200), 1);
    expect((await state(live.id, at(T0, 1200))).admin.itemId).toBe(items[1].id);
  });

  it('+5 min soma 300 s ao item atual e zera no próximo', async () => {
    const { live } = await seedLive({ durations: [300, 300] });
    await startLive(live.id, T0);
    await extendItem(live.id, 300);
    expect((await state(live.id, at(T0, 100))).admin.remainingMs).toBe(500_000);
    await tick(at(T0, 300), 1);
    expect((await state(live.id, at(T0, 300))).admin.position).toBe(1);
    await tick(at(T0, 600), 1);
    const s = await state(live.id, at(T0, 600));
    expect(s.admin.position).toBe(2);
    expect(s.full.live.extraMs).toBe(0);
  });

  it('ocultar esconde o card do comprador; próximo e colocar no ar trocam na hora', async () => {
    const { live, items } = await seedLive({ mode: 'manual' });
    await startLive(live.id, T0);
    await setHidden(live.id, true);
    expect((await state(live.id, at(T0, 5))).buyer.hidden).toBe(true);
    await nextItem(live.id, at(T0, 10));
    let s = await state(live.id, at(T0, 11));
    expect(s.admin.itemId).toBe(items[1].id);
    expect(s.buyer.hidden).toBe(false); // trocar de produto mostra de novo
    await gotoItem(live.id, items[0].id, at(T0, 20)); // voltar a um apresentado
    s = await state(live.id, at(T0, 21));
    expect(s.admin.itemId).toBe(items[0].id);
    expect(s.full.items.map((i) => i.status)).toEqual(['on_air', 'presented', 'queued']);
    await gotoItem(live.id, items[2].id, at(T0, 30));
    expect(await nextItem(live.id, at(T0, 31))).toMatchObject({ ok: false, code: 'last_item' });
  });

  it('modo manual não troca sozinho e o comprador não vê timer', async () => {
    const { live, items } = await seedLive({ durations: [300, 300], mode: 'manual' });
    await startLive(live.id, T0);
    await tick(at(T0, 5000), 1);
    const s = await state(live.id, at(T0, 5000));
    expect(s.admin.itemId).toBe(items[0].id);
    expect(s.buyer.showTimer).toBe(false);
    // Voltando ao automático com o tempo esgotado, o item recomeça a contar.
    await setMode(live.id, 'auto', at(T0, 5000));
    const s2 = await state(live.id, at(T0, 5010));
    expect(s2.admin.remainingMs).toBe(290_000);
    expect(s2.buyer.showTimer).toBe(true);
  });

  it('o comprador recebe o fim do tempo e o instante de troca com o atraso do vídeo', async () => {
    const { live } = await seedLive({ durations: [300, 300], delay: 6 });
    const events: LiveEvent[] = [];
    const unsub = subscribe(live.id, (e) => events.push(e));
    await startLive(live.id, T0);
    const buyerItem = events.find((e) => e.event === 'item' && e.audience === 'buyer')!.data as { endsAt: number; effectiveAt: number };
    unsub();
    const s = await state(live.id, T0);
    expect(buyerItem.endsAt).toBe(T0.getTime() + 300_000 + 6000);
    expect(buyerItem.effectiveAt - Date.now()).toBeLessThanOrEqual(6000);
    expect(s.buyer.endsAt).toBe(T0.getTime() + 306_000);
  });

  it('reiniciar o servidor não perde o item atual nem o tempo (tudo vem do banco)', async () => {
    const { live, items } = await seedLive({ durations: [300, 300] });
    await startLive(live.id, T0);
    await nextItem(live.id, at(T0, 50));
    await pauseItem(live.id, at(T0, 80));
    // "Reinício": limpa a memória do processo e recalcula só com o banco.
    const g = globalThis as unknown as { __lsLiveMem?: Map<string, unknown> };
    g.__lsLiveMem?.clear();
    const s = await state(live.id, at(T0, 999));
    expect(s.admin).toMatchObject({ itemId: items[1].id, remainingMs: 270_000, paused: true });
  });

  it('encerrar muda o status e o item atual vira apresentado', async () => {
    const { live } = await seedLive();
    await startLive(live.id, T0);
    expect((await endLive(live.id, at(T0, 100))).ok).toBe(true);
    const [l] = await db.select().from(schema.lives).where(eq(schema.lives.id, live.id));
    expect(l.status).toBe('ended');
    expect(l.endedAt).toEqual(at(T0, 100));
    const items = await db.select().from(schema.liveItems).where(eq(schema.liveItems.liveId, live.id)).orderBy(schema.liveItems.position);
    expect(items.map((i) => i.status)).toEqual(['presented', 'queued', 'queued']);
    expect(await nextItem(live.id)).toMatchObject({ ok: false, code: 'not_live' });
  });

  it('roteiro: reordena antes da live, recusa troca com a live no ar e aceita produto novo no fim', async () => {
    const { live, products, brand } = await seedLive({ durations: [300, 600] });
    expect((await replaceLineup(live.id, [{ productId: products[1].id, durationS: 900 }, { productId: products[0].id, durationS: 300 }])).ok).toBe(true);
    let items = await db.select().from(schema.liveItems).where(eq(schema.liveItems.liveId, live.id)).orderBy(schema.liveItems.position);
    expect(items.map((i) => [i.productId, i.durationS])).toEqual([[products[1].id, 900], [products[0].id, 300]]);
    expect(await replaceLineup(live.id, [{ productId: products[0].id, durationS: 200 }])).toMatchObject({ ok: false });
    await startLive(live.id, T0);
    expect(await replaceLineup(live.id, [])).toMatchObject({ ok: false, code: 'live_running' });
    const [extra] = await db.insert(schema.products).values({ brandId: brand.id, name: 'Extra', sku: 'X', priceCents: 100, stockTotal: 10 }).returning();
    expect((await appendItem(live.id, extra.id)).ok).toBe(true);
    expect(await appendItem(live.id, extra.id)).toMatchObject({ ok: false, code: 'duplicate' });
    items = await db.select().from(schema.liveItems).where(eq(schema.liveItems.liveId, live.id)).orderBy(schema.liveItems.position);
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
  });
});
