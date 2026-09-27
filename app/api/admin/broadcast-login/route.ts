import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { COOKIE, cookieOptions, createSession, SESSION_DAYS } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { consumeLoginLink } from '@/lib/login-links';
import { can } from '@/lib/permissions';

// Abre o link do QR code: cria a sessão de admin no celular e vai para a tela Transmitir.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = (process.env.APP_URL || url.origin).replace(/\/$/, '');
  const token = url.searchParams.get('t') ?? '';
  const link = token ? await consumeLoginLink(token) : null;
  if (!link?.liveId) return NextResponse.redirect(`${base}/admin/login?link=expirado`, 303);
  const [user] = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.id, link.adminUserId));
  if (!user || !can(user.role, 'lives:write')) return NextResponse.redirect(`${base}/admin/login?link=expirado`, 303);
  const { token: session } = await createSession({ adminUserId: user.id });
  const res = NextResponse.redirect(`${base}/admin/lives/${link.liveId}/transmitir`, 303);
  res.cookies.set(COOKIE.admin, session, cookieOptions(SESSION_DAYS * 86400));
  return res;
}
