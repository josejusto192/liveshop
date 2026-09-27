import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { apiError, EMAIL_RE, normalizeEmail, readJson } from '@/lib/api';
import { requireAdminApi } from '@/lib/admin-api';
import { sendMail } from '@/lib/mail';
import { getSettings } from '@/lib/settings';
import type { AdminRole } from '@/lib/db/schema';

export async function GET() {
  const admin = await requireAdminApi('team:write');
  if (admin instanceof Response) return admin;
  const team = await db.select().from(schema.adminUsers).orderBy(schema.adminUsers.createdAt);
  return NextResponse.json({ team });
}

// { name, email, role } → convida por e-mail (o acesso é pelo código, em /admin/login)
export async function POST(req: Request) {
  const admin = await requireAdminApi('team:write');
  if (admin instanceof Response) return admin;
  const b = await readJson(req);
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const email = normalizeEmail(b.email);
  const role = b.role as AdminRole;
  const fields: Record<string, string> = {};
  if (!name) fields.name = 'Informe o nome.';
  if (!EMAIL_RE.test(email)) fields.email = 'Digite um e-mail válido.';
  if (!['owner', 'operator', 'finance'].includes(role)) fields.role = 'Escolha o papel.';
  if (Object.keys(fields).length) return apiError('invalid', 'Confira os campos destacados.', 400, { fields });
  const [exists] = await db.select({ id: schema.adminUsers.id }).from(schema.adminUsers).where(eq(schema.adminUsers.email, email));
  if (exists) return apiError('email_taken', 'Esta pessoa já está na equipe.', 409, { fields: { email: 'Esta pessoa já está na equipe.' } });
  const [member] = await db.insert(schema.adminUsers).values({ name, email, role }).returning();
  const s = await getSettings();
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  await sendMail({
    to: email,
    subject: `Convite para o painel ${s.platformName}`,
    text: `${admin.name} convidou você para o painel ${s.platformName}.\n\nEntre em ${appUrl}/admin/login com este e-mail. Você vai receber um código de acesso.`,
  }).catch(() => {});
  return NextResponse.json({ member }, { status: 201 });
}
