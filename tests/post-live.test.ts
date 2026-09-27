import { beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { db, schema } from '@/lib/db';
import { endLive, nextItem, startLive } from '@/lib/live-control';
import { registerOrder } from '@/lib/orders';
import { attachInvoice, lineKpis, linesPerMinute, listOrderLines, parseOrderFilters, setOrdersStatus, tabCounts, type OrderFilters } from '@/lib/admin-orders';
import { brandPdfSections, ordersCsv, ordersXlsx } from '@/lib/order-exports';
import { accountOrders, buyerTimeline } from '@/lib/buyer-orders';
import { adminTickets, companyTickets, createTicket, setTicketStatus } from '@/lib/support';
import { companyDetail, companyKpis, listCompanies } from '@/lib/admin-companies';
import { at, resetDb, seedLive } from './helpers';

async function company(i: number, city: string | null = null) {
  const [c] = await db
    .insert(schema.companies)
    .values({ name: `Loja ${i} Ltda`, email: `loja${i}@ex.com.br`, whatsapp: `(11) 9000${i}-0000`, city, termsAcceptedAt: new Date() })
    .returning();
  return c;
}

/** Live encerrada com 3 empresas: A pede os produtos 1 e 2, B pede o 1, C só assiste. */
async function endedLive() {
  const s = await seedLive({ mode: 'manual', durations: [600, 600, 600], stock: [1000, 1000, 1000] });
  const t0 = new Date('2026-10-01T17:00:00Z');
  await startLive(s.live.id, t0);
  const [a, b, c] = [await company(1, 'Sorocaba'), await company(2), await company(3)];
  expect((await registerOrder({ liveId: s.live.id, companyId: a.id, liveItemId: s.items[0].id, qty: 100, now: at(t0, 65) })).ok).toBe(true);
  expect((await registerOrder({ liveId: s.live.id, companyId: b.id, liveItemId: s.items[0].id, qty: 300, now: at(t0, 130) })).ok).toBe(true);
  await nextItem(s.live.id, at(t0, 200));
  expect((await registerOrder({ liveId: s.live.id, companyId: a.id, liveItemId: s.items[1].id, qty: 50, now: at(t0, 1500) })).ok).toBe(true);
  await db.insert(schema.liveAttendance).values([a, b, c].map((x) => ({ liveId: s.live.id, companyId: x.id })));
  await endLive(s.live.id, at(t0, 1800));
  const orders = await db.select().from(schema.orders).orderBy(schema.orders.code);
  return { ...s, t0, a, b, c, orderA: orders.find((o) => o.companyId === a.id)!, orderB: orders.find((o) => o.companyId === b.id)! };
}

const filters = (patch: Partial<OrderFilters> = {}): OrderFilters => ({ ...parseOrderFilters(new URLSearchParams()), ...patch });
const available = async (productId: string) => (await db.select().from(schema.productStock).where(eq(schema.productStock.productId, productId)))[0].available;

describe('pedidos no admin', () => {
  beforeEach(resetDb);

  it('filtra por live, produto, minuto e busca, e conta por aba', async () => {
    const { live, products } = await endedLive();
    const base = filters({ liveId: live.id });
    expect((await listOrderLines(base)).map((l) => [l.company, l.product, l.qty, l.offsetS])).toEqual([
      ['Loja 1 Ltda', 'Produto 2', 50, 1500],
      ['Loja 2 Ltda', 'Produto 1', 300, 130],
      ['Loja 1 Ltda', 'Produto 1', 100, 65],
    ]);
    expect(await lineKpis(base)).toMatchObject({ orders: 3, units: 450, companies: 2 });
    expect((await listOrderLines(filters({ liveId: live.id, productId: products[0].id }))).map((l) => l.qty)).toEqual([300, 100]);
    // Minuto 1 a 2 → 01:00 até 02:59.
    expect((await listOrderLines(filters({ liveId: live.id, minFrom: 1, minTo: 2 }))).map((l) => l.offsetS)).toEqual([130, 65]);
    expect((await listOrderLines(filters({ q: 'loja2@' }))).map((l) => l.company)).toEqual(['Loja 2 Ltda']);
    expect((await listOrderLines(filters({ q: '90001' }))).every((l) => l.company === 'Loja 1 Ltda')).toBe(true);
    expect(await tabCounts(base)).toEqual({ draft: 3, invoiced: 0, canceled: 0 });
    const perMin = await linesPerMinute(base);
    expect(perMin[1]).toBe(1);
    expect(perMin[2]).toBe(1);
    expect(perMin[25]).toBe(1);
  });

  it('muda o status do pedido inteiro, grava as datas e só depois da live', async () => {
    const s = await seedLive({ mode: 'manual' });
    await startLive(s.live.id);
    const z = await company(9);
    await registerOrder({ liveId: s.live.id, companyId: z.id, liveItemId: s.items[0].id, qty: 10 });
    const [o] = await db.select().from(schema.orders);
    expect(await setOrdersStatus([o.id], 'invoiced')).toMatchObject({ ok: false, code: 'live_running' });
    await endLive(s.live.id);

    const { orderA, orderB, live } = await endedLive();
    const t = new Date('2026-10-02T12:00:00Z');
    expect(await setOrdersStatus([orderA.id], 'invoiced', t)).toEqual({ ok: true, changed: 1 });
    const [a1] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderA.id));
    expect(a1).toMatchObject({ status: 'invoiced', sentToBrandAt: t, invoicedAt: t, deliveredAt: null });
    // As duas linhas da empresa A saem do rascunho juntas.
    expect(await tabCounts(filters({ liveId: live.id }))).toEqual({ draft: 1, invoiced: 2, canceled: 0 });
    // Voltar para rascunho limpa a fatura emitida.
    await setOrdersStatus([orderA.id], 'draft', t);
    const [a2] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderA.id));
    expect(a2).toMatchObject({ status: 'draft', invoicedAt: null, sentToBrandAt: t });
    expect(await setOrdersStatus([orderB.id], 'nada' as never)).toMatchObject({ ok: false, code: 'invalid_status' });
  });

  it('cancelar o pedido devolve o estoque; desfazer reserva de novo', async () => {
    const { orderB, products } = await endedLive();
    expect(await available(products[0].id)).toBe(600);
    await setOrdersStatus([orderB.id], 'canceled');
    expect(await available(products[0].id)).toBe(900);
    await setOrdersStatus([orderB.id], 'draft');
    expect(await available(products[0].id)).toBe(600);
  });

  it('anexar a fatura marca como faturado e libera o download para o comprador', async () => {
    const { orderA, a } = await endedLive();
    let [acc] = (await accountOrders(a.id)).filter((o) => o.id === orderA.id);
    expect(acc.invoice).toBe('pending');
    expect(acc.steps.map((s) => s.state)).toEqual(['current', 'todo', 'todo', 'todo']);
    expect(await attachInvoice(orderA.id, '/api/uploads/00000000-0000-0000-0000-000000000000.pdf')).toMatchObject({ ok: true, changed: 1 });
    [acc] = (await accountOrders(a.id)).filter((o) => o.id === orderA.id);
    expect(acc).toMatchObject({ status: 'invoiced', statusLabel: 'Faturado', invoice: 'ready', units: 150, cents: 150 * 8990 });
    expect(acc.steps.map((s) => s.state)).toEqual(['done', 'done', 'current', 'todo']);
    // Faturado sem PDF anexado (marcado em massa): fatura foi por e-mail.
    const { orderB, b } = await (async () => ({ orderB: (await db.select().from(schema.orders).where(sql`status = 'draft'`))[0], b: null }))();
    void b;
    await setOrdersStatus([orderB.id], 'invoiced');
    const accB = (await accountOrders(orderB.companyId)).find((o) => o.id === orderB.id)!;
    expect(accB.invoice).toBe('by_email');
  });

  it('linha do tempo do comprador: "após a live" enquanto a live não terminou', () => {
    const created = new Date('2026-10-01T17:01:00Z');
    const steps = buyerTimeline({ status: 'draft', createdAt: created, sentToBrandAt: null, invoicedAt: null, deliveredAt: null }, 'live', new Date('2026-10-01T17:30:00Z'));
    expect(steps.map((s) => s.when)).toEqual(['hoje, 14:01', 'após a live', 'aguardando', 'aguardando']);
  });

  it('exportações batem com a tela: mesmas linhas, quantidades e totais', async () => {
    const { live } = await endedLive();
    const f = filters({ liveId: live.id });
    const lines = await listOrderLines(f);
    const kpis = await lineKpis(f);

    const csv = ordersCsv(lines);
    const rows = csv.replace(/^﻿/, '').trim().split('\r\n');
    expect(rows[0]).toBe('Live;Marca;Código do pedido;Empresa;CNPJ;E-mail;WhatsApp;Produto;SKU;Quantidade;Preço/un.;Subtotal;Minuto da live;Data/hora;Status');
    expect(rows).toHaveLength(1 + kpis.orders);
    expect(rows.slice(1).reduce((a, r) => a + Number(r.split(';')[9]), 0)).toBe(kpis.units);
    expect(rows[1].split(';').slice(9, 13)).toEqual(['50', '89,90', '4495,00', '25:00']);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await ordersXlsx(lines)) as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Pedidos')!;
    const total = ws.getRow(ws.rowCount);
    expect(total.getCell(1).value).toBe('Total');
    expect(total.getCell(10).value).toBe(kpis.units);
    expect(total.getCell(12).value).toBeCloseTo(kpis.cents / 100, 2);

    const pdf = brandPdfSections(lines);
    expect(pdf).toHaveLength(1);
    expect(pdf[0].companies.map((c) => [c.name, c.lines.reduce((a, l) => a + l.qty, 0)])).toEqual([
      ['Loja 1 Ltda', 150],
      ['Loja 2 Ltda', 300],
    ]);
    // Seleção ("Baixar selecionados") exporta só os itens escolhidos.
    const only = await listOrderLines({ ...f, ids: [lines[0].itemId] });
    expect(only.map((l) => l.itemId)).toEqual([lines[0].itemId]);
  });
});

describe('empresas', () => {
  beforeEach(resetDb);

  it('segmenta quem comprou e quem só assistiu, com histórico nas lives', async () => {
    const { a, c } = await endedLive();
    expect(await companyKpis()).toMatchObject({ total: 3, buyers: 2, watchers: 1 });
    expect((await listCompanies({ seg: 'buyers', q: '' })).map((r) => r.name)).toEqual(['Loja 2 Ltda', 'Loja 1 Ltda']);
    expect((await listCompanies({ seg: 'watchers', q: '' })).map((r) => r.name)).toEqual(['Loja 3 Ltda']);
    const d = await companyDetail(a.id);
    expect(d).toMatchObject({ lives: 1, orders: 1, units: 150 });
    expect(d!.history[0]).toMatchObject({ products: 2, units: 150, onAir: false });
    const dc = await companyDetail(c.id);
    expect(dc!.history[0]).toMatchObject({ products: 0, units: 0 });
  });
});

describe('chamados de suporte', () => {
  beforeEach(resetDb);

  it('comprador abre, agência vê e marca como respondido', async () => {
    const { a, orderA, orderB } = await endedLive();
    expect(await createTicket(a, { subject: 'Outro', message: 'oi' })).toMatchObject({ ok: false, code: 'invalid' });
    // Pedido de outra empresa não pode ser vinculado.
    expect(await createTicket(a, { subject: 'Entrega', orderId: orderB.id, message: 'Quando chega?' })).toMatchObject({ ok: false, fields: { orderId: 'Pedido não encontrado.' } });
    const r = await createTicket(a, { subject: 'Entrega', orderId: orderA.id, message: 'Quando chega o pedido?' });
    expect(r).toMatchObject({ ok: true, ticket: { status: 'open', orderCode: orderA.code } });
    const open = await adminTickets();
    expect(open.map((t) => [t.company, t.subject, t.orderCode])).toEqual([['Loja 1 Ltda', 'Entrega', orderA.code]]);
    expect(await setTicketStatus(open[0].id, 'answered')).toBe(true);
    expect(await adminTickets()).toHaveLength(0);
    expect((await companyTickets(a.id))[0].status).toBe('answered');
  });
});
