// Dados de exemplo iguais aos do protótipo (design/prototypes). Apaga tudo antes de inserir.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_FORCE !== '1') {
    throw new Error('Seed apaga o banco. Em produção, rode com SEED_FORCE=1 se tiver certeza.');
  }
  const { db, schema, sqlClient } = await import('../lib/db');

  await db.execute(sql`truncate table
    order_item_events, order_items, orders, stock_alerts, live_attendance, support_tickets,
    login_links, sessions, otp_codes, live_items, lives, products, brands, companies, admin_users, settings
    restart identity cascade`);
  await db.execute(sql`alter sequence order_code_seq restart with 1`);

  await db.insert(schema.settings).values({
    id: 1,
    platformName: 'Live Shop',
    accentColor: '#D6F35B',
    defaultVideoDelayS: 6,
    otpTtlMin: 10,
    mailFromName: 'Live Shop',
    mailSubject: 'Seu código para entrar na live: {código}',
  });

  await db.insert(schema.adminUsers).values([
    { name: 'Administradora da agência', email: 'admin@agencia.com.br', role: 'owner' },
    { name: 'Operador de live', email: 'operacao@agencia.com.br', role: 'operator' },
    { name: 'Financeiro', email: 'financeiro@agencia.com.br', role: 'finance' },
  ]);

  // Uma inserção por vez para a ordem de criação (created_at) seguir a do protótipo.
  const brandRows = [
    { name: 'Marca Exemplo', segment: 'Utilidades e papelaria', ordersEmail: 'comercial@marcaexemplo.com.br' },
    { name: 'Cliente B', segment: 'Cosméticos', ordersEmail: 'comercial@clienteb.com.br' },
    { name: 'Cliente C', segment: 'Moda e acessórios', ordersEmail: 'comercial@clientec.com.br' },
  ];
  const brands = [];
  for (const b of brandRows) brands.push((await db.insert(schema.brands).values(b).returning())[0]);
  const marca = brands[0];

  const productRows = [
      { name: 'Caneta esferográfica azul', sku: 'CN-AZ-050', priceCents: 89, stockTotal: 120000, description: 'Caixa com 50 unidades.' },
      { name: 'Ventilador de mesa 40 cm', sku: 'VT-40-BR', priceCents: 8990, stockTotal: 6000, description: '3 velocidades, bivolt.' },
      { name: 'Garrafa térmica 1 L', sku: 'GT-1L-IN', priceCents: 3250, stockTotal: 12000, description: 'Aço inox, parede dupla. Caixa com 12 unidades.' },
      { name: 'Kit organizador de mesa', sku: 'KO-3P-PT', priceCents: 2490, stockTotal: 3500, description: '3 peças, preto.' },
      { name: 'Luminária LED articulada', sku: 'LM-LED-BR', priceCents: 5400, stockTotal: 2000, description: 'Braço articulado, branca.' },
      { name: 'Mochila executiva', sku: 'MC-EX-15', priceCents: 11900, stockTotal: 1800, description: 'Compartimento para notebook de 15".' },
      { name: 'Caderno universitário', sku: 'CD-UN-96', priceCents: 740, stockTotal: 48000, description: '96 folhas, capa dura.' },
  ];
  const products: (typeof schema.products.$inferSelect)[] = [];
  for (const p of productRows) {
    const [row] = await db.insert(schema.products).values({ ...p, brandId: marca.id, minQty: 10, stepQty: 10, blockOverStock: true }).returning();
    products.push(row);
  }
  const bySku = Object.fromEntries(products.map((p) => [p.sku, p]));

  // Daqui a ~1 hora (próxima meia hora cheia): dá para testar a sala de espera e iniciar a live pela Central a qualquer momento.
  const startsAt = new Date(Math.ceil((Date.now() + 3600_000) / 1800_000) * 1800_000);

  const [live] = await db
    .insert(schema.lives)
    .values({
      brandId: marca.id,
      name: 'Lançamento Coleção Verão',
      slug: 'lancamento-colecao-verao',
      startsAt,
      format: 'vertical',
      status: 'scheduled',
      mode: 'auto',
      videoDelayS: 6,
      streamKey: randomBytes(12).toString('hex'),
    })
    .returning();

  // Roteiro da Central (AdminCentral): produto e duração em segundos.
  const lineup: [string, number][] = [
    ['CN-AZ-050', 900],
    ['VT-40-BR', 900],
    ['GT-1L-IN', 600],
    ['KO-3P-PT', 900],
    ['LM-LED-BR', 600],
    ['MC-EX-15', 900],
  ];
  await db.insert(schema.liveItems).values(
    lineup.map(([sku, durationS], i) => ({ liveId: live.id, productId: bySku[sku].id, position: i + 1, durationS })),
  );

  const terms = new Date('2026-03-01T12:00:00Z');
  // "Cliente desde" variado, como no protótipo (AdminEmpresas).
  const companyRows: [string, string, string, string | null, string][] = [
    ['Papelaria Central Ltda', 'compras@papelariacentral.com.br', '(11) 98812-4410', 'São Paulo', '2026-03-04'],
    ['Magazine Bairro Alto', 'compras@bairroalto.com.br', '(15) 99655-0381', 'Sorocaba', '2026-04-10'],
    ['Casa e Cia Utilidades', 'pedidos@casaecia.com.br', '(15) 99731-2208', 'Sorocaba', '2026-05-18'],
    ['Distribuidora Vale Sul', 'suprimentos@valesul.com.br', '(12) 98260-1195', 'São José dos Campos', '2026-06-02'],
    ['Escritório Total ME', 'contato@escritoriototal.com.br', '(11) 97420-6613', 'São Paulo', '2026-08-21'],
    ['Loja do Shopping Norte', 'gerencia@shoppingnorte.com.br', '(19) 99104-7732', 'Campinas', '2026-09-03'],
    ['Mercado Ponto Certo', 'compras@pontocerto.com.br', '(15) 99102-3344', 'Sorocaba', '2026-09-05'],
    ['Bazar Três Irmãos', 'bazar3irmaos@email.com.br', '(11) 96611-2080', null, '2026-09-08'],
  ];
  const companies: (typeof schema.companies.$inferSelect)[] = [];
  for (const [name, email, whatsapp, city, since] of companyRows) {
    const createdAt = new Date(`${since}T15:00:00Z`);
    companies.push((await db.insert(schema.companies).values({ name, email, whatsapp, city, termsAcceptedAt: createdAt < terms ? terms : createdAt, createdAt }).returning())[0]);
  }

  // Live passada (há 12 dias, 14h em Brasília), já encerrada, com pedidos em vários status:
  // dá para testar Pedidos, Empresas e Minha conta sem fazer uma live antes.
  const pastStart = new Date(Date.now() - 12 * 86400_000);
  pastStart.setUTCHours(17, 0, 0, 0);
  const [past] = await db
    .insert(schema.lives)
    .values({
      brandId: marca.id,
      name: 'Volta às Aulas Atacado',
      slug: 'volta-as-aulas-atacado',
      startsAt: pastStart,
      startedAt: pastStart,
      endedAt: new Date(pastStart.getTime() + 52 * 60_000),
      format: 'horizontal',
      status: 'ended',
      mode: 'auto',
      videoDelayS: 6,
      streamKey: randomBytes(12).toString('hex'),
    })
    .returning();
  const pastItems = await db
    .insert(schema.liveItems)
    .values(
      ([['CD-UN-96', 900], ['CN-AZ-050', 900], ['MC-EX-15', 600], ['LM-LED-BR', 600]] as [string, number][]).map(([sku, durationS], i) => ({
        liveId: past.id,
        productId: bySku[sku].id,
        position: i + 1,
        durationS,
      })),
    )
    .returning();
  const itemBySku = Object.fromEntries(pastItems.map((it) => [products.find((p) => p.id === it.productId)!.sku, it]));
  // Quem entrou na live (Mercado Ponto Certo só assistiu; Bazar Três Irmãos não entrou).
  await db.insert(schema.liveAttendance).values(companies.slice(0, 7).map((c) => ({ liveId: past.id, companyId: c.id, firstSeenAt: pastStart })));

  const at = (s: number) => new Date(pastStart.getTime() + s * 1000);
  const day = (d: number, h = 13) => new Date(pastStart.getTime() + d * 86400_000 + (h - 14) * 3600_000);
  // [empresa, [sku, qtd, segundo da live], status]
  const pastOrders: [number, [string, number, number][], 'draft' | 'invoicing' | 'invoiced' | 'delivered' | 'canceled'][] = [
    [0, [['CD-UN-96', 2000, 262], ['CN-AZ-050', 1200, 1138]], 'invoiced'],
    [1, [['CD-UN-96', 5000, 318], ['CN-AZ-050', 5000, 1060], ['MC-EX-15', 100, 1985]], 'draft'],
    [2, [['CN-AZ-050', 2000, 1203], ['LM-LED-BR', 150, 2702]], 'invoicing'],
    [3, [['CD-UN-96', 4000, 401], ['MC-EX-15', 200, 1890], ['LM-LED-BR', 300, 2655]], 'delivered'],
    [4, [['CN-AZ-050', 3000, 1320], ['CD-UN-96', 1000, 745]], 'draft'],
    [5, [['MC-EX-15', 100, 2044]], 'canceled'],
  ];
  const orderIdsByCompany: Record<number, string> = {};
  for (const [ci, lines, status] of pastOrders) {
    const [{ n }] = await db.execute<{ n: string }>(sql`select nextval('order_code_seq') as n`);
    const first = at(Math.min(...lines.map((l) => l[2])));
    const dates = {
      sentToBrandAt: status === 'draft' || status === 'canceled' ? null : day(1),
      invoicingAt: status === 'invoicing' ? day(1, 15) : null,
      invoicedAt: status === 'invoiced' || status === 'delivered' ? day(3) : null,
      deliveredAt: status === 'delivered' ? day(9) : null,
      canceledAt: status === 'canceled' ? day(2) : null,
    };
    const [order] = await db
      .insert(schema.orders)
      .values({ liveId: past.id, companyId: companies[ci].id, code: `#LV-${String(n).padStart(4, '0')}`, status, ...dates, createdAt: first, updatedAt: first })
      .returning();
    orderIdsByCompany[ci] = order.id;
    for (const [sku, qty, offset] of lines) {
      const [oi] = await db
        .insert(schema.orderItems)
        .values({ orderId: order.id, productId: bySku[sku].id, liveItemId: itemBySku[sku].id, qty, unitPriceCents: bySku[sku].priceCents, liveOffsetS: offset, createdAt: at(offset), updatedAt: at(offset) })
        .returning();
      await db.insert(schema.orderItemEvents).values({ orderItemId: oi.id, kind: 'registered', qtyBefore: 0, qtyAfter: qty, liveOffsetS: offset, createdAt: at(offset) });
    }
  }
  // Um chamado já respondido e um aberto (aparece no sininho da Visão geral).
  await db.insert(schema.supportTickets).values([
    { companyId: companies[3].id, orderId: orderIdsByCompany[3], subject: 'Entrega', message: 'Qual o prazo de entrega para São José dos Campos?', status: 'answered', createdAt: day(4), answeredAt: day(4, 16) },
    { companyId: companies[1].id, orderId: orderIdsByCompany[1], subject: 'Fatura e pagamento', message: 'Consigo pagar a fatura em duas vezes?', status: 'open', createdAt: day(10) },
  ]);

  console.log('Seed pronto.');
  console.log(`  Live: /l/${live.slug} (${startsAt.toISOString()})`);
  console.log(`  Live encerrada com pedidos: /l/${past.slug}`);
  console.log('  Admin: admin@agencia.com.br (dona), operacao@agencia.com.br, financeiro@agencia.com.br');
  await sqlClient.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
