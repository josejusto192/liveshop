import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { apiError, readJson } from '@/lib/api';
import { formatWhatsapp, onlyDigits } from '@/lib/access';
import { getCompany } from '@/lib/auth';
import { db, schema } from '@/lib/db';

export async function GET() {
  const company = await getCompany();
  if (!company) return apiError('unauthorized', 'Entre com o código.', 401);
  return NextResponse.json({ company });
}

// Perfil e preferências: { name, cnpj, whatsapp, contactName, cep, address, city, notifyEmail, notifyWhatsapp }
export async function PATCH(req: Request) {
  const company = await getCompany();
  if (!company) return apiError('unauthorized', 'Entre com o código.', 401);
  const b = await readJson(req);
  const set: Partial<typeof schema.companies.$inferInsert> = {};
  const fields: Record<string, string> = {};
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined);

  if (b.name !== undefined) {
    const v = str(b.name);
    if (!v) fields.name = 'Informe o nome da empresa.';
    else set.name = v;
  }
  if (b.cnpj !== undefined) {
    const d = onlyDigits(b.cnpj);
    if (d && d.length !== 14) fields.cnpj = 'CNPJ tem 14 dígitos.';
    else set.cnpj = d ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : null;
  }
  if (b.whatsapp !== undefined) {
    const d = onlyDigits(b.whatsapp);
    if (d.length < 10 || d.length > 11) fields.whatsapp = 'Digite o WhatsApp com DDD.';
    else set.whatsapp = formatWhatsapp(d);
  }
  if (b.contactName !== undefined) set.contactName = str(b.contactName) || null;
  if (b.cep !== undefined) {
    const d = onlyDigits(b.cep);
    if (d && d.length !== 8) fields.cep = 'CEP tem 8 dígitos.';
    else set.cep = d ? `${d.slice(0, 5)}-${d.slice(5)}` : null;
  }
  if (b.address !== undefined) set.address = str(b.address) || null;
  if (b.city !== undefined) set.city = str(b.city) || null;
  if (typeof b.notifyEmail === 'boolean') set.notifyEmail = b.notifyEmail;
  if (typeof b.notifyWhatsapp === 'boolean') set.notifyWhatsapp = b.notifyWhatsapp;
  if (Object.keys(fields).length) return apiError('invalid', 'Confira os campos destacados.', 400, { fields });
  if (!Object.keys(set).length) return NextResponse.json({ company });
  const [updated] = await db.update(schema.companies).set(set).where(eq(schema.companies.id, company.id)).returning();
  return NextResponse.json({ company: updated });
}
