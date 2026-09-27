// Espelha docs/05-banco-de-dados.md. Dinheiro em centavos, datas em timestamptz.
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  check,
  index,
  inet,
  integer,
  pgEnum,
  pgSequence,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const adminRole = pgEnum('admin_role', ['owner', 'operator', 'finance']);
export const liveStatus = pgEnum('live_status', ['draft', 'scheduled', 'live', 'ended']);
export const liveFormat = pgEnum('live_format', ['horizontal', 'vertical']);
export const switchMode = pgEnum('switch_mode', ['auto', 'manual']);
export const itemStatus = pgEnum('item_status', ['queued', 'on_air', 'presented']);
export const orderStatus = pgEnum('order_status', ['draft', 'invoicing', 'invoiced', 'delivered', 'canceled']);
export const ticketStatus = pgEnum('ticket_status', ['open', 'answered', 'closed']);

// Agência
export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: adminRole('role').notNull().default('operator'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const settings = pgTable(
  'settings',
  {
    id: integer('id').primaryKey().default(1),
    platformName: text('platform_name').notNull().default('Live Shop'),
    accentColor: text('accent_color').notNull().default('#D6F35B'),
    logoUrl: text('logo_url'),
    defaultVideoDelayS: integer('default_video_delay_s').notNull().default(6),
    otpTtlMin: integer('otp_ttl_min').notNull().default(10),
    mailFromName: text('mail_from_name'),
    mailFromEmail: text('mail_from_email'),
    mailSubject: text('mail_subject'),
    // Texto do prazo da fatura mostrado ao comprador (pergunta em aberto: padrão "em até 5 dias úteis").
    invoiceDeadline: text('invoice_deadline').notNull().default('em até 5 dias úteis'),
  },
  (t) => [check('settings_single_row', sql`${t.id} = 1`)],
);

export const brands = pgTable('brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  segment: text('segment'),
  ordersEmail: text('orders_email'),
  logoUrl: text('logo_url'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandId: uuid('brand_id').notNull().references(() => brands.id),
    name: text('name').notNull(),
    sku: text('sku').notNull(),
    description: text('description'),
    imageUrl: text('image_url'),
    priceCents: integer('price_cents').notNull(),
    stockTotal: integer('stock_total').notNull(),
    minQty: integer('min_qty').notNull().default(10),
    stepQty: integer('step_qty').notNull().default(10),
    blockOverStock: boolean('block_over_stock').notNull().default(true),
    active: boolean('active').notNull().default(true),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('products_brand_sku').on(t.brandId, t.sku),
    check('products_price_cents', sql`${t.priceCents} >= 0`),
    check('products_stock_total', sql`${t.stockTotal} >= 0`),
    check('products_min_qty', sql`${t.minQty} > 0`),
    check('products_step_qty', sql`${t.stepQty} > 0`),
  ],
);

// Lives
export const lives = pgTable(
  'lives',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandId: uuid('brand_id').notNull().references(() => brands.id),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    startsAt: ts('starts_at').notNull(),
    format: liveFormat('format').notNull().default('horizontal'),
    status: liveStatus('status').notNull().default('draft'),
    mode: switchMode('mode').notNull().default('auto'),
    videoDelayS: integer('video_delay_s').notNull().default(6),
    showTimer: boolean('show_timer').notNull().default(true),
    showActivity: boolean('show_activity').notNull().default(true),
    streamKey: text('stream_key').notNull().unique(),
    currentItemId: uuid('current_item_id').references((): AnyPgColumn => liveItems.id),
    itemStartedAt: ts('item_started_at'),
    pausedAt: ts('paused_at'),
    extraMs: integer('extra_ms').notNull().default(0),
    itemHidden: boolean('item_hidden').notNull().default(false),
    startedAt: ts('started_at'),
    endedAt: ts('ended_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [check('lives_video_delay_s', sql`${t.videoDelayS} between 0 and 15`)],
);

export const liveItems = pgTable(
  'live_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    liveId: uuid('live_id')
      .notNull()
      .references(() => lives.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    position: integer('position').notNull(),
    durationS: integer('duration_s').notNull().default(900),
    status: itemStatus('status').notNull().default('queued'),
    firstAiredAt: ts('first_aired_at'),
  },
  (t) => [
    unique('live_items_live_product').on(t.liveId, t.productId),
    check('live_items_duration_s', sql`${t.durationS} between 300 and 3600`),
  ],
);

// Compradores
export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(), // sempre minúsculo
  whatsapp: text('whatsapp').notNull(),
  cnpj: text('cnpj'),
  contactName: text('contact_name'),
  cep: text('cep'),
  address: text('address'),
  city: text('city'),
  notifyEmail: boolean('notify_email').notNull().default(true),
  notifyWhatsapp: boolean('notify_whatsapp').notNull().default(true),
  termsAcceptedAt: ts('terms_accepted_at').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const otpCodes = pgTable(
  'otp_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    subject: text('subject').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: ts('expires_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    usedAt: ts('used_at'),
    invalidatedAt: ts('invalidated_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    ip: inet('ip'),
  },
  (t) => [
    index('otp_codes_email_created_at_idx').on(t.email, t.createdAt.desc()),
    check('otp_codes_subject', sql`${t.subject} in ('company', 'admin')`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    companyId: uuid('company_id').references(() => companies.id),
    adminUserId: uuid('admin_user_id').references(() => adminUsers.id),
    expiresAt: ts('expires_at').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [check('sessions_one_owner', sql`(${t.companyId} is null) <> (${t.adminUserId} is null)`)],
);

// Link de uso único (QR code da Central) que abre a tela Transmitir no celular já logado.
export const loginLinks = pgTable('login_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull().unique(),
  adminUserId: uuid('admin_user_id')
    .notNull()
    .references(() => adminUsers.id),
  liveId: uuid('live_id').references(() => lives.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const liveAttendance = pgTable(
  'live_attendance',
  {
    liveId: uuid('live_id').references(() => lives.id),
    companyId: uuid('company_id').references(() => companies.id),
    firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.liveId, t.companyId] })],
);

// Pedidos
// Código legível do pedido: #LV-0001, #LV-0002…
export const orderCodeSeq = pgSequence('order_code_seq', { startWith: 1 });

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(), // #LV-0001
    liveId: uuid('live_id')
      .notNull()
      .references(() => lives.id),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    status: orderStatus('status').notNull().default('draft'),
    invoiceUrl: text('invoice_url'),
    sentToBrandAt: ts('sent_to_brand_at'),
    invoicingAt: ts('invoicing_at'),
    invoicedAt: ts('invoiced_at'),
    deliveredAt: ts('delivered_at'),
    canceledAt: ts('canceled_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('orders_live_company').on(t.liveId, t.companyId)],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    liveItemId: uuid('live_item_id').references(() => liveItems.id),
    qty: integer('qty').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(), // preço congelado no registro
    liveOffsetS: integer('live_offset_s').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    canceledAt: ts('canceled_at'),
  },
  (t) => [unique('order_items_order_product').on(t.orderId, t.productId), check('order_items_qty', sql`${t.qty} > 0`)],
);

export const orderItemEvents = pgTable(
  'order_item_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id),
    kind: text('kind').notNull(),
    qtyBefore: integer('qty_before'),
    qtyAfter: integer('qty_after'),
    liveOffsetS: integer('live_offset_s'),
    byCompany: boolean('by_company').notNull().default(true),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [check('order_item_events_kind', sql`${t.kind} in ('registered', 'added', 'changed', 'canceled')`)],
);

// A view é criada na migração 0001 (SQL manual); aqui só descrevemos as colunas.
export const productStock = pgView('product_stock', {
  productId: uuid('product_id').notNull(),
  stockTotal: integer('stock_total').notNull(),
  reserved: integer('reserved').notNull(),
  available: integer('available').notNull(),
}).existing();

export const stockAlerts = pgTable(
  'stock_alerts',
  {
    productId: uuid('product_id').references(() => products.id),
    companyId: uuid('company_id').references(() => companies.id),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.companyId] })],
);

// Suporte
export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id')
    .notNull()
    .references(() => companies.id),
  orderId: uuid('order_id').references(() => orders.id),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  status: ticketStatus('status').notNull().default('open'),
  createdAt: ts('created_at').notNull().defaultNow(),
  answeredAt: ts('answered_at'),
});

export type AdminRole = (typeof adminRole.enumValues)[number];
export type Product = typeof products.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type Settings = typeof settings.$inferSelect;
