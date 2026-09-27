import { eq, sql } from 'drizzle-orm';
import { db, schema } from './db';

export type PublicLive = {
  id: string;
  name: string;
  slug: string;
  status: 'draft' | 'scheduled' | 'live' | 'ended';
  format: 'horizontal' | 'vertical';
  startsAt: Date;
  endsAt: Date;
  brandName: string;
};

/** Dados públicos da live pelo slug (tela de cadastro). Rascunho não aparece para o comprador. */
export async function getPublicLive(slug: string): Promise<PublicLive | null> {
  const [row] = await db
    .select({
      id: schema.lives.id,
      name: schema.lives.name,
      slug: schema.lives.slug,
      status: schema.lives.status,
      format: schema.lives.format,
      startsAt: schema.lives.startsAt,
      brandName: schema.brands.name,
      totalS: sql<number>`coalesce((select sum(duration_s) from live_items li where li.live_id = ${schema.lives.id}), 0)::int`,
    })
    .from(schema.lives)
    .innerJoin(schema.brands, eq(schema.brands.id, schema.lives.brandId))
    .where(eq(schema.lives.slug, slug));
  if (!row || row.status === 'draft') return null;
  const { totalS, ...live } = row;
  return { ...live, endsAt: new Date(live.startsAt.getTime() + (totalS || 3600) * 1000) };
}
