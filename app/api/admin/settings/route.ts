import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { apiError, EMAIL_RE, normalizeEmail, readJson } from '@/lib/api';
import { requireAdminApi } from '@/lib/admin-api';
import { getSettings } from '@/lib/settings';

export async function GET() {
  const admin = await requireAdminApi('settings:write');
  if (admin instanceof Response) return admin;
  return NextResponse.json({ settings: await getSettings() });
}

export async function PATCH(req: Request) {
  const admin = await requireAdminApi('settings:write');
  if (admin instanceof Response) return admin;
  await getSettings();
  const b = await readJson(req);
  const set: Partial<typeof schema.settings.$inferInsert> = {};
  const fields: Record<string, string> = {};
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined);

  if (b.platformName !== undefined) {
    const v = str(b.platformName);
    if (!v) fields.platformName = 'Informe o nome da plataforma.';
    else set.platformName = v;
  }
  if (b.accentColor !== undefined) {
    const v = str(b.accentColor)?.toUpperCase();
    if (!v || !/^#[0-9A-F]{6}$/.test(v)) fields.accentColor = 'Use uma cor no formato #D6F35B.';
    else set.accentColor = v;
  }
  if (b.logoUrl !== undefined) set.logoUrl = str(b.logoUrl) || null;
  if (b.defaultVideoDelayS !== undefined) {
    const v = Number(b.defaultVideoDelayS);
    if (!Number.isInteger(v) || v < 0 || v > 15) fields.defaultVideoDelayS = 'Atraso entre 0 e 15 segundos.';
    else set.defaultVideoDelayS = v;
  }
  if (b.otpTtlMin !== undefined) {
    const v = Number(b.otpTtlMin);
    if (v !== 10 && v !== 30) fields.otpTtlMin = 'Validade de 10 ou 30 minutos.';
    else set.otpTtlMin = v;
  }
  if (b.mailFromName !== undefined) set.mailFromName = str(b.mailFromName) || null;
  if (b.mailFromEmail !== undefined) {
    const v = normalizeEmail(b.mailFromEmail);
    if (v && !EMAIL_RE.test(v)) fields.mailFromEmail = 'Digite um e-mail válido.';
    else set.mailFromEmail = v || null;
  }
  if (b.mailSubject !== undefined) set.mailSubject = str(b.mailSubject) || null;

  if (Object.keys(fields).length) return apiError('invalid', 'Confira os campos destacados.', 400, { fields });
  const [settings] = await db.update(schema.settings).set(set).where(eq(schema.settings.id, 1)).returning();
  return NextResponse.json({ settings });
}
