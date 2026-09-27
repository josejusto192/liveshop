// Sessões em cookie httpOnly (30 dias). Comprador e admin usam cookies separados.
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db, schema } from './db';
import type { AdminUser, Company } from './db/schema';
import { can, type Permission } from './permissions';
import type { OtpSubject } from './otp';

export const SESSION_DAYS = 30;
export const COOKIE = { company: 'ls_session', admin: 'ls_admin' } as const;
export const PENDING_EMAIL_COOKIE = { company: 'ls_otp_email', admin: 'ls_admin_otp_email' } as const;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function cookieOptions(maxAgeS: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeS,
  };
}

export async function createSession(owner: { companyId: string } | { adminUserId: string }, now = new Date()) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86400_000);
  await db.insert(schema.sessions).values({
    tokenHash: sha256(token),
    companyId: 'companyId' in owner ? owner.companyId : null,
    adminUserId: 'adminUserId' in owner ? owner.adminUserId : null,
    expiresAt,
  });
  return { token, expiresAt };
}

export async function setSessionCookie(subject: OtpSubject, token: string) {
  (await cookies()).set(COOKIE[subject], token, cookieOptions(SESSION_DAYS * 86400));
}

export async function destroySession(subject: OtpSubject) {
  const jar = await cookies();
  const token = jar.get(COOKIE[subject])?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, sha256(token)));
  jar.delete(COOKIE[subject]);
}

async function sessionRow(subject: OtpSubject) {
  const token = (await cookies()).get(COOKIE[subject])?.value;
  if (!token) return null;
  const [row] = await db
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.tokenHash, sha256(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function getCompany(): Promise<Company | null> {
  const s = await sessionRow('company');
  if (!s?.companyId) return null;
  const [c] = await db.select().from(schema.companies).where(eq(schema.companies.id, s.companyId)).limit(1);
  return c ?? null;
}

export async function getAdmin(): Promise<AdminUser | null> {
  const s = await sessionRow('admin');
  if (!s?.adminUserId) return null;
  const [u] = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.id, s.adminUserId)).limit(1);
  return u ?? null;
}

/** Para páginas do painel: redireciona para o login ou para a visão geral se faltar permissão. */
export async function requireAdminPage(permission?: Permission): Promise<AdminUser> {
  const admin = await getAdmin();
  if (!admin) redirect('/admin/login');
  if (permission && !can(admin.role, permission)) redirect('/admin?sem-permissao=1');
  return admin;
}
