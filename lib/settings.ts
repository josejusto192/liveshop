import { db, schema } from './db';
import type { Settings } from './db/schema';

export async function getSettings(): Promise<Settings> {
  const [row] = await db.select().from(schema.settings).limit(1);
  if (row) return row;
  const [created] = await db.insert(schema.settings).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(schema.settings).limit(1))[0];
}
