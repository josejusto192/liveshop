import { apiError } from '@/lib/api';
import { getCompany } from '@/lib/auth';
import { liveIdBySlug, recordAttendance } from '@/lib/buyer-live';
import { addViewer, subscribe } from '@/lib/events';
import { buyerSnapshot, loadLive } from '@/lib/live-state';
import { sseResponse } from '@/lib/sse';

export const dynamic = 'force-dynamic';

// SSE do comprador: snapshot ao conectar e depois status, item, stock, activity, viewers, items.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const company = await getCompany();
  if (!company) return apiError('unauthorized', 'Entre com o código para assistir.', 401);
  const l = await liveIdBySlug((await params).slug);
  if (!l) return apiError('not_found', 'Live não encontrada.', 404);
  return sseResponse(req, async (send, sendFrame) => {
    const full = await loadLive(l.id);
    if (!full) return;
    if (full.live.status === 'live') await recordAttendance(l.id, company.id);
    const removeViewer = addViewer(l.id, company.id);
    const unsub = subscribe(l.id, (e) => {
      if (e.audience === 'admin') return;
      // Pedidos são privados: cada comprador só recebe os eventos do próprio pedido.
      if (e.event === 'my-order') {
        const d = e.data as { companyId: string };
        if (d.companyId !== company.id) return;
      }
      if (e.event === 'status' && (e.data as { status: string }).status === 'live') recordAttendance(l.id, company.id).catch(() => {});
      sendFrame(e.frame());
    });
    send('snapshot', buyerSnapshot(full));
    return () => {
      unsub();
      removeViewer();
    };
  });
}
