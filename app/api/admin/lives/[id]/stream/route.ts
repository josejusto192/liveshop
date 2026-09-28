import { requireAdminApi } from '@/lib/admin-api';
import { subscribe } from '@/lib/events';
import { adminSnapshot, loadLive } from '@/lib/live-state';
import { signalOf } from '@/lib/signal';
import { sseResponse } from '@/lib/sse';
import { apiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

// SSE da Central e da tela Transmitir: tudo do canal do comprador, sem atraso, mais pedidos, KPIs e sinal.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi('lives:write');
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const full = await loadLive(id);
  if (!full) return apiError('not_found', 'Live não encontrada.', 404);
  return sseResponse(req, async (send, sendFrame) => {
    const unsub = subscribe(id, (e) => {
      if (e.audience !== 'buyer') sendFrame(e.frame());
    });
    send('snapshot', await adminSnapshot(full, { signal: signalOf(id) }));
    return unsub;
  });
}
