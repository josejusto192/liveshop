import { NextResponse } from 'next/server';
import { apiError, readJson } from '@/lib/api';
import { requireAdminApi } from '@/lib/admin-api';
import { setTicketStatus, type TicketStatus } from '@/lib/support';

// { status } — a agência responde por e-mail ou WhatsApp e marca como respondido.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi('support:write');
  if (admin instanceof Response) return admin;
  const b = await readJson(req);
  const status = String(b.status ?? '') as TicketStatus;
  if (!['open', 'answered', 'closed'].includes(status)) return apiError('invalid_status', 'Status inválido.');
  const ok = await setTicketStatus((await params).id, status);
  if (!ok) return apiError('not_found', 'Chamado não encontrado.', 404);
  return NextResponse.json({ ok: true });
}
