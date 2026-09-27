# 05. Banco de dados (PostgreSQL)

Referência em SQL. Implementar em Drizzle com os mesmos nomes. Valores em dinheiro em **centavos** (`integer`). Datas em `timestamptz`.

```sql
create type admin_role as enum ('owner', 'operator', 'finance');
create type live_status as enum ('draft', 'scheduled', 'live', 'ended');
create type live_format as enum ('horizontal', 'vertical');
create type switch_mode as enum ('auto', 'manual');
create type item_status as enum ('queued', 'on_air', 'presented');
create type order_status as enum ('draft', 'invoicing', 'invoiced', 'delivered', 'canceled');
create type ticket_status as enum ('open', 'answered', 'closed');

-- Agência
create table admin_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  role admin_role not null default 'operator',
  created_at timestamptz not null default now()
);

create table settings (            -- linha única
  id int primary key default 1 check (id = 1),
  platform_name text not null default 'Live Shop',
  accent_color text not null default '#D6F35B',
  logo_url text,
  default_video_delay_s int not null default 6,
  otp_ttl_min int not null default 10,
  mail_from_name text, mail_from_email text, mail_subject text
);

create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  segment text,
  orders_email text,               -- para onde vai o PDF de pedidos
  logo_url text,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  name text not null,
  sku text not null,
  description text,
  image_url text,
  price_cents int not null check (price_cents >= 0),
  stock_total int not null check (stock_total >= 0),
  min_qty int not null default 10 check (min_qty > 0),
  step_qty int not null default 10 check (step_qty > 0),
  block_over_stock boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (brand_id, sku)
);

-- Lives
create table lives (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id),
  name text not null,
  slug text not null unique,
  starts_at timestamptz not null,
  format live_format not null default 'horizontal',
  status live_status not null default 'draft',
  mode switch_mode not null default 'auto',
  video_delay_s int not null default 6 check (video_delay_s between 0 and 15),
  show_timer boolean not null default true,
  show_activity boolean not null default true,
  stream_key text not null unique,
  current_item_id uuid,            -- fk para live_items (adicionar depois de criar a tabela)
  item_started_at timestamptz,
  paused_at timestamptz,
  extra_ms int not null default 0, -- +5 min acumulado no item atual
  item_hidden boolean not null default false,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table live_items (
  id uuid primary key default gen_random_uuid(),
  live_id uuid not null references lives(id) on delete cascade,
  product_id uuid not null references products(id),
  position int not null,
  duration_s int not null default 900 check (duration_s between 300 and 3600),
  status item_status not null default 'queued',
  first_aired_at timestamptz,
  unique (live_id, product_id)
);
alter table lives add foreign key (current_item_id) references live_items(id);

-- Compradores
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,      -- sempre minúsculo
  whatsapp text not null,
  cnpj text,
  contact_name text,
  cep text, address text, city text,
  notify_email boolean not null default true,
  notify_whatsapp boolean not null default true,
  terms_accepted_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table otp_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  subject text not null check (subject in ('company', 'admin')),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  used_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  ip inet
);
create index on otp_codes (email, created_at desc);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  company_id uuid references companies(id),
  admin_user_id uuid references admin_users(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check ((company_id is null) <> (admin_user_id is null))
);

create table live_attendance (       -- quem entrou em cada live (conversão e "só assistiram")
  live_id uuid references lives(id),
  company_id uuid references companies(id),
  first_seen_at timestamptz not null default now(),
  primary key (live_id, company_id)
);

-- Pedidos
create table orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,       -- #LV-0001
  live_id uuid not null references lives(id),
  company_id uuid not null references companies(id),
  status order_status not null default 'draft',
  invoice_url text,
  sent_to_brand_at timestamptz, invoicing_at timestamptz, invoiced_at timestamptz,
  delivered_at timestamptz, canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (live_id, company_id)
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  live_item_id uuid references live_items(id),
  qty int not null check (qty > 0),
  unit_price_cents int not null,   -- preço congelado no registro
  live_offset_s int not null,      -- segundos desde o início da live no 1º registro ("minuto")
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  canceled_at timestamptz,
  unique (order_id, product_id)
);

create table order_item_events (     -- auditoria: registrado, alterado, excluído
  id bigserial primary key,
  order_item_id uuid not null references order_items(id),
  kind text not null check (kind in ('registered', 'added', 'changed', 'canceled')),
  qty_before int, qty_after int,
  live_offset_s int,
  by_company boolean not null default true,
  created_at timestamptz not null default now()
);

create view product_stock as
select p.id as product_id,
       p.stock_total,
       coalesce(sum(oi.qty) filter (where oi.canceled_at is null), 0)::int as reserved,
       p.stock_total - coalesce(sum(oi.qty) filter (where oi.canceled_at is null), 0)::int as available
from products p
left join order_items oi on oi.product_id = p.id
group by p.id;

create table stock_alerts (
  product_id uuid references products(id),
  company_id uuid references companies(id),
  created_at timestamptz not null default now(),
  primary key (product_id, company_id)
);

-- Suporte
create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  order_id uuid references orders(id),
  subject text not null,
  message text not null,
  status ticket_status not null default 'open',
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
```

## Observações

- `product_stock.available` é a base da validação e do evento `stock`. Dentro da transação de registro, recalcular com `SELECT ... FROM products WHERE id = $1 FOR UPDATE` antes de somar.
- O estoque é por produto, não por live. Se o mesmo produto entrar em duas lives, divide o mesmo estoque.
- `live_offset_s` = `now() - lives.started_at` no primeiro registro do item. Na tela: `mm:ss`.
- Seed (`pnpm db:seed`) deve criar os dados do protótipo: Marca Exemplo, Cliente B, Cliente C; os 7 produtos com preços (caneta R$ 0,89, ventilador R$ 89,90, garrafa R$ 32,50, kit organizador R$ 24,90, luminária R$ 54,00, mochila R$ 119,00, caderno R$ 7,40) e estoques; a live "Lançamento Coleção Verão" com 6 itens; e as empresas de exemplo.
