// Criação, edição e listagem de lives no painel.
import { randomBytes } from 'node:crypto';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { db, schema } from './db';
import { replaceLineup, validateLineup, type LineupInput } from './live-control';

export function slugify(s: string) {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'live'
  );
}

async function uniqueSlug(base: string) {
  let slug = base;
  for (let i = 2; ; i++) {
    const [row] = await db.select({ id: schema.lives.id }).from(schema.lives).where(eq(schema.lives.slug, slug));
    if (!row) return slug;
    slug = `${base}-${i}`;
  }
}

export const newStreamKey = () => randomBytes(24).toString('hex');

export type LiveInput = {
  name: string;
  brandId: string;
  startsAt: Date;
  format: 'horizontal' | 'vertical';
  mode: 'auto' | 'manual';
  videoDelayS: number;
  showTimer: boolean;
  showActivity: boolean;
};

export type FieldErrors = Record<string, string>;

/** Data e hora digitadas no painel, no fuso de Brasília. */
// simplificação: fuso fixo -03:00 (Brasília não tem horário de verão desde 2019), trocar por fuso configurável quando houver agência em outro fuso
export function parseLocalDateTime(date: unknown, time: unknown): Date | null {
  if (typeof date !== 'string' || typeof time !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const d = new Date(`${date}T${time}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseLiveInput(b: Record<string, unknown>, partial = false): { ok: true; value: Partial<LiveInput> } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const v: Partial<LiveInput> = {};
  const has = (k: string) => b[k] !== undefined;

  if (!partial || has('name')) {
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!name) errors.name = 'Informe o nome da live.';
    else v.name = name;
  }
  if (!partial || has('brandId')) {
    if (typeof b.brandId !== 'string' || !b.brandId) errors.brandId = 'Escolha a marca.';
    else v.brandId = b.brandId;
  }
  if (!partial || has('date') || has('time')) {
    const d = parseLocalDateTime(b.date, b.time);
    if (!d) errors.date = 'Informe data e horário de início.';
    else v.startsAt = d;
  }
  if (!partial || has('format')) {
    if (b.format !== 'horizontal' && b.format !== 'vertical') errors.format = 'Escolha o formato.';
    else v.format = b.format;
  }
  if (!partial || has('mode')) {
    if (b.mode !== 'auto' && b.mode !== 'manual') errors.mode = 'Escolha o modo de troca.';
    else v.mode = b.mode;
  }
  if (!partial || has('videoDelayS')) {
    const n = Number(b.videoDelayS);
    if (!Number.isInteger(n) || n < 0 || n > 15) errors.videoDelayS = 'Atraso entre 0 e 15 segundos.';
    else v.videoDelayS = n;
  }
  if (!partial || has('showTimer')) v.showTimer = b.showTimer !== false;
  if (!partial || has('showActivity')) v.showActivity = b.showActivity !== false;
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: v };
}

export async function createLive(input: LiveInput, lineup: LineupInput, status: 'draft' | 'scheduled') {
  const lineupErr = validateLineup(lineup);
  if (lineupErr) return { ok: false as const, errors: { items: lineupErr } };
  if (status === 'scheduled' && !lineup.length) return { ok: false as const, errors: { items: 'Adicione pelo menos um produto ao roteiro.' } };
  const [brand] = await db.select({ id: schema.brands.id }).from(schema.brands).where(eq(schema.brands.id, input.brandId));
  if (!brand) return { ok: false as const, errors: { brandId: 'Marca não encontrada.' } };
  const slug = await uniqueSlug(slugify(input.name));
  const [live] = await db
    .insert(schema.lives)
    .values({ ...input, slug, status, streamKey: newStreamKey() })
    .returning();
  const r = await replaceLineup(live.id, lineup);
  if (!r.ok) {
    await db.delete(schema.lives).where(eq(schema.lives.id, live.id));
    return { ok: false as const, errors: { items: r.message } };
  }
  return { ok: true as const, live };
}

export async function updateLive(id: string, input: Partial<LiveInput>, lineup: LineupInput | undefined, status?: 'draft' | 'scheduled') {
  const [cur] = await db.select().from(schema.lives).where(eq(schema.lives.id, id));
  if (!cur) return { ok: false as const, status: 404, errors: { form: 'Live não encontrada.' } };
  if (cur.status === 'ended') return { ok: false as const, status: 409, errors: { form: 'Esta live já foi encerrada.' } };
  if (cur.status === 'live' && (input.brandId && input.brandId !== cur.brandId)) {
    return { ok: false as const, status: 409, errors: { brandId: 'Não dá para trocar a marca com a live no ar.' } };
  }
  if (input.brandId && input.brandId !== cur.brandId) {
    const [hasOrders] = await db.select({ id: schema.orders.id }).from(schema.orders).where(eq(schema.orders.liveId, id)).limit(1);
    if (hasOrders) return { ok: false as const, status: 409, errors: { brandId: 'Esta live já tem pedidos: a marca não pode mudar.' } };
  }
  if (lineup !== undefined && cur.status !== 'live') {
    const err = validateLineup(lineup);
    if (err) return { ok: false as const, status: 400, errors: { items: err } };
  }
  const nextStatus = cur.status === 'live' ? 'live' : (status ?? cur.status);
  if (nextStatus === 'scheduled') {
    const count = lineup !== undefined ? lineup.length : (await db.select({ id: schema.liveItems.id }).from(schema.liveItems).where(eq(schema.liveItems.liveId, id))).length;
    if (!count) return { ok: false as const, status: 400, errors: { items: 'Adicione pelo menos um produto ao roteiro.' } };
  }
  await db.transaction(async (tx) => {
    // Trocar de marca num rascunho: o roteiro antigo sai antes (os produtos eram da outra marca).
    if (input.brandId && input.brandId !== cur.brandId) await tx.delete(schema.liveItems).where(eq(schema.liveItems.liveId, id));
    await tx.update(schema.lives).set({ ...input, status: nextStatus }).where(eq(schema.lives.id, id));
  });
  if (lineup !== undefined && cur.status !== 'live') {
    const r = await replaceLineup(id, lineup);
    if (!r.ok) return { ok: false as const, status: r.status, errors: { items: r.message } };
  }
  const [live] = await db.select().from(schema.lives).where(eq(schema.lives.id, id));
  return { ok: true as const, live };
}

export type LiveListRow = {
  id: string;
  name: string;
  slug: string;
  brandName: string;
  status: 'draft' | 'scheduled' | 'live' | 'ended';
  startsAt: Date;
  startedAt: Date | null;
  companies: number;
  units: number;
};

export async function listLives(opts: { q?: string; limit?: number } = {}): Promise<LiveListRow[]> {
  const q = opts.q?.trim();
  const rows = await db.execute<{
    id: string; name: string; slug: string; brand_name: string; status: LiveListRow['status'];
    starts_at: string; started_at: string | null; companies: number; units: number;
  }>(sql`
    select l.id, l.name, l.slug, b.name as brand_name, l.status, l.starts_at, l.started_at,
      (select count(distinct x.company_id)::int from (
          select a.company_id from live_attendance a where a.live_id = l.id
          union select o.company_id from orders o where o.live_id = l.id) x) as companies,
      (select coalesce(sum(oi.qty), 0)::int from order_items oi join orders o on o.id = oi.order_id
         where o.live_id = l.id and oi.canceled_at is null) as units
    from lives l join brands b on b.id = l.brand_id
    ${q ? sql`where l.name ilike ${'%' + q + '%'} or b.name ilike ${'%' + q + '%'}
      or exists (select 1 from orders o join companies c on c.id = o.company_id where o.live_id = l.id and c.name ilike ${'%' + q + '%'})` : sql``}
    order by case l.status when 'live' then 0 when 'scheduled' then 1 when 'draft' then 2 else 3 end,
      case when l.status in ('scheduled', 'draft') then l.starts_at end asc,
      l.starts_at desc
    limit ${opts.limit ?? 50}
  `);
  return rows.map((r) => ({
    id: r.id, name: r.name, slug: r.slug, brandName: r.brand_name, status: r.status,
    startsAt: new Date(r.starts_at), startedAt: r.started_at ? new Date(r.started_at) : null,
    companies: r.companies, units: r.units,
  }));
}

export async function liveForEdit(id: string) {
  const [live] = await db.select().from(schema.lives).where(eq(schema.lives.id, id));
  if (!live) return null;
  const items = await db
    .select({ productId: schema.liveItems.productId, durationS: schema.liveItems.durationS, position: schema.liveItems.position })
    .from(schema.liveItems)
    .where(eq(schema.liveItems.liveId, id))
    .orderBy(schema.liveItems.position);
  return { live, items };
}

/** Live no ar agora (a mais recente), para o atalho "Central da live". */
export async function currentLiveId() {
  const [l] = await db
    .select({ id: schema.lives.id })
    .from(schema.lives)
    .where(eq(schema.lives.status, 'live'))
    .orderBy(desc(schema.lives.startedAt))
    .limit(1);
  if (l) return l.id;
  const [next] = await db
    .select({ id: schema.lives.id })
    .from(schema.lives)
    .where(and(eq(schema.lives.status, 'scheduled')))
    .orderBy(schema.lives.startsAt)
    .limit(1);
  return next?.id ?? null;
}

export async function otherLiveOnAir(exceptId: string) {
  const [l] = await db
    .select({ id: schema.lives.id, name: schema.lives.name })
    .from(schema.lives)
    .where(and(eq(schema.lives.status, 'live'), ne(schema.lives.id, exceptId)))
    .limit(1);
  return l ?? null;
}
