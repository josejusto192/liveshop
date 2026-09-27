import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { apiError, EMAIL_RE, normalizeEmail, readJson } from '@/lib/api';
import { requireAdminApi } from '@/lib/admin-api';
import { listBrandCards } from '@/lib/brands';

export async function GET() {
  const admin = await requireAdminApi('brands:read');
  if (admin instanceof Response) return admin;
  return NextResponse.json({ brands: await listBrandCards() });
}

// { name, segment?, ordersEmail? }
export async function POST(req: Request) {
  const admin = await requireAdminApi('brands:write');
  if (admin instanceof Response) return admin;
  const body = await readJson(req);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const segment = typeof body.segment === 'string' ? body.segment.trim() || null : null;
  const ordersEmail = normalizeEmail(body.ordersEmail) || null;
  if (!name) return apiError('required', 'Informe o nome da marca.', 400, { field: 'name' });
  if (ordersEmail && !EMAIL_RE.test(ordersEmail)) return apiError('invalid_email', 'Digite um e-mail válido.', 400, { field: 'ordersEmail' });
  const [brand] = await db.insert(schema.brands).values({ name, segment, ordersEmail }).returning();
  return NextResponse.json({ brand }, { status: 201 });
}
