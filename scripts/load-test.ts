// Teste de carga: N compradores conectados no SSE da live e M pedidos simultâneos.
//   pnpm load:test [--live slug] [--clients 300] [--orders 300] [--spread ms] [--base http://localhost:3000] [--start] [--keep]
// Cria empresas de teste (carga-N@teste.local) com sessão direto no banco, abre as conexões SSE, dispara os
// pedidos no produto no ar e mede o tempo de resposta. No fim apaga as empresas de teste e os pedidos delas
// (use --keep para manter). Para o aceite do M5, rode com uma transmissão ativa (pnpm stream:test) ao mesmo tempo.
import 'dotenv/config';
import { eq, inArray, like, sql } from 'drizzle-orm';

function arg(name: string, def?: string) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : 'true';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (xs: number[], p: number) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : 0);

async function main() {
  const { db, schema, sqlClient } = await import('../lib/db');
  const { createSession } = await import('../lib/auth');
  const { startLive } = await import('../lib/live-control');
  const base = (arg('base', process.env.APP_URL || 'http://localhost:3000') as string).replace(/\/$/, '');
  const clients = Number(arg('clients', '300'));
  const orders = Number(arg('orders', String(clients)));
  const slug = arg('live');
  // --spread 5000: espalha os pedidos ao acaso em 5 s (pico realista); sem ele, todos saem no mesmo instante.
  const spread = Number(arg('spread', '0'));

  const [live] = slug
    ? await db.select().from(schema.lives).where(eq(schema.lives.slug, slug))
    : await db.select().from(schema.lives).where(eq(schema.lives.status, 'live')).limit(1);
  if (!live) throw new Error(slug ? `Live ${slug} não encontrada.` : 'Nenhuma live no ar. Inicie pela Central ou use --live <slug> --start.');
  if (live.status !== 'live') {
    if (arg('start') !== 'true') throw new Error(`A live ${live.slug} não está no ar (status ${live.status}). Use --start para iniciar.`);
    const r = await startLive(live.id);
    if (!r.ok) throw new Error(`Não foi possível iniciar: ${r.message}`);
    console.log(`Live ${live.slug} iniciada.`);
  }
  const [fresh] = await db.select().from(schema.lives).where(eq(schema.lives.id, live.id));
  const [item] = await db.select().from(schema.liveItems).where(eq(schema.liveItems.id, fresh.currentItemId!));
  const [product] = await db.select().from(schema.products).where(eq(schema.products.id, item.productId));
  const qty = Math.max(product.minQty, product.stepQty);
  console.log(`Live ${live.slug} · produto no ar: ${product.name} · ${qty} un. por pedido`);

  // Empresas e sessões de teste.
  const cookies: string[] = [];
  const ids: string[] = [];
  for (let i = 0; i < Math.max(clients, orders); i++) {
    const email = `carga-${i}@teste.local`;
    const [c] = await db
      .insert(schema.companies)
      .values({ name: `Carga ${i}`, email, whatsapp: '(11) 90000-0000', city: 'Teste', termsAcceptedAt: new Date() })
      .onConflictDoUpdate({ target: schema.companies.email, set: { name: `Carga ${i}` } })
      .returning();
    ids.push(c.id);
    const { token } = await createSession({ companyId: c.id });
    cookies.push(`ls_session=${token}`);
  }

  // Conexões SSE (cada uma lê o fluxo até o fim do teste).
  const ctrl = new AbortController();
  let connected = 0;
  let events = 0;
  let sseErrors = 0;
  const t0 = Date.now();
  const streams = cookies.slice(0, clients).map(async (cookie) => {
    try {
      const res = await fetch(`${base}/api/lives/${live.slug}/stream`, { headers: { cookie, accept: 'text/event-stream' }, signal: ctrl.signal });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let first = true;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value);
        const n = (chunk.match(/^event: /gm) ?? []).length;
        if (n && first) {
          first = false;
          connected++;
        }
        events += n;
      }
    } catch (e) {
      if (!ctrl.signal.aborted) {
        sseErrors++;
        if (sseErrors <= 3) console.error('SSE:', (e as Error).message);
      }
    }
  });
  while (connected + sseErrors < clients && Date.now() - t0 < 60_000) await sleep(200);
  console.log(`SSE: ${connected}/${clients} conectados em ${((Date.now() - t0) / 1000).toFixed(1)} s (${sseErrors} erros)`);
  await sleep(2000);

  // Pedidos simultâneos.
  const lat: number[] = [];
  const codes: Record<string, number> = {};
  const eventsBefore = events;
  const tOrders = Date.now();
  await Promise.all(
    cookies.slice(0, orders).map(async (cookie) => {
      if (spread) await sleep(Math.random() * spread);
      const t = performance.now();
      try {
        const res = await fetch(`${base}/api/lives/${live.slug}/orders`, {
          method: 'POST',
          headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify({ liveItemId: item.id, qty }),
        });
        const body = await res.json().catch(() => ({}));
        lat.push(performance.now() - t);
        const code = res.ok ? 'ok' : (body.error?.code ?? `http_${res.status}`);
        codes[code] = (codes[code] ?? 0) + 1;
      } catch (e) {
        codes.network = (codes.network ?? 0) + 1;
        void e;
      }
    }),
  );
  const wall = Date.now() - tOrders;
  await sleep(3000);
  lat.sort((a, b) => a - b);
  const f = (n: number) => `${Math.round(n)} ms`;
  console.log(`Pedidos: ${orders} em ${f(wall)} · ${JSON.stringify(codes)}`);
  console.log(`Tempo de resposta: mín ${f(lat[0] ?? 0)} · p50 ${f(pct(lat, 50))} · p95 ${f(pct(lat, 95))} · p99 ${f(pct(lat, 99))} · máx ${f(lat[lat.length - 1] ?? 0)}`);
  console.log(`Eventos SSE recebidos durante os pedidos: ${events - eventsBefore} (${connected} conexões)`);
  const ok = pct(lat, 95) < 300;
  console.log(ok ? 'Aceite: p95 abaixo de 300 ms.' : 'Atenção: p95 acima de 300 ms.');

  ctrl.abort();
  await Promise.allSettled(streams);

  if (arg('keep') !== 'true') {
    const orderRows = await db.select({ id: schema.orders.id }).from(schema.orders).where(inArray(schema.orders.companyId, ids));
    const orderIds = orderRows.map((o) => o.id);
    if (orderIds.length) {
      const itemIds = (await db.select({ id: schema.orderItems.id }).from(schema.orderItems).where(inArray(schema.orderItems.orderId, orderIds))).map((x) => x.id);
      if (itemIds.length) await db.delete(schema.orderItemEvents).where(inArray(schema.orderItemEvents.orderItemId, itemIds));
      await db.delete(schema.orders).where(inArray(schema.orders.id, orderIds));
    }
    await db.delete(schema.sessions).where(inArray(schema.sessions.companyId, ids));
    await db.delete(schema.liveAttendance).where(inArray(schema.liveAttendance.companyId, ids));
    await db.delete(schema.companies).where(like(schema.companies.email, 'carga-%@teste.local'));
    await db.execute(sql`select 1`);
    console.log('Empresas e pedidos de teste apagados.');
  }
  await sqlClient.end();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
