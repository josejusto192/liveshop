-- Pedido cancelado pela agência devolve o estoque (os itens deixam de contar como reservados).
create or replace view product_stock as
select p.id as product_id,
       p.stock_total,
       coalesce(sum(oi.qty) filter (where oi.canceled_at is null and o.status <> 'canceled'), 0)::int as reserved,
       p.stock_total - coalesce(sum(oi.qty) filter (where oi.canceled_at is null and o.status <> 'canceled'), 0)::int as available
from products p
left join order_items oi on oi.product_id = p.id
left join orders o on o.id = oi.order_id
group by p.id;
--> statement-breakpoint
create index if not exists support_tickets_status_idx on support_tickets (status, created_at);
--> statement-breakpoint
create index if not exists orders_status_idx on orders (status);
