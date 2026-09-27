// Fluxo de acesso (cadastro/login por código) usado pelas rotas /api/auth/*.
import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { sendMail } from './mail';
import { OTP_MESSAGES, requestCode, verifyCode, type OtpSubject } from './otp';
import { getSettings } from './settings';
import { createSession } from './auth';
import { EMAIL_RE } from './api';

export type AccessError = { code: string; message: string; status: number; extra?: Record<string, unknown>; field?: string };

export function onlyDigits(v: unknown) {
  return typeof v === 'string' ? v.replace(/\D/g, '') : '';
}

/** "11900000000" → "(11) 90000-0000" */
export function formatWhatsapp(digits: string) {
  const d = digits.slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

async function mailCode(email: string, code: string, ttlMin: number) {
  const s = await getSettings();
  const subject = (s.mailSubject || 'Seu código para entrar na live: {código}').replace('{código}', code);
  const from = s.mailFromEmail ? `${s.mailFromName || s.platformName} <${s.mailFromEmail}>` : undefined;
  await sendMail({
    to: email,
    from,
    subject,
    text: `Seu código de acesso é ${code}.\n\nO código vale por ${ttlMin} minutos. Se você não pediu, ignore este e-mail.`,
  });
}

export type RequestAccessInput = {
  subject: OtpSubject;
  email: string;
  company?: string;
  whatsapp?: string;
  acceptTerms?: boolean;
  ip?: string | null;
  now?: Date;
};

/** Cadastra a empresa se for novo e-mail (com dados), e envia o código. */
export async function requestAccess(input: RequestAccessInput): Promise<{ ok: true; resendInS: number } | { ok: false; error: AccessError }> {
  const { subject, email } = input;
  if (!EMAIL_RE.test(email)) return { ok: false, error: { code: 'invalid_email', message: 'Digite um e-mail válido.', status: 400, field: 'email' } };

  if (subject === 'admin') {
    const [u] = await db.select({ id: schema.adminUsers.id }).from(schema.adminUsers).where(eq(schema.adminUsers.email, email));
    if (!u) return { ok: false, error: { code: 'not_authorized', message: 'Este e-mail não tem acesso ao painel.', status: 403, field: 'email' } };
  } else {
    const [existing] = await db.select({ id: schema.companies.id }).from(schema.companies).where(eq(schema.companies.email, email));
    // E-mail já cadastrado: só pede o código (não sobrescreve os dados da empresa antes de confirmar o e-mail).
    if (!existing) {
      const signup = input.company !== undefined || input.whatsapp !== undefined;
      if (!signup) {
        return { ok: false, error: { code: 'not_registered', message: 'Não encontramos cadastro com este e-mail. Preencha os dados da sua empresa.', status: 404, field: 'email' } };
      }
      const name = (input.company ?? '').trim();
      const wpp = onlyDigits(input.whatsapp);
      if (!name) return { ok: false, error: { code: 'required', message: 'Informe o nome da empresa.', status: 400, field: 'company' } };
      if (wpp.length < 10 || wpp.length > 11) return { ok: false, error: { code: 'invalid_whatsapp', message: 'Digite o WhatsApp com DDD.', status: 400, field: 'whatsapp' } };
      if (!input.acceptTerms) return { ok: false, error: { code: 'terms_required', message: 'Aceite os termos para continuar.', status: 400, field: 'acceptTerms' } };
      await db
        .insert(schema.companies)
        .values({ name, email, whatsapp: formatWhatsapp(wpp), termsAcceptedAt: input.now ?? new Date() })
        .onConflictDoNothing({ target: schema.companies.email });
    }
  }

  const r = await requestCode({ email, subject, ip: input.ip, now: input.now });
  if (!r.ok) {
    if (r.error === 'resend_too_soon')
      return { ok: false, error: { code: r.error, message: OTP_MESSAGES.resend_too_soon(r.retryInS), status: 429, extra: { retryInS: r.retryInS } } };
    return { ok: false, error: { code: r.error, message: OTP_MESSAGES.rate_limited, status: 429 } };
  }
  const ttlMin = Math.round((r.expiresAt.getTime() - (input.now ?? new Date()).getTime()) / 60_000);
  await mailCode(email, r.code, ttlMin);
  return { ok: true, resendInS: r.resendInS };
}

/** Confere o código e cria a sessão. Devolve o token para o cookie. */
export async function verifyAccess(input: { subject: OtpSubject; email: string; code: string; now?: Date }): Promise<{ ok: true; token: string } | { ok: false; error: AccessError }> {
  const r = await verifyCode(input);
  if (!r.ok) {
    if (r.error === 'invalid_code')
      return { ok: false, error: { code: r.error, message: OTP_MESSAGES.invalid_code(r.attemptsLeft), status: 400, extra: { attemptsLeft: r.attemptsLeft } } };
    return { ok: false, error: { code: r.error, message: OTP_MESSAGES[r.error], status: 400 } };
  }
  if (input.subject === 'admin') {
    const [u] = await db.select({ id: schema.adminUsers.id }).from(schema.adminUsers).where(eq(schema.adminUsers.email, input.email));
    if (!u) return { ok: false, error: { code: 'not_authorized', message: 'Este e-mail não tem acesso ao painel.', status: 403 } };
    return { ok: true, token: (await createSession({ adminUserId: u.id }, input.now)).token };
  }
  const [c] = await db.select({ id: schema.companies.id }).from(schema.companies).where(eq(schema.companies.email, input.email));
  if (!c) return { ok: false, error: { code: 'not_registered', message: 'Cadastro não encontrado.', status: 404 } };
  return { ok: true, token: (await createSession({ companyId: c.id }, input.now)).token };
}
