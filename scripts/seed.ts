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
    sessions, otp_codes, live_items, lives, products, brands, companies, admin_users, settings
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
  const products = [];
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
  await db.insert(schema.companies).values(
    [
      ['Papelaria Central Ltda', 'compras@papelariacentral.com.br', '(11) 98812-4410', 'São Paulo'],
      ['Magazine Bairro Alto', 'compras@bairroalto.com.br', '(15) 99655-0381', 'Sorocaba'],
      ['Casa e Cia Utilidades', 'pedidos@casaecia.com.br', '(15) 99731-2208', 'Sorocaba'],
      ['Distribuidora Vale Sul', 'suprimentos@valesul.com.br', '(12) 98260-1195', 'São José dos Campos'],
      ['Escritório Total ME', 'contato@escritoriototal.com.br', '(11) 97420-6613', 'São Paulo'],
      ['Loja do Shopping Norte', 'gerencia@shoppingnorte.com.br', '(19) 99104-7732', 'Campinas'],
      ['Mercado Ponto Certo', 'compras@pontocerto.com.br', '(15) 99102-3344', 'Sorocaba'],
      ['Bazar Três Irmãos', 'bazar3irmaos@email.com.br', '(11) 96611-2080', null],
    ].map(([name, email, whatsapp, city]) => ({ name: name!, email: email!, whatsapp: whatsapp!, city, termsAcceptedAt: terms })),
  );

  console.log('Seed pronto.');
  console.log(`  Live: /l/${live.slug} (${startsAt.toISOString()})`);
  console.log('  Admin: admin@agencia.com.br (dona), operacao@agencia.com.br, financeiro@agencia.com.br');
  await sqlClient.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
