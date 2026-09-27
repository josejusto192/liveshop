import 'dotenv/config';
import postgres from 'postgres';
import { runMigrations } from '../scripts/migrate';

// Recria o schema do banco de teste do zero e aplica as migrações.
export default async function setup() {
  const url = process.env.DATABASE_URL_TEST || 'postgres://postgres:postgres@localhost:5432/liveshop_test';
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql.unsafe('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  await sql.end();
  await runMigrations(url);
}
