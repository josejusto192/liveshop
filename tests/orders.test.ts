import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { endLive, nextItem, setHidden, startLive } from '@/lib/live-control';
import { cancelOrderItem, changeOrderItem, getMyOrder, registerOrder } from '@/lib/orders';
import { subscribe, type LiveEvent } from '@/lib/events';
import { resetDb, seedLive } from './helpers';

async function company(i = 0, city: string | null = 'Sorocaba') {
  const [c] = await db
    .insert(schema.companies)
    .values({ name: `Loja ${i}`, email: `loja${i}@ex.com.br`, whatsapp: '(11) 90000-0000', city, termsAcceptedAt: new Date() })
    .returning();
  return c;
}

async function liveOnAir(opts: Parameters<typeof seedLive>[0] = {}) {
  const s = await seedLive({ mode: 'manual', ...opts });
  await startLive(s.live.id);
  return s;
}

describe('pedidos na live', () => {
  beforeEach(resetDb);

  it('registra, soma na mesma linha e congela o preço e o minuto do primeiro registro', async () => {
    const { live, items, products } = await liveOnAir();
    const c = await company();
    const r1 = await registerOrder({ liveId: live.id, companyId: c.id, liveItemId: items[0].id, qty: 500 });
    expect(r1.ok).toBe(true);
    // Mudar o preço depois não altera o pedido existente.
    await db.update(schema.products).set({ priceCents: 9990 }).where(eq(schema.products.id, products[0].id));
    const r2 = await registerOrder({ liveId: live.id, companyId: c.id, liveItemId: items[0].id, qty: 100 });
    expect(r2.ok).toBe(true);
    const my = await getMyOrder(live.id, c.id);
    expect(my.code).toMatch(/^#LV-\d{4}$/);
    expect(my.items).toHaveLength(1);
    expect(my.items[0]).toMatchObject({ qty: 600, unitPriceCents: 8990, subtotalCents: 600 * 8990 });
    expect(my.totalCents).toBe(600 * 8990);
    const events = await db.select().from(schema.orderItemEvents).orderBy(schema.orderItemEvents.id);
    expect(events.map((e) => [e.kind, e.qtyBefore, e.qtyAfter])).toEqual([['registered', 0, 500], ['added', 500, 600]]);
  });

  it('um pedido por empresa por live, com código sequencial', async () => {
    const { live, items } = await liveOnAir();
    const [a, b] = [await company(1), await company(2)];
    await registerOrder({ liveId: live.id, companyId: a.id, liveItemId: items[0].id, qty: 10 });
    await registerOrder({ liveId: live.id, companyId: b.id, liveItemId: items[0].id, qty: 10 });
    await registerOrder({ liveId: live.id, companyId: a.id, liveItemId: items[0].id, qty: 10 });
    const orders = await db.select().from(schema.orders).orderBy(schema.orders.code);
    expect(orders.map((o) => o.code)).toEqual(['#LV-0001', '#LV-0002']);
  });

  it('valida mínimo e múltiplo no servidor com as mensagens da tela', async () => {
    const { live, items } = await liveOnAir();
    const c = await company();
    expect(await registerOrder({ liveId: live.id, companyId: c.id, liveItemId: items[0].id, qty: 15 })).toMatchObject({ ok: false, code: 'not_multiple', message: 'Use múltiplos de 10' });
    await db.update(schema.products).set({ minQty: 100 }).where(eq(schema.products.id, (await db.select().from(schema.liveItems).where(eq(schema.liveItems.id, items[0].id)))[0].productId));
    expect(await registerOrder({ liveId: live.id, companyId: c.id, liveItemId: items[0].id, qty: 50 })).toMatchObject({ ok: false, code: 'below_min', message: 'Pedido mínimo 100 un.' });
    expect(await registerOrder({ liveId: live.id, companyId: c.id, liveItemId: items[0].id, qty: 0 })).toMatchObject({ ok: false, code: 'invalid_qty' });
    expect(await registerOrder({ liveId: live.id, companyId: c.id, liveItemId: items[0].id, qty: 12.5 })).toMatchObject({ ok: false, code: 'invalid_qty' });
    expect((await registerOrder({ liveId: live.id, companyId: c.id, liveItemId: items[0].id, qty: 100 })).ok).toBe(true);
    // Somando na linha: o mínimo vale para o total, o múltiplo para o que entra.
    expect((await registerOrder({ liveId: live.id, companyId: c.id, liveItemId: items[0].id, qty: 10 })).ok).toBe(true);
  });

  it('só o produto no ar e visível aceita pedido', async () => {
    const { live, items } = await liveOnAir({ delay: 0 });
    const c = await company();
    expect(await registerOrder({ liveId: live.id, companyId: c.id, liveItemId: items[1].id, qty: 10 })).toMatchObject({ ok: false, code: 'not_on_air' });
    await setHidden(live.id, true);
    expect(await registerOrder({ liveId: live.id, companyId: c.id, liveItemId: items[0].id, qty: 10 })).toMatchObject({ ok: false, code: 'not_on_air' });
    await setHidden(live.id, false);
    expect((await registerOrder({ liveId: live.id, companyId: c.id, liveItemId: items[0].id, qty: 10 })).ok).toBe(true);
  });

  it('aceita o produto anterior durante o atraso do vídeo logo depois da troca', async () => {
    const { live, items } = await liveOnAir({ delay: 6 });
    const c = await company();
    await nextItem(live.id);
    // O comprador ainda vê o item 1 por ~6 s: o pedido dele vale.
    expect((await registerOrder({ liveId: live.id, companyId: c.id, liveItemId: items[0].id, qty: 10 })).ok).toBe(true);
    expect(await registerOrder({ liveId: live.id, companyId: c.id, liveItemId: items[0].id, qty: 10, now: new Date(Date.now() + 9000) })).toMatchObject({ ok: false, code: 'not_on_air' });
  });

  it('não passa do estoque e responde com o disponível', async () => {
    const { live, items } = await liveOnAir({ stock: [100, 100, 100] });
    const c = await company();
    expect((await registerOrder({ liveId: live.id, companyId: c.id, liveItemId: items[0].id, qty: 60 })).ok).toBe(true);
    expect(await registerOrder({ liveId: live.id, companyId: c.id, liveItemId: items[0].id, qty: 50 })).toMatchObject({ ok: false, code: 'over_stock', message: 'Só temos 40 un. em estoque', extra: { available: 40 } });
    expect((await registerOrder({ liveId: live.id, companyId: c.id, liveItemId: items[0].id, qty: 40 })).ok).toBe(true);
    expect(await registerOrder({ liveId: live.id, companyId: c.id, liveItemId: items[0].id, qty: 10 })).toMatchObject({ ok: false, code: 'over_stock', message: 'Todo o estoque foi pedido' });
  });

  it('concorrência: 50 registros simultâneos no último estoque nunca passam do disponível', async () => {
    const { live, items, products } = await liveOnAir({ stock: [300, 100, 100] });
    const companies = [];
    for (let i = 0; i < 50; i++) companies.push(await company(i, null));
    const results = await Promise.all(companies.map((c) => registerOrder({ liveId: live.id, companyId: c.id, liveItemId: items[0].id, qty: 10 })));
    const ok = results.filter((r) => r.ok).length;
    expect(ok).toBe(30);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.code === 'over_stock')).toBe(true);
    const [stock] = await db.select().from(schema.productStock).where(eq(schema.productStock.productId, products[0].id));
    expect(stock).toMatchObject({ reserved: 300, available: 0 });
  });

  it('editar e excluir devolvem estoque e só funcionam com a live no ar', async () => {
    const { live, items, products } = await liveOnAir({ stock: [100, 100, 100] });
    const [c, other] = [await company(1), await company(2)];
    const r = await registerOrder({ liveId: live.id, companyId: c.id, liveItemId: items[0].id, qty: 50 });
    if (!r.ok) throw new Error('falhou');
    const itemId = r.itemId;
    expect(await changeOrderItem({ itemId, companyId: other.id, qty: 10 })).toMatchObject({ ok: false, code: 'not_found' });
    expect(await changeOrderItem({ itemId, companyId: c.id, qty: 110 })).toMatchObject({ ok: false, code: 'over_stock', extra: { available: 100 } });
    expect(await changeOrderItem({ itemId, companyId: c.id, qty: 25 })).toMatchObject({ ok: false, code: 'not_multiple' });
    const changed = await changeOrderItem({ itemId, companyId: c.id, qty: 80 });
    expect(changed.ok && changed.order.totalUnits).toBe(80);
    const zero = await changeOrderItem({ itemId, companyId: c.id, qty: 0 }); // 0 = excluir
    expect(zero.ok && zero.order.items).toEqual([]);
    const [stock] = await db.select().from(schema.productStock).where(eq(schema.productStock.productId, products[0].id));
    expect(stock.available).toBe(100);
    // Registrar de novo depois de excluir volta a linha com o preço atual.
    const again = await registerOrder({ liveId: live.id, companyId: c.id, liveItemId: items[0].id, qty: 20 });
    if (!again.ok) throw new Error('falhou');
    await endLive(live.id);
    expect(await changeOrderItem({ itemId: again.itemId, companyId: c.id, qty: 30 })).toMatchObject({ ok: false, code: 'live_not_running' });
    expect(await cancelOrderItem({ itemId: again.itemId, companyId: c.id })).toMatchObject({ ok: false, code: 'live_not_running' });
    expect(await registerOrder({ liveId: live.id, companyId: c.id, liveItemId: items[0].id, qty: 10 })).toMatchObject({ ok: false, code: 'live_not_running' });
  });

  it('publica estoque, atividade anônima (sem valores) e o pedido para a Central', async () => {
    const { live, items } = await liveOnAir();
    const c = await company(7, 'Campinas');
    const events: LiveEvent[] = [];
    const unsub = subscribe(live.id, (e) => events.push(e));
    await registerOrder({ liveId: live.id, companyId: c.id, liveItemId: items[0].id, qty: 500 });
    unsub();
    const by = (n: string) => events.find((e) => e.event === n)!;
    expect(by('stock').data).toMatchObject({ available: 5500 });
    expect(by('activity').data).toMatchObject({ text: 'Uma empresa de Campinas pediu 500 un.' });
    expect(by('activity').audience).toBe('all');
    expect(by('order')).toMatchObject({ audience: 'admin', data: { company: 'Loja 7', initials: 'L7', qty: 500 } });
    expect(by('my-order').data).toMatchObject({ companyId: c.id, order: { totalUnits: 500 } });
  });
});
