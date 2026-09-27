import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { apiError, readJson } from '@/lib/api';
import { requireAdminApi } from '@/lib/admin-api';
import { parseProductInput, skuTaken, stockBelowReservedMessage } from '@/lib/products';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi('products:write');
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const [current] = await db
    .select({ product: schema.products, reserved: schema.productStock.reserved })
    .from(schema.products)
    .innerJoin(schema.productStock, eq(schema.productStock.productId, schema.products.id))
    .where(eq(schema.products.id, id));
  if (!current) return apiError('not_found', 'Produto não encontrado.', 404);

  const body = await readJson(req);
  const parsed = parseProductInput({ ...current.product, price: undefined, ...body, brandId: current.product.brandId });
  if (!parsed.ok) return apiError('invalid', 'Confira os campos destacados.', 400, { fields: parsed.errors });
  const v = parsed.value;
  if (await skuTaken(v.brandId, v.sku, id)) return apiError('sku_taken', 'Já existe um produto com este SKU.', 409, { fields: { sku: 'Já existe um produto com este SKU.' } });
  if (v.stockTotal < current.reserved) {
    const msg = stockBelowReservedMessage(current.reserved);
    return apiError('stock_below_reserved', msg, 400, { fields: { stockTotal: msg } });
  }
  // O preço novo não altera itens de pedido existentes (preço congelado em order_items).
  const [product] = await db
    .update(schema.products)
    .set({ ...v, imageUrl: v.imageUrl === undefined ? current.product.imageUrl : v.imageUrl })
    .where(eq(schema.products.id, id))
    .returning();
  return NextResponse.json({ product });
}
