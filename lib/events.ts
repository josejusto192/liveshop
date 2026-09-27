// Barramento de eventos em memória: um canal por live, compartilhado pelo relógio e pelas rotas SSE.
// simplificação: event bus em memória, trocar por Postgres LISTEN/NOTIFY quando houver mais de uma instância
import { EventEmitter } from 'node:events';

export type Audience = 'buyer' | 'admin' | 'all';
export type LiveEvent = { event: string; data: unknown; audience: Audience };

type Globals = {
  __lsBus?: EventEmitter;
  __lsViewers?: Map<string, Map<string, number>>;
};
const g = globalThis as unknown as Globals;

const bus =
  g.__lsBus ??
  (g.__lsBus = (() => {
    const e = new EventEmitter();
    e.setMaxListeners(0);
    return e;
  })());

export function publish(liveId: string, event: string, data: unknown, audience: Audience = 'all') {
  bus.emit(liveId, { event, data, audience } satisfies LiveEvent);
}

export function subscribe(liveId: string, fn: (e: LiveEvent) => void) {
  bus.on(liveId, fn);
  return () => {
    bus.off(liveId, fn);
  };
}

// "Assistindo agora": empresas distintas com o canal SSE aberto, por live.
const viewers = g.__lsViewers ?? (g.__lsViewers = new Map());

export function addViewer(liveId: string, companyId: string) {
  const m = viewers.get(liveId) ?? new Map<string, number>();
  m.set(companyId, (m.get(companyId) ?? 0) + 1);
  viewers.set(liveId, m);
  return () => {
    const cur = viewers.get(liveId);
    if (!cur) return;
    const n = (cur.get(companyId) ?? 1) - 1;
    if (n <= 0) cur.delete(companyId);
    else cur.set(companyId, n);
  };
}

export function viewerCount(liveId: string) {
  return viewers.get(liveId)?.size ?? 0;
}
