import { and, eq, sql } from 'drizzle-orm';
import { requireAdminPage } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { listProducts } from '@/lib/products';
import { TZ } from '@/lib/dates';
import { ProductsView } from './ProductsView';

export default async function ProdutosPage({ searchParams }: { searchParams: Promise<{ marca?: string }> }) {
  await requireAdminPage('products:write');
  const { marca } = await searchParams;
  const brands = await db.select({ id: schema.brands.id, name: schema.brands.name }).from(schema.brands).orderBy(schema.brands.createdAt, schema.brands.name);
  const brand = brands.find((b) => b.id === marca) ?? brands[0] ?? null;
  const products = brand ? await listProducts(brand.id) : [];

  // Produtos da marca no roteiro de lives de hoje (fuso de Brasília).
  let inToday = 0;
  if (brand) {
    const [r] = await db
      .select({ n: sql<number>`count(distinct ${schema.liveItems.productId})::int` })
      .from(schema.liveItems)
      .innerJoin(schema.lives, eq(schema.lives.id, schema.liveItems.liveId))
      .where(and(eq(schema.lives.brandId, brand.id), sql`(${schema.lives.startsAt} at time zone ${TZ})::date = (now() at time zone ${TZ})::date`));
    inToday = r?.n ?? 0;
  }

  return <ProductsView key={brand?.id ?? 'none'} brands={brands} brand={brand} products={products} inToday={inToday} />;
}
