import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { testOutbox } from '@/lib/mail';

export async function resetDb() {
  await db.execute(sql`truncate table
    order_item_events, order_items, orders, stock_alerts, live_attendance, support_tickets,
    login_links, sessions, otp_codes, live_items, lives, products, brands, companies, admin_users, settings
    restart identity cascade`);
  await db.execute(sql`alter sequence order_code_seq restart with 1`);
  testOutbox.length = 0;
}

/** Último código enviado por e-mail para `email` (lido do assunto/corpo). */
export function lastCodeSentTo(email: string): string {
  const mail = [...testOutbox].reverse().find((m) => m.to === email);
  const m = mail?.text.match(/\b(\d{6})\b/);
  if (!m) throw new Error(`nenhum código enviado para ${email}`);
  return m[1];
}

export const at = (base: Date, seconds: number) => new Date(base.getTime() + seconds * 1000);

import { schema } from '@/lib/db';

/** Marca, produtos e uma live agendada com roteiro (durações em segundos). */
export async function seedLive(opts: { durations?: number[]; stock?: number[]; status?: 'draft' | 'scheduled' | 'live'; mode?: 'auto' | 'manual'; delay?: number } = {}) {
  const durations = opts.durations ?? [600, 900, 300];
  const [brand] = await db.insert(schema.brands).values({ name: 'Marca Exemplo' }).returning();
  const products = [];
  for (const [i, d] of durations.entries()) {
    void d;
    const [p] = await db
      .insert(schema.products)
      .values({ brandId: brand.id, name: `Produto ${i + 1}`, sku: `P-${i + 1}`, priceCents: 8990, stockTotal: opts.stock?.[i] ?? 6000, minQty: 10, stepQty: 10 })
      .returning();
    products.push(p);
  }
  const [live] = await db
    .insert(schema.lives)
    .values({
      brandId: brand.id,
      name: 'Lançamento Coleção Verão',
      slug: `live-${Math.random().toString(36).slice(2, 8)}`,
      startsAt: new Date('2026-10-01T17:00:00Z'),
      status: opts.status === 'live' ? 'scheduled' : (opts.status ?? 'scheduled'),
      mode: opts.mode ?? 'auto',
      videoDelayS: opts.delay ?? 6,
      streamKey: `key-${Math.random().toString(36).slice(2)}`,
    })
    .returning();
  const items = [];
  for (const [i, d] of durations.entries()) {
    const [it] = await db.insert(schema.liveItems).values({ liveId: live.id, productId: products[i].id, position: i + 1, durationS: d }).returning();
    items.push(it);
  }
  return { brand, products, live, items };
}
