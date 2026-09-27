import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

/** Marcas e produtos ativos (com estoque disponível) para montar o roteiro. */
export async function brandsWithProducts() {
  const brands = await db.select({ id: schema.brands.id, name: schema.brands.name }).from(schema.brands).orderBy(schema.brands.createdAt, schema.brands.name);
  const rows = await db
    .select({
      id: schema.products.id,
      brandId: schema.products.brandId,
      name: schema.products.name,
      imageUrl: schema.products.imageUrl,
      available: schema.productStock.available,
    })
    .from(schema.products)
    .innerJoin(schema.productStock, eq(schema.productStock.productId, schema.products.id))
    .where(eq(schema.products.active, true))
    .orderBy(schema.products.createdAt, schema.products.name);
  const productsByBrand: Record<string, { id: string; name: string; available: number; imageUrl: string | null }[]> = {};
  for (const r of rows) (productsByBrand[r.brandId] ??= []).push({ id: r.id, name: r.name, available: r.available, imageUrl: r.imageUrl });
  return { brands, productsByBrand };
}

/** Data (aaaa-mm-dd) e hora (hh:mm) no fuso de Brasília. */
export function localParts(d: Date) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
