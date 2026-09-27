import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { testOutbox } from '@/lib/mail';

export async function resetDb() {
  await db.execute(sql`truncate table
    order_item_events, order_items, orders, stock_alerts, live_attendance, support_tickets,
    sessions, otp_codes, live_items, lives, products, brands, companies, admin_users, settings
    restart identity cascade`);
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
