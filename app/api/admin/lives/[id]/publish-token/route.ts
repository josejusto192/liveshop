import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { apiError } from '@/lib/api';
import { requireAdminApi } from '@/lib/admin-api';
import { db, schema } from '@/lib/db';
import { signPublishToken } from '@/lib/publish-token';
import { iceServers, whipUrlFor } from '@/lib/video';

// Token curto para a tela Transmitir publicar por WHIP. Só dona e operador.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi('lives:write');
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const [live] = await db.select({ id: schema.lives.id, streamKey: schema.lives.streamKey, status: schema.lives.status }).from(schema.lives).where(eq(schema.lives.id, id));
  if (!live) return apiError('not_found', 'Live não encontrada.', 404);
  if (live.status === 'ended') return apiError('ended', 'Esta live já foi encerrada.', 409);
  if (live.status === 'draft') return apiError('draft', 'Agende a live (Salvar e abrir central) antes de transmitir.', 409);
  const { token, expiresAt } = signPublishToken(live, admin.id);
  return NextResponse.json({ whipUrl: whipUrlFor(live.id), token, expiresAt, iceServers: iceServers() });
}
