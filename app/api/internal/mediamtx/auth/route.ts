import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { can } from '@/lib/permissions';
import { verifyPublishToken } from '@/lib/publish-token';

// Chamado pelo MediaMTX (authHTTPAddress, rede interna) a cada publicação.
// Leitura (HLS) é liberada no próprio MediaMTX (authHTTPExclude). Publicar exige o token da tela Transmitir,
// emitido para dona ou operador. O republicador de áudio AAC (FFmpeg dentro do MediaMTX) usa a credencial interna.
type AuthBody = { user?: string; password?: string; token?: string; ip?: string; action?: string; path?: string; protocol?: string; query?: string };

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ok = () => new Response(null, { status: 200 });
const deny = () => new Response(null, { status: 401 });

export async function POST(req: Request) {
  let b: AuthBody;
  try {
    b = (await req.json()) as AuthBody;
  } catch {
    return deny();
  }
  if (process.env.DEBUG_MEDIAMTX_AUTH === '1') console.log('[mediamtx auth]', JSON.stringify({ ...b, password: b.password ? `${b.password.slice(0, 6)}…${b.password.slice(-6)} (${b.password.length})` : '', token: b.token ? `${b.token.slice(0, 6)}…` : '' }));
  const secret = process.env.MEDIAMTX_AUTH_SECRET;
  const internal = !!secret && b.user === 'internal' && b.password === secret;
  const path = b.path ?? '';

  if (b.action === 'read' || b.action === 'playback') return ok();
  if (b.action === 'api' || b.action === 'metrics' || b.action === 'pprof') return internal ? ok() : deny();
  if (b.action !== 'publish') return deny();

  const aac = path.match(new RegExp(`^live/(${UUID})-aac$`));
  if (aac) return internal ? ok() : deny();

  const m = path.match(new RegExp(`^live/(${UUID})$`));
  if (!m) return deny();
  const [live] = await db.select({ id: schema.lives.id, streamKey: schema.lives.streamKey, status: schema.lives.status }).from(schema.lives).where(eq(schema.lives.id, m[1]));
  if (!live || (live.status !== 'scheduled' && live.status !== 'live')) return deny();

  const fromQuery = new URLSearchParams(b.query ?? '').get('token') ?? undefined;
  const token = b.token || fromQuery || b.password || '';
  const v = token ? verifyPublishToken(token, live) : null;
  if (!v) return deny();
  const [user] = await db.select({ role: schema.adminUsers.role }).from(schema.adminUsers).where(eq(schema.adminUsers.id, v.adminUserId));
  if (!user || !can(user.role, 'lives:write')) return deny();
  return ok();
}
