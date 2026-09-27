import { eq } from 'drizzle-orm';
import { db, schema } from './db';

/** Live pelo slug para o comprador (rascunho não aparece). */
export async function liveIdBySlug(slug: string) {
  const [l] = await db
    .select({ id: schema.lives.id, status: schema.lives.status })
    .from(schema.lives)
    .where(eq(schema.lives.slug, slug));
  if (!l || l.status === 'draft') return null;
  return l;
}

export async function recordAttendance(liveId: string, companyId: string) {
  await db.insert(schema.liveAttendance).values({ liveId, companyId }).onConflictDoNothing();
}
