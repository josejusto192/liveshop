import { sql } from 'drizzle-orm';
import { requireAdminPage } from '@/lib/auth';
import { db } from '@/lib/db';
import { can } from '@/lib/permissions';
import { lineKpis, linesPerMinute, listOrderLines, parseOrderFilters, tabCounts } from '@/lib/admin-orders';
import { PedidosView } from './PedidosView';

// A tabela mostra até 1.000 linhas; as exportações levam todas as linhas do filtro.
const SHOW = 1000;

export default async function Pedidos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdminPage('orders:read');
  const raw = await searchParams;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') sp.set(k, v);
  const f = parseOrderFilters(sp);
  f.ids = null;

  // Live padrão: a mais recente que já começou, a menos que tenha escolhido "Todas" ou venha de uma marca/empresa.
  if (!f.liveId && sp.get('liveId') !== 'all' && !f.brandId && !f.companyId && !f.q) {
    const [l] = await db.execute<{ id: string }>(sql`select id from lives where started_at is not null order by started_at desc limit 1`);
    if (l) f.liveId = l.id;
  }

  const [lines, counts, perMinute, kpis, lives, products, names] = await Promise.all([
    listOrderLines(f, SHOW),
    tabCounts(f),
    linesPerMinute(f),
    lineKpis(f),
    db.execute<{ id: string; name: string; status: string; at: string; duration_s: number | null }>(sql`
      select l.id, l.name, l.status, coalesce(l.started_at, l.starts_at) as at,
        case when l.started_at is null then null else extract(epoch from coalesce(l.ended_at, now()) - l.started_at)::int end as duration_s
      from lives l
      where l.started_at is not null or exists (select 1 from orders o where o.live_id = l.id)
      order by coalesce(l.started_at, l.starts_at) desc limit 100`),
    db.execute<{ id: string; name: string }>(sql`
      select distinct p.id, p.name from order_items oi
      join orders o on o.id = oi.order_id join products p on p.id = oi.product_id join lives l on l.id = o.live_id
      where oi.canceled_at is null
        ${f.liveId ? sql`and o.live_id = ${f.liveId}` : sql``}
        ${f.brandId ? sql`and l.brand_id = ${f.brandId}` : sql``}
      order by p.name limit 300`),
    db.execute<{ brand: string | null; company: string | null }>(sql`
      select (select name from brands where id = ${f.brandId}) as brand, (select name from companies where id = ${f.companyId}) as company`),
  ]);

  const live = lives.find((l) => l.id === f.liveId);
  return (
    <PedidosView
      filters={f}
      lines={lines}
      counts={counts}
      perMinute={perMinute}
      kpis={kpis}
      lives={lives.map((l) => ({ id: l.id, name: l.name, status: l.status }))}
      products={products.map((p) => ({ id: p.id, name: p.name }))}
      brandName={names[0]?.brand ?? null}
      companyName={names[0]?.company ?? null}
      liveDurationS={live?.duration_s ?? Math.max(0, perMinute.length - 1) * 60}
      canStatus={can(admin.role, 'orders:status')}
      canExport={can(admin.role, 'orders:export')}
      shown={SHOW}
    />
  );
}
