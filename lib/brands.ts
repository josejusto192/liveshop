import { sql } from 'drizzle-orm';
import { db } from './db';

export type BrandCard = {
  id: string;
  name: string;
  segment: string | null;
  ordersEmail: string | null;
  lives: number;
  products: number;
  companies: number;
  units: number;
  draftOrders: number;
  live: boolean;
};

// Números dos cards de Marcas, calculados a partir dos pedidos e presenças.
export async function listBrandCards(): Promise<BrandCard[]> {
  const rows = await db.execute<{
    id: string; name: string; segment: string | null; orders_email: string | null;
    lives: number; products: number; companies: number; units: number; draft_orders: number; live: boolean;
  }>(sql`
    select b.id, b.name, b.segment, b.orders_email,
      (select count(*)::int from lives l where l.brand_id = b.id) as lives,
      (select count(*)::int from products p where p.brand_id = b.id and p.active) as products,
      (select count(distinct x.company_id)::int from (
          select a.company_id from live_attendance a join lives l on l.id = a.live_id where l.brand_id = b.id
          union
          select o.company_id from orders o join lives l on l.id = o.live_id where l.brand_id = b.id
        ) x) as companies,
      (select coalesce(sum(oi.qty), 0)::int from order_items oi join orders o on o.id = oi.order_id
         join lives l on l.id = o.live_id where l.brand_id = b.id and oi.canceled_at is null and o.status <> 'canceled') as units,
      (select count(*)::int from orders o join lives l on l.id = o.live_id where l.brand_id = b.id and o.status = 'draft'
         and exists (select 1 from order_items oi where oi.order_id = o.id and oi.canceled_at is null)) as draft_orders,
      exists (select 1 from lives l where l.brand_id = b.id and l.status = 'live') as live
    from brands b
    order by exists (select 1 from lives l where l.brand_id = b.id and l.status = 'live') desc, b.created_at, b.name
  `);
  return rows.map((r) => ({
    id: r.id, name: r.name, segment: r.segment, ordersEmail: r.orders_email,
    lives: r.lives, products: r.products, companies: r.companies, units: r.units, draftOrders: r.draft_orders, live: r.live,
  }));
}

export function initials(name: string) {
  const w = name.trim().split(/\s+/);
  return ((w[0]?.[0] ?? '') + (w[1]?.[0] ?? '')).toUpperCase();
}
