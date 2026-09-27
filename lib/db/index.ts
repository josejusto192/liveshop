import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

type Db = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as { __db?: Db; __sql?: postgres.Sql };

function url() {
  const u = process.env.DATABASE_URL;
  if (!u) throw new Error('DATABASE_URL não definida');
  return u;
}

// Reaproveita a conexão entre recargas do `next dev`.
export const sqlClient = globalForDb.__sql ?? postgres(url(), { max: 10 });
export const db: Db = globalForDb.__db ?? drizzle(sqlClient, { schema });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__sql = sqlClient;
  globalForDb.__db = db;
}

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export { schema };
