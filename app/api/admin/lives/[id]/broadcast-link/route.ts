import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import { apiError } from '@/lib/api';
import { requireAdminApi } from '@/lib/admin-api';
import { db, schema } from '@/lib/db';
import { createLoginLink } from '@/lib/login-links';

// QR code para abrir a tela Transmitir no celular já logado (uso único, 10 min).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi('lives:write');
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const [live] = await db.select({ id: schema.lives.id, status: schema.lives.status }).from(schema.lives).where(eq(schema.lives.id, id));
  if (!live) return apiError('not_found', 'Live não encontrada.', 404);
  if (live.status === 'ended') return apiError('ended', 'Esta live já foi encerrada.', 409);
  const { token, expiresAt } = await createLoginLink(admin.id, id);
  const url = `${(process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')}/api/admin/broadcast-login?t=${token}`;
  const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#111214', light: '#FFFFFF' } });
  return NextResponse.json({ url, qrSvg, expiresAt: expiresAt.getTime() });
}
