-- Estoque disponível por produto (docs/05-banco-de-dados.md).
create view product_stock as
select p.id as product_id,
       p.stock_total,
       coalesce(sum(oi.qty) filter (where oi.canceled_at is null), 0)::int as reserved,
       p.stock_total - coalesce(sum(oi.qty) filter (where oi.canceled_at is null), 0)::int as available
from products p
left join order_items oi on oi.product_id = p.id
group by p.id;
