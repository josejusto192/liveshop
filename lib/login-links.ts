// Link de uso único (10 min) do QR code da Central: abre a tela Transmitir no celular já logado.
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db, schema } from './db';

export const LINK_TTL_MS = 10 * 60_000;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function createLoginLink(adminUserId: string, liveId: string, now = new Date()) {
  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(now.getTime() + LINK_TTL_MS);
  await db.insert(schema.loginLinks).values({ tokenHash: sha256(token), adminUserId, liveId, expiresAt, createdAt: now });
  return { token, expiresAt };
}

/** Consome o link (uma vez só). Devolve quem e para qual live, ou null se inválido/expirado/usado. */
export async function consumeLoginLink(token: string, now = new Date()) {
  const [row] = await db
    .update(schema.loginLinks)
    .set({ usedAt: now })
    .where(and(eq(schema.loginLinks.tokenHash, sha256(token)), isNull(schema.loginLinks.usedAt), gt(schema.loginLinks.expiresAt, now)))
    .returning({ adminUserId: schema.loginLinks.adminUserId, liveId: schema.loginLinks.liveId });
  return row ?? null;
}
