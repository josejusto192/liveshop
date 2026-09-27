// Empresas compradoras (AdminEmpresas): lista com números, detalhe com histórico e exportação.
import ExcelJS from 'exceljs';
import { sql } from 'drizzle-orm';
import { db } from './db';
import { TZ } from './dates';

export type CompanySeg = 'all' | 'buyers' | 'watchers';

export function parseCompanyFilters(sp: URLSearchParams) {
  const s = sp.get('seg');
  const seg: CompanySeg = s === 'buyers' || s === 'watchers' ? s : 'all';
  return { seg, q: (sp.get('q') ?? '').trim().slice(0, 100) };
}

// Pedidos e unidades contam só itens ativos de pedidos não cancelados.
const STATS = sql`
  left join lateral (
    select count(distinct o.id)::int as orders, coalesce(sum(oi.qty), 0)::int as units, coalesce(sum(oi.qty::bigint * oi.unit_price_cents), 0)::bigint as cents
    from orders o join order_items oi on oi.order_id = o.id and oi.canceled_at is null
    where o.company_id = c.id and o.status <> 'canceled'
  ) s on true
  left join lateral (
    select count(*)::int as lives from (
      select live_id from live_attendance where company_id = c.id
      union select live_id from orders where company_id = c.id
    ) t
  ) v on true`;

export type CompanyRow = { id: string; name: string; email: string; whatsapp: string; city: string | null; createdAt: string; lives: number; orders: number; units: number; cents: number };

export async function listCompanies(f: { seg: CompanySeg; q: string }, limit = 1000): Promise<CompanyRow[]> {
  const cond = [sql`true`];
  if (f.seg === 'buyers') cond.push(sql`s.orders > 0`);
  if (f.seg === 'watchers') cond.push(sql`s.orders = 0 and v.lives > 0`);
  if (f.q) {
    const like = `%${f.q.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const digits = f.q.replace(/\D/g, '');
    cond.push(
      digits.length >= 4
        ? sql`(lower(c.name) like ${like} or c.email like ${like} or regexp_replace(c.whatsapp, '\\D', '', 'g') like ${`%${digits}%`})`
        : sql`(lower(c.name) like ${like} or c.email like ${like})`,
    );
  }
  const rows = await db.execute<{ id: string; name: string; email: string; whatsapp: string; city: string | null; created_at: string; lives: number; orders: number; units: number; cents: string }>(sql`
    select c.id, c.name, c.email, c.whatsapp, c.city, c.created_at, v.lives, s.orders, s.units, s.cents
    from companies c ${STATS}
    where ${sql.join(cond, sql` and `)}
    order by s.units desc, v.lives desc, c.created_at desc
    limit ${limit}`);
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, whatsapp: r.whatsapp, city: r.city, createdAt: new Date(r.created_at).toISOString(), lives: r.lives, orders: r.orders, units: r.units, cents: Number(r.cents) }));
}

export async function companyKpis(now = new Date()) {
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(now); // 2026-09
  const [r] = await db.execute<{ total: number; buyers: number; watchers: number; fresh: number }>(sql`
    select count(*)::int as total,
      count(*) filter (where s.orders > 0)::int as buyers,
      count(*) filter (where s.orders = 0 and v.lives > 0)::int as watchers,
      count(*) filter (where to_char(c.created_at at time zone ${TZ}, 'YYYY-MM') = ${month})::int as fresh
    from companies c ${STATS}`);
  return { total: r?.total ?? 0, buyers: r?.buyers ?? 0, watchers: r?.watchers ?? 0, fresh: r?.fresh ?? 0 };
}

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "mar 2026" */
export function sinceLabel(d: Date) {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(d).split('-');
  return `${MONTHS_SHORT[Number(m) - 1]} ${y}`;
}

export async function companyDetail(id: string, now = new Date()) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [c] = await db.execute<{ id: string; name: string; email: string; whatsapp: string; cnpj: string | null; contact_name: string | null; city: string | null; address: string | null; cep: string | null; created_at: string; lives: number; orders: number; units: number; cents: string }>(sql`
    select c.id, c.name, c.email, c.whatsapp, c.cnpj, c.contact_name, c.city, c.address, c.cep, c.created_at, v.lives, s.orders, s.units, s.cents
    from companies c ${STATS} where c.id = ${id}`);
  if (!c) return null;
  const hist = await db.execute<{ id: string; name: string; status: string; at: string; products: number; units: number }>(sql`
    select l.id, l.name, l.status, coalesce(l.started_at, l.starts_at) as at,
      count(oi.id) filter (where oi.canceled_at is null and o.status <> 'canceled')::int as products,
      coalesce(sum(oi.qty) filter (where oi.canceled_at is null and o.status <> 'canceled'), 0)::int as units
    from lives l
    left join orders o on o.live_id = l.id and o.company_id = ${id}
    left join order_items oi on oi.order_id = o.id
    where l.id in (select live_id from live_attendance where company_id = ${id} union select live_id from orders where company_id = ${id})
    group by l.id order by coalesce(l.started_at, l.starts_at) desc limit 30`);
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    whatsapp: c.whatsapp,
    cnpj: c.cnpj,
    contactName: c.contact_name,
    city: c.city,
    address: c.address,
    cep: c.cep,
    since: sinceLabel(new Date(c.created_at)),
    lives: c.lives,
    orders: c.orders,
    units: c.units,
    cents: Number(c.cents),
    history: hist.map((h) => {
      const at = new Date(h.at);
      return {
        liveId: h.id,
        live: h.name,
        onAir: h.status === 'live',
        date: day(at) === day(now) ? 'hoje' : new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(at),
        products: h.products,
        units: h.units,
      };
    }),
  };
}
export type CompanyDetail = NonNullable<Awaited<ReturnType<typeof companyDetail>>>;

export async function companiesXlsx(f: { seg: CompanySeg; q: string }): Promise<Buffer> {
  const ids = (await listCompanies(f, 100000)).map((r) => r.id);
  const rows = ids.length
    ? await db.execute<{ name: string; cnpj: string | null; email: string; whatsapp: string; contact_name: string | null; city: string | null; cep: string | null; address: string | null; created_at: string; lives: number; orders: number; units: number; cents: string; notify_email: boolean; notify_whatsapp: boolean }>(sql`
        select c.name, c.cnpj, c.email, c.whatsapp, c.contact_name, c.city, c.cep, c.address, c.created_at, c.notify_email, c.notify_whatsapp, v.lives, s.orders, s.units, s.cents
        from companies c ${STATS} where c.id in (${sql.join(ids.map((x) => sql`${x}::uuid`), sql`, `)})
        order by s.units desc, v.lives desc, c.created_at desc`)
    : [];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Empresas', { views: [{ state: 'frozen', ySplit: 1 }] });
  const headers = ['Empresa', 'CNPJ', 'E-mail', 'WhatsApp', 'Responsável', 'Cidade', 'CEP', 'Endereço', 'Cliente desde', 'Lives', 'Pedidos', 'Unidades', 'Valor estimado', 'Recebe e-mail', 'Recebe WhatsApp'];
  ws.columns = [{ width: 30 }, { width: 20 }, { width: 32 }, { width: 18 }, { width: 22 }, { width: 18 }, { width: 11 }, { width: 36 }, { width: 14 }, { width: 8 }, { width: 9 }, { width: 11 }, { width: 16 }, { width: 13 }, { width: 16 }];
  ws.addRow(headers).font = { bold: true };
  for (const r of rows) {
    const row = ws.addRow([
      r.name, r.cnpj ?? '', r.email, r.whatsapp, r.contact_name ?? '', r.city ?? '', r.cep ?? '', r.address ?? '',
      new Intl.DateTimeFormat('pt-BR', { timeZone: TZ }).format(new Date(r.created_at)),
      r.lives, r.orders, r.units, Number(r.cents) / 100, r.notify_email ? 'Sim' : 'Não', r.notify_whatsapp ? 'Sim' : 'Não',
    ]);
    row.getCell(12).numFmt = '#,##0';
    row.getCell(13).numFmt = '"R$" #,##0.00';
  }
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: headers.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
