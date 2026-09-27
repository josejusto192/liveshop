'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEventStream, useServerClock } from '@/components/useEventStream';
import type { BuyerItemState, BuyerSnapshot, LiveInfo, PublicItem } from '@/lib/live-state';
import type { MyOrder } from '@/lib/orders';

export type Activity = { id: number; text: string; at: number };

/**
 * Estado da live no navegador do comprador. As mudanças do item chegam com `effectiveAt`
 * (troca + atraso do vídeo) e só aparecem nesse instante, alinhadas com o vídeo.
 */
export function useLiveRoom(slug: string, initial: BuyerSnapshot, initialOrder: MyOrder) {
  const router = useRouter();
  const { now, sync } = useServerClock(250, initial.current.serverNow);
  const [live, setLive] = useState<LiveInfo>(initial.live);
  const [items, setItems] = useState<PublicItem[]>(initial.items);
  const [viewers, setViewers] = useState(initial.viewers);
  const [myOrder, setMyOrder] = useState<MyOrder>(initialOrder);
  const [activity, setActivity] = useState<Activity[]>([]);
  // Fila de estados do item: o exibido é o último com effectiveAt <= agora.
  const [states, setStates] = useState<BuyerItemState[]>(() => (initial.previous ? [{ ...initial.previous, effectiveAt: 0 }, initial.current] : [initial.current]));
  const [pendingStatus, setPendingStatus] = useState<{ status: LiveInfo['status']; effectiveAt: number } | null>(null);
  const actId = useRef(0);

  const pushState = useCallback((s: BuyerItemState) => {
    setStates((list) => {
      const next = [...list.filter((x) => x.effectiveAt <= s.effectiveAt), s];
      return next.slice(-4);
    });
  }, []);

  const connected = useEventStream(`/api/lives/${slug}/stream`, {
    snapshot: (s: BuyerSnapshot) => {
      sync(s.current.serverNow);
      setLive(s.live);
      setItems(s.items);
      setViewers(s.viewers);
      setStates(s.previous ? [{ ...s.previous, effectiveAt: 0 }, s.current] : [s.current]);
    },
    item: (s: BuyerItemState) => {
      sync(s.serverNow);
      pushState(s);
    },
    items: (d: { items: PublicItem[] }) => setItems(d.items),
    stock: (d: { productId: string; available: number }) => setItems((list) => list.map((i) => (i.productId === d.productId ? { ...i, available: d.available } : i))),
    viewers: (d: { count: number }) => setViewers(d.count),
    activity: (d: { text: string; at: number }) => setActivity((a) => [{ id: ++actId.current, text: d.text, at: d.at }, ...a].slice(0, 6)),
    status: (d: { status: LiveInfo['status']; effectiveAt: number; startedAt: number | null; endedAt: number | null }) => {
      setLive((l) => ({ ...l, startedAt: d.startedAt ?? l.startedAt, endedAt: d.endedAt ?? l.endedAt }));
      setPendingStatus({ status: d.status, effectiveAt: d.effectiveAt });
    },
    'my-order': (d: { order: MyOrder }) => setMyOrder(d.order),
  });

  // Status (fim da live) respeita o atraso do vídeo.
  useEffect(() => {
    if (!pendingStatus || now < pendingStatus.effectiveAt) return;
    setLive((l) => ({ ...l, status: pendingStatus.status }));
    setPendingStatus(null);
    if (pendingStatus.status === 'ended') router.refresh();
  }, [now, pendingStatus, router]);

  const current = useMemo(() => {
    let shown = states[0];
    for (const s of states) if (s.effectiveAt <= now) shown = s;
    return shown;
  }, [states, now]);

  const item = items.find((i) => i.id === current.itemId) ?? null;
  const remainingMs = current.paused || current.endsAt === null ? (current.remainingMs ?? 0) : Math.max(0, current.endsAt - now);
  const qtyInOrder = (productId: string) => myOrder.items.find((i) => i.productId === productId)?.qty ?? 0;

  return { live, items, viewers, myOrder, setMyOrder, activity, current, item, remainingMs, now, connected, qtyInOrder };
}
export type LiveRoomState = ReturnType<typeof useLiveRoom>;

export async function apiCall(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
