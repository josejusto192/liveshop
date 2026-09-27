import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requestAccess, verifyAccess } from '@/lib/access';
import { testOutbox } from '@/lib/mail';
import { at, lastCodeSentTo, resetDb } from './helpers';

const T0 = new Date('2026-10-02T17:00:00Z');
const email = 'compras@papelariacentral.com.br';

async function signup(now = T0, ip: string | null = '10.0.0.1') {
  return requestAccess({ subject: 'company', email, company: 'Papelaria Central Ltda', whatsapp: '(11) 98812-4410', acceptTerms: true, ip, now });
}

describe('código de acesso (OTP)', () => {
  beforeEach(resetDb);

  it('cadastra a empresa, envia um código de 6 dígitos e guarda só o hash', async () => {
    const r = await signup();
    expect(r.ok).toBe(true);
    const code = lastCodeSentTo(email);
    expect(code).toMatch(/^\d{6}$/);
    const [c] = await db.select().from(schema.companies).where(eq(schema.companies.email, email));
    expect(c.name).toBe('Papelaria Central Ltda');
    expect(c.whatsapp).toBe('(11) 98812-4410');
    expect(c.termsAcceptedAt).toEqual(T0);
    const [otp] = await db.select().from(schema.otpCodes);
    expect(otp.codeHash).not.toContain(code);
    expect(otp.expiresAt).toEqual(at(T0, 600));
  });

  it('entra com o código certo e o código não vale duas vezes', async () => {
    await signup();
    const code = lastCodeSentTo(email);
    const ok = await verifyAccess({ subject: 'company', email, code, now: at(T0, 60) });
    expect(ok.ok).toBe(true);
    const again = await verifyAccess({ subject: 'company', email, code, now: at(T0, 61) });
    expect(again).toMatchObject({ ok: false, error: { code: 'expired' } });
  });

  it('expira em 10 minutos', async () => {
    await signup();
    const code = lastCodeSentTo(email);
    const late = await verifyAccess({ subject: 'company', email, code, now: at(T0, 600) });
    expect(late).toMatchObject({ ok: false, error: { code: 'expired' } });
    await signup(at(T0, 700));
    const fresh = lastCodeSentTo(email);
    expect((await verifyAccess({ subject: 'company', email, code: fresh, now: at(T0, 700 + 599) })).ok).toBe(true);
  });

  it('conta as tentativas e bloqueia na 3ª falha, mesmo com o código certo depois', async () => {
    await signup();
    const code = lastCodeSentTo(email);
    const wrong = code === '000000' ? '111111' : '000000';
    const r1 = await verifyAccess({ subject: 'company', email, code: wrong, now: at(T0, 10) });
    expect(r1).toMatchObject({ ok: false, error: { code: 'invalid_code', extra: { attemptsLeft: 2 }, message: 'Código incorreto. Você tem mais 2 tentativas.' } });
    const r2 = await verifyAccess({ subject: 'company', email, code: wrong, now: at(T0, 11) });
    expect(r2).toMatchObject({ ok: false, error: { code: 'invalid_code', extra: { attemptsLeft: 1 }, message: 'Código incorreto. Você tem mais 1 tentativa.' } });
    const r3 = await verifyAccess({ subject: 'company', email, code: wrong, now: at(T0, 12) });
    expect(r3).toMatchObject({ ok: false, error: { code: 'blocked', message: 'Muitas tentativas. Por segurança, peça um novo código.' } });
    const r4 = await verifyAccess({ subject: 'company', email, code, now: at(T0, 13) });
    expect(r4).toMatchObject({ ok: false, error: { code: 'blocked' } });
  });

  it('tentativas simultâneas não passam de 3', async () => {
    await signup();
    const code = lastCodeSentTo(email);
    const wrong = code === '000000' ? '111111' : '000000';
    await Promise.all(Array.from({ length: 10 }, () => verifyAccess({ subject: 'company', email, code: wrong, now: at(T0, 5) })));
    const [otp] = await db.select().from(schema.otpCodes);
    expect(otp.attempts).toBe(3);
    expect(otp.invalidatedAt).not.toBeNull();
  });

  it('reenvio só depois de 30 s e o novo código invalida o anterior', async () => {
    await signup();
    const first = lastCodeSentTo(email);
    const early = await requestAccess({ subject: 'company', email, now: at(T0, 29) });
    expect(early).toMatchObject({ ok: false, error: { code: 'resend_too_soon', extra: { retryInS: 1 } } });
    expect(testOutbox).toHaveLength(1);

    const resent = await requestAccess({ subject: 'company', email, now: at(T0, 30) });
    expect(resent.ok).toBe(true);
    const second = lastCodeSentTo(email);

    if (first !== second) {
      const old = await verifyAccess({ subject: 'company', email, code: first, now: at(T0, 31) });
      expect(old.ok).toBe(false);
    }
    const [oldRow] = await db.select().from(schema.otpCodes).orderBy(schema.otpCodes.createdAt).limit(1);
    expect(oldRow.invalidatedAt).toEqual(at(T0, 30));
    expect((await verifyAccess({ subject: 'company', email, code: second, now: at(T0, 32) })).ok).toBe(true);
  });

  it('um novo código depois do bloqueio volta a funcionar', async () => {
    await signup();
    const wrong = lastCodeSentTo(email) === '000000' ? '111111' : '000000';
    for (let i = 0; i < 3; i++) await verifyAccess({ subject: 'company', email, code: wrong, now: at(T0, i) });
    await requestAccess({ subject: 'company', email, now: at(T0, 40) });
    expect((await verifyAccess({ subject: 'company', email, code: lastCodeSentTo(email), now: at(T0, 41) })).ok).toBe(true);
  });

  it('limita 5 códigos por e-mail por hora', async () => {
    await signup(T0);
    for (let i = 1; i < 5; i++) expect((await requestAccess({ subject: 'company', email, now: at(T0, i * 31) })).ok).toBe(true);
    const sixth = await requestAccess({ subject: 'company', email, now: at(T0, 5 * 31) });
    expect(sixth).toMatchObject({ ok: false, error: { code: 'rate_limited' } });
    expect((await requestAccess({ subject: 'company', email, now: at(T0, 3601) })).ok).toBe(true);
  });

  it('limita 20 códigos por IP por hora', async () => {
    for (let i = 0; i < 20; i++) {
      const r = await requestAccess({ subject: 'company', email: `loja${i}@ex.com.br`, company: `Loja ${i}`, whatsapp: '11900000000', acceptTerms: true, ip: '10.0.0.9', now: at(T0, i) });
      expect(r.ok).toBe(true);
    }
    const r = await requestAccess({ subject: 'company', email: 'loja20@ex.com.br', company: 'Loja 20', whatsapp: '11900000000', acceptTerms: true, ip: '10.0.0.9', now: at(T0, 21) });
    expect(r).toMatchObject({ ok: false, error: { code: 'rate_limited' } });
  });

  it('e-mail já cadastrado só pede o código e não sobrescreve os dados', async () => {
    await signup();
    const r = await requestAccess({ subject: 'company', email, company: 'Outro nome', whatsapp: '11911112222', acceptTerms: true, now: at(T0, 60) });
    expect(r.ok).toBe(true);
    const [c] = await db.select().from(schema.companies).where(eq(schema.companies.email, email));
    expect(c.name).toBe('Papelaria Central Ltda');
  });

  it('valida o cadastro no servidor', async () => {
    const base = { subject: 'company' as const, email: 'nova@loja.com.br', now: T0 };
    expect(await requestAccess(base)).toMatchObject({ ok: false, error: { code: 'not_registered' } });
    expect(await requestAccess({ ...base, company: '', whatsapp: '11900000000', acceptTerms: true })).toMatchObject({ ok: false, error: { field: 'company' } });
    expect(await requestAccess({ ...base, company: 'Loja', whatsapp: '9000', acceptTerms: true })).toMatchObject({ ok: false, error: { field: 'whatsapp' } });
    expect(await requestAccess({ ...base, company: 'Loja', whatsapp: '11900000000', acceptTerms: false })).toMatchObject({ ok: false, error: { field: 'acceptTerms' } });
    expect(await requestAccess({ ...base, email: 'invalido' })).toMatchObject({ ok: false, error: { code: 'invalid_email' } });
    expect(testOutbox).toHaveLength(0);
  });

  it('admin: só e-mails da equipe recebem código, e a sessão é de admin', async () => {
    const [u] = await db.insert(schema.adminUsers).values({ name: 'Operador', email: 'operacao@agencia.com.br', role: 'operator' }).returning();
    expect(await requestAccess({ subject: 'admin', email: 'estranho@x.com', now: T0 })).toMatchObject({ ok: false, error: { code: 'not_authorized' } });
    expect((await requestAccess({ subject: 'admin', email: u.email, now: T0 })).ok).toBe(true);
    // Código de comprador não serve para admin (e vice-versa).
    expect(await verifyAccess({ subject: 'company', email: u.email, code: lastCodeSentTo(u.email), now: at(T0, 5) })).toMatchObject({ ok: false });
    const ok = await verifyAccess({ subject: 'admin', email: u.email, code: lastCodeSentTo(u.email), now: at(T0, 6) });
    expect(ok.ok).toBe(true);
    const [s] = await db.select().from(schema.sessions);
    expect(s.adminUserId).toBe(u.id);
    expect(s.companyId).toBeNull();
    expect(s.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 86400_000);
  });
});
