import { NextResponse } from 'next/server';
import { apiError, normalizeEmail, readJson } from '@/lib/api';
import { verifyAccess } from '@/lib/access';
import { COOKIE, cookieOptions, PENDING_EMAIL_COOKIE, SESSION_DAYS } from '@/lib/auth';

// { email, code, subject? } → cookie de sessão
export async function POST(req: Request) {
  const body = await readJson(req);
  const subject = body.subject === 'admin' ? 'admin' : 'company';
  const email = normalizeEmail(body.email);
  const code = typeof body.code === 'string' ? body.code.replace(/\D/g, '') : '';
  if (code.length !== 6) return apiError('invalid_format', 'Digite os 6 dígitos do código.');
  const r = await verifyAccess({ subject, email, code });
  if (!r.ok) return apiError(r.error.code, r.error.message, r.error.status, r.error.extra);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE[subject], r.token, cookieOptions(SESSION_DAYS * 86400));
  res.cookies.delete(PENDING_EMAIL_COOKIE[subject]);
  return res;
}
