// Barramento de eventos em memória: um canal por live, compartilhado pelo relógio e pelas rotas SSE.
// simplificação: event bus em memória, trocar por Postgres LISTEN/NOTIFY quando houver mais de uma instância
import { EventEmitter } from 'node:events';

export type Audience = 'buyer' | 'admin' | 'all';
export type LiveEvent = { event: string; data: unknown; audience: Audience; frame: () => Uint8Array };

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

const enc = new TextEncoder();

/** Publica um evento. O quadro SSE é serializado uma única vez e reaproveitado por todas as conexões. */
export function publish(liveId: string, event: string, data: unknown, audience: Audience = 'all') {
  let bytes: Uint8Array | undefined;
  const frame = () => (bytes ??= enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  bus.emit(liveId, { event, data, audience, frame } satisfies LiveEvent);
}

// Picos de pedidos: no máximo um evento por chave a cada `ms`, sempre com o dado mais recente (trailing).
const throttles = new Map<string, { last: number; timer?: ReturnType<typeof setTimeout>; args?: [string, string, unknown, Audience] }>();
export function publishThrottled(key: string, ms: number, liveId: string, event: string, data: unknown, audience: Audience = 'all') {
  const now = Date.now();
  const t = throttles.get(key) ?? { last: 0 };
  throttles.set(key, t);
  if (!t.timer && now - t.last >= ms) {
    t.last = now;
    publish(liveId, event, data, audience);
    return;
  }
  t.args = [liveId, event, data, audience];
  if (!t.timer) {
    t.timer = setTimeout(() => {
      t.timer = undefined;
      t.last = Date.now();
      if (t.args) publish(...t.args);
      t.args = undefined;
    }, Math.max(0, ms - (now - t.last)));
  }
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
