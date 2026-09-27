import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { apiError, EMAIL_RE, normalizeEmail, readJson } from '@/lib/api';
import { requireAdminApi } from '@/lib/admin-api';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi('brands:write');
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const body = await readJson(req);
  const set: Partial<typeof schema.brands.$inferInsert> = {};
  if (typeof body.name === 'string') {
    if (!body.name.trim()) return apiError('required', 'Informe o nome da marca.', 400, { field: 'name' });
    set.name = body.name.trim();
  }
  if (typeof body.segment === 'string') set.segment = body.segment.trim() || null;
  if (typeof body.ordersEmail === 'string') {
    const e = normalizeEmail(body.ordersEmail);
    if (e && !EMAIL_RE.test(e)) return apiError('invalid_email', 'Digite um e-mail válido.', 400, { field: 'ordersEmail' });
    set.ordersEmail = e || null;
  }
  if (!Object.keys(set).length) return apiError('empty', 'Nada para alterar.');
  const [brand] = await db.update(schema.brands).set(set).where(eq(schema.brands.id, id)).returning();
  if (!brand) return apiError('not_found', 'Marca não encontrada.', 404);
  return NextResponse.json({ brand });
}
