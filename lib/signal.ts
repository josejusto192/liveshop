// Sinal da transmissão: consulta a API interna do MediaMTX e avisa a Central quando muda.
import { publish } from './events';

export type SignalState = 'none' | 'receiving' | 'unstable';
export type Signal = { state: SignalState; since: number; kbps: number | null; tracks: string[] };

type Mem = Signal & { bytes: number; at: number; lost: number; received: number };
const g = globalThis as unknown as { __lsSignal?: Map<string, Mem> };
const mem = g.__lsSignal ?? (g.__lsSignal = new Map());

const API = () => (process.env.MEDIAMTX_API_URL || 'http://localhost:9997').replace(/\/$/, '');

export function signalOf(liveId: string): Signal {
  const m = mem.get(liveId);
  return m ? { state: m.state, since: m.since, kbps: m.kbps, tracks: m.tracks } : { state: 'none', since: Date.now(), kbps: null, tracks: [] };
}

type PathItem = { name: string; ready: boolean; bytesReceived: number; tracks?: string[]; source?: { type: string; id: string } | null };
type WebrtcSession = { path: string; state: string; rtpPacketsReceived?: number; rtpPacketsLost?: number };

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${API()}${path}`, { signal: AbortSignal.timeout(1500), cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/** Atualiza o sinal das lives informadas. `now` injetável para testes. */
export async function pollSignals(liveIds: string[], now = Date.now()) {
  if (!liveIds.length) return;
  const paths = await getJson<{ items: PathItem[] }>('/v3/paths/list?itemsPerPage=1000');
  const sessions = await getJson<{ items: WebrtcSession[] }>('/v3/webrtcsessions/list?itemsPerPage=1000');
  for (const id of liveIds) {
    const entry = paths?.items.find((i) => i.name === `live/${id}`);
    const sess = sessions?.items.find((s) => s.path === `live/${id}` && s.state === 'publish');
    updateSignal(id, entry ?? null, sess ?? null, now);
  }
}

export function updateSignal(liveId: string, entry: PathItem | null, sess: WebrtcSession | null, now: number) {
  const prev = mem.get(liveId);
  const ready = !!entry?.ready;
  const bytes = entry?.bytesReceived ?? 0;
  let kbps: number | null = null;
  let state: SignalState = 'none';
  if (ready) {
    if (prev && prev.at && now > prev.at && bytes >= prev.bytes) kbps = Math.round(((bytes - prev.bytes) * 8) / (now - prev.at));
    const lost = sess?.rtpPacketsLost ?? 0;
    const received = sess?.rtpPacketsReceived ?? 0;
    const dLost = prev ? lost - prev.lost : 0;
    const dRecv = prev ? received - prev.received : 0;
    const lossRatio = dRecv + dLost > 0 ? dLost / (dRecv + dLost) : 0;
    // Instável: perda de pacotes acima de 3% ou quase nada chegando.
    state = kbps !== null && (kbps < 80 || lossRatio > 0.03) ? 'unstable' : 'receiving';
  }
  const next: Mem = {
    state,
    since: prev && prev.state === state ? prev.since : now,
    kbps,
    tracks: entry?.tracks ?? [],
    bytes,
    at: now,
    lost: sess?.rtpPacketsLost ?? 0,
    received: sess?.rtpPacketsReceived ?? 0,
  };
  mem.set(liveId, next);
  if (!prev || prev.state !== state || Math.abs((prev.kbps ?? 0) - (kbps ?? 0)) > 200) {
    publish(liveId, 'signal', { state, since: next.since, kbps, tracks: next.tracks }, 'admin');
  }
}
