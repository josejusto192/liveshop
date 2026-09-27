import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { apiError, readJson } from '@/lib/api';
import { requireAdminApi } from '@/lib/admin-api';
import { listProducts, parseProductInput, skuTaken } from '@/lib/products';

export async function GET(req: Request) {
  const admin = await requireAdminApi('products:write');
  if (admin instanceof Response) return admin;
  const brandId = new URL(req.url).searchParams.get('brandId');
  if (!brandId) return apiError('required', 'Informe a marca.');
  return NextResponse.json({ products: await listProducts(brandId) });
}

export async function POST(req: Request) {
  const admin = await requireAdminApi('products:write');
  if (admin instanceof Response) return admin;
  const parsed = parseProductInput(await readJson(req));
  if (!parsed.ok) return apiError('invalid', 'Confira os campos destacados.', 400, { fields: parsed.errors });
  const v = parsed.value;
  const [brand] = await db.select({ id: schema.brands.id }).from(schema.brands).where(eq(schema.brands.id, v.brandId));
  if (!brand) return apiError('invalid', 'Marca não encontrada.', 400, { fields: { brandId: 'Marca não encontrada.' } });
  if (await skuTaken(v.brandId, v.sku)) return apiError('sku_taken', 'Já existe um produto com este SKU.', 409, { fields: { sku: 'Já existe um produto com este SKU.' } });
  const [product] = await db.insert(schema.products).values({ ...v, imageUrl: v.imageUrl ?? null }).returning();
  return NextResponse.json({ product }, { status: 201 });
}
