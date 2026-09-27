// Números da Visão geral (AdminLives).
import { sql } from 'drizzle-orm';
import { db } from './db';
import { TZ } from './dates';
import { viewerCount } from './events';

export type MonthKey = { year: number; month: number }; // month 1-12

export function parseMonth(v: string | undefined, now = new Date()): MonthKey {
  const m = v?.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const month = Number(m[2]);
    if (month >= 1 && month <= 12) return { year: Number(m[1]), month };
  }
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).formatToParts(now);
  return { year: Number(p.find((x) => x.type === 'year')!.value), month: Number(p.find((x) => x.type === 'month')!.value) };
}

export const monthKeyStr = (k: MonthKey) => `${k.year}-${String(k.month).padStart(2, '0')}`;
export const shiftMonth = (k: MonthKey, d: number): MonthKey => {
  const idx = k.year * 12 + (k.month - 1) + d;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
};
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const monthLabel = (k: MonthKey) => `${MONTHS[k.month - 1]} ${k.year}`;

// Limites do mês em Brasília (fuso fixo -03:00).
function bounds(k: MonthKey) {
  const next = shiftMonth(k, 1);
  const s = `${k.year}-${String(k.month).padStart(2, '0')}-01T00:00:00-03:00`;
  const e = `${next.year}-${String(next.month).padStart(2, '0')}-01T00:00:00-03:00`;
  return { start: new Date(s), end: new Date(e) };
}

export async function dashboard(k: MonthKey) {
  const { start, end } = bounds(k);
  const prev = bounds(shiftMonth(k, -1));

  const [liveNow] = await db.execute<{
    id: string; name: string; started_at: string; position: number | null; total: number;
  }>(sql`
    select l.id, l.name, l.started_at,
      (select li.position from live_items li where li.id = l.current_item_id) as position,
      (select count(*)::int from live_items li where li.live_id = l.id) as total
    from lives l where l.status = 'live' order by l.started_at desc limit 1`);

  const [nextLive] = liveNow
    ? [undefined]
    : await db.execute<{ id: string; name: string; starts_at: string }>(sql`
        select id, name, starts_at from lives where status = 'scheduled' order by starts_at asc limit 1`);

  const unitsIn = async (s: Date, e: Date) => {
    const [r] = await db.execute<{ units: number }>(sql`
      select coalesce(sum(oi.qty), 0)::int as units from order_items oi join orders o on o.id = oi.order_id
      where oi.canceled_at is null and o.status <> 'canceled' and oi.created_at >= ${s.toISOString()} and oi.created_at < ${e.toISOString()}`);
    return r?.units ?? 0;
  };
  const [units, unitsPrev] = await Promise.all([unitsIn(start, end), unitsIn(prev.start, prev.end)]);

  // Conversão: a live no ar ou a última encerrada.
  const [conv] = await db.execute<{ id: string; buying: number; total: number }>(sql`
    with l as (
      select id from lives where status in ('live', 'ended') order by (status = 'live') desc, coalesce(started_at, starts_at) desc limit 1
    )
    select l.id,
      (select count(distinct o.company_id)::int from orders o join order_items oi on oi.order_id = o.id and oi.canceled_at is null where o.live_id = l.id) as buying,
      (select count(distinct x.company_id)::int from (
        select a.company_id from live_attendance a where a.live_id = l.id
        union select o.company_id from orders o where o.live_id = l.id) x) as total
    from l`);

  const [draft] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from orders o where o.status = 'draft'
      and exists (select 1 from order_items oi where oi.order_id = o.id and oi.canceled_at is null)`);

  const bars = await db.execute<{ id: string; name: string; starts_at: string; status: string; units: number; offered: number }>(sql`
    select l.id, l.name, coalesce(l.started_at, l.starts_at) as starts_at, l.status,
      (select coalesce(sum(oi.qty), 0)::int from order_items oi join orders o on o.id = oi.order_id where o.live_id = l.id and oi.canceled_at is null) as units,
      (select coalesce(sum(p.stock_total), 0)::int from live_items li join products p on p.id = li.product_id where li.live_id = l.id) as offered
    from lives l where l.status in ('live', 'ended')
    order by coalesce(l.started_at, l.starts_at) desc limit 10`);

  const top = await db.execute<{ product_id: string; name: string; image_url: string | null; units: number }>(sql`
    select p.id as product_id, p.name, p.image_url, sum(oi.qty)::int as units
    from order_items oi join orders o on o.id = oi.order_id join products p on p.id = oi.product_id
    where oi.canceled_at is null and o.status <> 'canceled' and oi.created_at >= ${start.toISOString()} and oi.created_at < ${end.toISOString()}
    group by p.id, p.name, p.image_url order by units desc limit 4`);

  return {
    liveNow: liveNow
      ? { id: liveNow.id, name: liveNow.name, startedAt: new Date(liveNow.started_at), position: liveNow.position, total: liveNow.total, viewers: viewerCount(liveNow.id) }
      : null,
    nextLive: nextLive ? { id: nextLive.id, name: nextLive.name, startsAt: new Date(nextLive.starts_at) } : null,
    units,
    unitsPrev,
    conversion: conv ? { buying: conv.buying, total: conv.total } : null,
    draftOrders: draft?.n ?? 0,
    bars: bars.reverse().map((b) => ({ id: b.id, name: b.name, at: new Date(b.starts_at), live: b.status === 'live', units: b.units, offered: b.offered })),
    top: top.map((t) => ({ productId: t.product_id, name: t.name, imageUrl: t.image_url, units: t.units })),
  };
}
export type Dashboard = Awaited<ReturnType<typeof dashboard>>;
