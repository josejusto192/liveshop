import { NextResponse } from 'next/server';
import { apiError, readJson } from '@/lib/api';
import { requireAdminApi } from '@/lib/admin-api';
import { endLive, extendItem, gotoItem, nextItem, pauseItem, resumeItem, setHidden, setMode, startLive, type ControlResult } from '@/lib/live-control';
import { afterLiveEnded } from '@/lib/post-live';

type Ctx = { params: Promise<{ id: string; action: string }> };

// start · end · next · goto { itemId } · pause · resume · extend { seconds } · hide · show · mode { mode }
export async function POST(req: Request, { params }: Ctx) {
  const admin = await requireAdminApi('lives:write');
  if (admin instanceof Response) return admin;
  const { id, action } = await params;
  const b = await readJson(req);
  let r: ControlResult;
  switch (action) {
    case 'start': r = await startLive(id); break;
    case 'end':
      r = await endLive(id);
      if (r.ok) afterLiveEnded(id).catch((e) => console.error('[pós-live]', e));
      break;
    case 'next': r = await nextItem(id); break;
    case 'goto':
      if (typeof b.itemId !== 'string') return apiError('invalid', 'Escolha o produto.');
      r = await gotoItem(id, b.itemId);
      break;
    case 'pause': r = await pauseItem(id); break;
    case 'resume': r = await resumeItem(id); break;
    case 'extend': r = await extendItem(id, b.seconds === undefined ? 300 : Number(b.seconds)); break;
    case 'hide': r = await setHidden(id, true); break;
    case 'show': r = await setHidden(id, false); break;
    case 'mode': r = await setMode(id, b.mode as 'auto' | 'manual'); break;
    default: return apiError('not_found', 'Ação desconhecida.', 404);
  }
  if (!r.ok) return apiError(r.code, r.message, r.status);
  return NextResponse.json({ ok: true });
}
