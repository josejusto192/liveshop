// Token de publicação da tela Transmitir: HMAC com a stream_key da live (segredo interno, nunca mostrado).
// Formato compacto (≈50 caracteres) porque o FFmpeg limita usuário+senha da URL RTSP a 128 caracteres:
// base64url(id do admin 16 bytes + expiração 4 bytes) "." base64url(HMAC-SHA256 truncado em 16 bytes).
// O id da live não vai no token: vem do caminho publicado (live/{id}) e entra na assinatura.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const PUBLISH_TTL_S = 2 * 3600;

const uuidToBytes = (u: string) => Buffer.from(u.replace(/-/g, ''), 'hex');
const bytesToUuid = (b: Buffer) => {
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

function mac(streamKey: string, liveId: string, body: Buffer) {
  return createHmac('sha256', streamKey).update(uuidToBytes(liveId)).update(body).digest().subarray(0, 16);
}

export function signPublishToken(live: { id: string; streamKey: string }, adminUserId: string, now = Date.now(), ttlS = PUBLISH_TTL_S) {
  const exp = Math.floor(now / 1000) + ttlS;
  const body = Buffer.alloc(20);
  uuidToBytes(adminUserId).copy(body, 0);
  body.writeUInt32BE(exp, 16);
  return { token: `${body.toString('base64url')}.${mac(live.streamKey, live.id, body).toString('base64url')}`, expiresAt: exp * 1000 };
}

export function verifyPublishToken(token: string, live: { id: string; streamKey: string }, now = Date.now()): { adminUserId: string } | null {
  const [b, s] = token.split('.');
  if (!b || !s) return null;
  const body = Buffer.from(b, 'base64url');
  const sig = Buffer.from(s, 'base64url');
  if (body.length !== 20 || sig.length !== 16) return null;
  if (!timingSafeEqual(sig, mac(live.streamKey, live.id, body))) return null;
  if (body.readUInt32BE(16) * 1000 <= now) return null;
  return { adminUserId: bytesToUuid(body.subarray(0, 16)) };
}
