// Código de acesso por e-mail (docs/03-regras-de-negocio.md, "Acesso do comprador").
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { and, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db, schema } from './db';
import { getSettings } from './settings';

export type OtpSubject = 'company' | 'admin';

export const MAX_ATTEMPTS = 3;
export const RESEND_AFTER_S = 30;
export const MAX_PER_EMAIL_HOUR = 5;
export const MAX_PER_IP_HOUR = 20;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET não definida');
  return s;
}

export function hashCode(subject: OtpSubject, email: string, code: string) {
  return createHmac('sha256', secret()).update(`${subject}:${email}:${code}`).digest('hex');
}

export type RequestCodeResult =
  | { ok: true; code: string; expiresAt: Date; resendInS: number }
  | { ok: false; error: 'resend_too_soon'; retryInS: number }
  | { ok: false; error: 'rate_limited' };

/**
 * Gera um novo código e invalida os anteriores. Não envia o e-mail: quem chama envia.
 * `now` é injetável para os testes.
 */
export async function requestCode(opts: {
  email: string;
  subject: OtpSubject;
  ip?: string | null;
  now?: Date;
}): Promise<RequestCodeResult> {
  const now = opts.now ?? new Date();
  const { email, subject } = opts;
  const t = schema.otpCodes;
  const hourAgo = new Date(now.getTime() - 3600_000);

  const [last] = await db
    .select({ createdAt: t.createdAt })
    .from(t)
    .where(and(eq(t.email, email), eq(t.subject, subject)))
    .orderBy(desc(t.createdAt))
    .limit(1);
  if (last) {
    const elapsed = (now.getTime() - last.createdAt.getTime()) / 1000;
    if (elapsed < RESEND_AFTER_S) return { ok: false, error: 'resend_too_soon', retryInS: Math.ceil(RESEND_AFTER_S - elapsed) };
  }

  const [{ n: perEmail }] = await db
    .select({ n: count() })
    .from(t)
    .where(and(eq(t.email, email), gt(t.createdAt, hourAgo)));
  if (perEmail >= MAX_PER_EMAIL_HOUR) return { ok: false, error: 'rate_limited' };

  if (opts.ip) {
    const [{ n: perIp }] = await db
      .select({ n: count() })
      .from(t)
      .where(and(sql`${t.ip} = ${opts.ip}::inet`, gt(t.createdAt, hourAgo)));
    if (perIp >= MAX_PER_IP_HOUR) return { ok: false, error: 'rate_limited' };
  }

  const { otpTtlMin } = await getSettings();
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(now.getTime() + otpTtlMin * 60_000);

  await db.transaction(async (tx) => {
    // Novo código invalida o anterior.
    await tx
      .update(t)
      .set({ invalidatedAt: now })
      .where(and(eq(t.email, email), eq(t.subject, subject), isNull(t.usedAt), isNull(t.invalidatedAt)));
    await tx.insert(t).values({
      email,
      subject,
      codeHash: hashCode(subject, email, code),
      expiresAt,
      createdAt: now,
      ip: opts.ip ?? null,
    });
  });

  return { ok: true, code, expiresAt, resendInS: RESEND_AFTER_S };
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; error: 'invalid_code'; attemptsLeft: number }
  | { ok: false; error: 'blocked' }
  | { ok: false; error: 'expired' };

export async function verifyCode(opts: {
  email: string;
  subject: OtpSubject;
  code: string;
  now?: Date;
}): Promise<VerifyResult> {
  const now = opts.now ?? new Date();
  const { email, subject } = opts;
  const t = schema.otpCodes;

  const [otp] = await db
    .select()
    .from(t)
    .where(and(eq(t.email, email), eq(t.subject, subject)))
    .orderBy(desc(t.createdAt))
    .limit(1);

  if (!otp) return { ok: false, error: 'expired' };
  if (otp.attempts >= MAX_ATTEMPTS) return { ok: false, error: 'blocked' };
  if (otp.usedAt || otp.invalidatedAt || otp.expiresAt <= now) return { ok: false, error: 'expired' };

  const expected = Buffer.from(otp.codeHash, 'hex');
  const given = Buffer.from(hashCode(subject, email, String(opts.code ?? '').trim()), 'hex');
  const match = expected.length === given.length && timingSafeEqual(expected, given);

  if (match) {
    // Condicional para o mesmo código não abrir duas sessões.
    const used = await db
      .update(t)
      .set({ usedAt: now })
      .where(and(eq(t.id, otp.id), isNull(t.usedAt), isNull(t.invalidatedAt)))
      .returning({ id: t.id });
    return used.length ? { ok: true } : { ok: false, error: 'expired' };
  }

  const [upd] = await db
    .update(t)
    .set({
      attempts: sql`${t.attempts} + 1`,
      invalidatedAt: sql`case when ${t.attempts} + 1 >= ${MAX_ATTEMPTS} then ${now.toISOString()}::timestamptz else null end`,
    })
    .where(and(eq(t.id, otp.id), isNull(t.usedAt), isNull(t.invalidatedAt)))
    .returning({ attempts: t.attempts });
  if (!upd) return { ok: false, error: 'expired' };
  if (upd.attempts >= MAX_ATTEMPTS) return { ok: false, error: 'blocked' };
  return { ok: false, error: 'invalid_code', attemptsLeft: MAX_ATTEMPTS - upd.attempts };
}

/** Segundos até liberar o reenvio (0 = liberado). Usado para montar a tela do código. */
export async function resendWaitS(email: string, subject: OtpSubject, now = new Date()): Promise<number> {
  const t = schema.otpCodes;
  const [last] = await db
    .select({ createdAt: t.createdAt })
    .from(t)
    .where(and(eq(t.email, email), eq(t.subject, subject)))
    .orderBy(desc(t.createdAt))
    .limit(1);
  if (!last) return 0;
  return Math.max(0, Math.ceil(RESEND_AFTER_S - (now.getTime() - last.createdAt.getTime()) / 1000));
}

export const OTP_MESSAGES = {
  resend_too_soon: (s: number) => `Aguarde ${s} s para pedir um novo código.`,
  rate_limited: 'Muitos códigos pedidos. Tente de novo em uma hora.',
  invalid_code: (left: number) => `Código incorreto. Você tem mais ${left} ${left === 1 ? 'tentativa' : 'tentativas'}.`,
  blocked: 'Muitas tentativas. Por segurança, peça um novo código.',
  expired: 'Este código expirou. Peça um novo código.',
} as const;
