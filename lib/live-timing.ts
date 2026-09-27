// Cálculo do tempo do item no ar. O servidor é a fonte da verdade (docs/03, "Live").
export type TimingLive = {
  status: 'draft' | 'scheduled' | 'live' | 'ended';
  mode: 'auto' | 'manual';
  currentItemId: string | null;
  itemStartedAt: Date | null;
  pausedAt: Date | null;
  extraMs: number;
};
export type TimingItem = { id: string; position: number; durationS: number };

export type ItemTiming = {
  totalMs: number;
  elapsedMs: number;
  remainingMs: number;
  /** Quando o tempo acaba, se não estiver pausado. Pausado: null. */
  endsAt: Date | null;
  paused: boolean;
};

export function itemTiming(live: TimingLive, item: TimingItem | null | undefined, now: Date): ItemTiming | null {
  if (!item || !live.itemStartedAt) return null;
  const ref = live.pausedAt ?? now;
  const totalMs = item.durationS * 1000 + live.extraMs;
  const elapsedMs = Math.max(0, ref.getTime() - live.itemStartedAt.getTime());
  const remainingMs = Math.max(0, totalMs - elapsedMs);
  return {
    totalMs,
    elapsedMs,
    remainingMs,
    endsAt: live.pausedAt ? null : new Date(live.itemStartedAt.getTime() + totalMs),
    paused: !!live.pausedAt,
  };
}

export function sortItems<T extends { position: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position);
}

/** Próximo item do roteiro depois do atual (por posição). */
export function nextItemOf<T extends TimingItem>(items: T[], currentId: string | null): T | null {
  const sorted = sortItems(items);
  if (!currentId) return sorted[0] ?? null;
  const idx = sorted.findIndex((i) => i.id === currentId);
  return idx >= 0 ? (sorted[idx + 1] ?? null) : (sorted[0] ?? null);
}

/** Troca automática: modo automático, sem pausa, tempo esgotado e existe um próximo item. */
export function shouldAutoAdvance(live: TimingLive, items: TimingItem[], now: Date): TimingItem | null {
  if (live.status !== 'live' || live.mode !== 'auto' || live.pausedAt || !live.currentItemId) return null;
  const cur = items.find((i) => i.id === live.currentItemId);
  const t = itemTiming(live, cur, now);
  if (!t || t.remainingMs > 0) return null;
  return nextItemOf(items, live.currentItemId);
}

/** "12:40" / "1:02:03" */
export function mmss(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** "00:34:12" (tempo de live) */
export function hhmmss(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}
