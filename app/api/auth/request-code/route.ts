import { NextResponse } from 'next/server';
import { apiError, clientIp, normalizeEmail, readJson } from '@/lib/api';
import { requestAccess } from '@/lib/access';
import { cookieOptions, PENDING_EMAIL_COOKIE } from '@/lib/auth';

// { email, company?, whatsapp?, acceptTerms?, liveSlug, subject? }
export async function POST(req: Request) {
  const body = await readJson(req);
  const subject = body.subject === 'admin' ? 'admin' : 'company';
  const email = normalizeEmail(body.email);
  const r = await requestAccess({
    subject,
    email,
    company: typeof body.company === 'string' ? body.company : undefined,
    whatsapp: typeof body.whatsapp === 'string' ? body.whatsapp : undefined,
    acceptTerms: body.acceptTerms === true,
    ip: clientIp(req),
  });
  if (!r.ok) return apiError(r.error.code, r.error.message, r.error.status, { ...r.error.extra, field: r.error.field });
  const res = NextResponse.json({ ok: true, email, resendInS: r.resendInS });
  // A tela do código lê o e-mail deste cookie (não vai na URL).
  res.cookies.set(PENDING_EMAIL_COOKIE[subject], email, cookieOptions(60 * 60));
  return res;
}
