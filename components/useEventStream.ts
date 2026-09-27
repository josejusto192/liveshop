'use client';
import { useEffect, useRef, useState } from 'react';

type Handlers = Record<string, (data: never) => void>;

/**
 * Assina um canal SSE. O navegador reconecta sozinho; a cada reconexão o servidor manda um `snapshot`.
 * `connected` fica falso enquanto a conexão está caída.
 */
export function useEventStream(url: string | null, handlers: Handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!url) return;
    const es = new EventSource(url);
    const names = Object.keys(ref.current);
    const listeners = names.map((name) => {
      const fn = (ev: MessageEvent) => {
        try {
          const h = ref.current[name] as ((d: unknown) => void) | undefined;
          h?.(JSON.parse(ev.data));
        } catch (e) {
          console.error('[sse]', name, e);
        }
      };
      es.addEventListener(name, fn as EventListener);
      return [name, fn] as const;
    });
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    return () => {
      for (const [n, fn] of listeners) es.removeEventListener(n, fn as EventListener);
      es.close();
    };
  }, [url]);
  return connected;
}

/** Relógio local sincronizado com o servidor (offset calculado a partir de `serverNow`). */
export function useServerClock(intervalMs = 250, initialServerNow?: number) {
  // Offset calculado uma vez na montagem; depois só `sync` (a cada evento do servidor) o corrige.
  const offset = useRef<number | null>(null);
  if (offset.current === null) offset.current = initialServerNow ? initialServerNow - Date.now() : 0;
  // Primeiro render igual no servidor e no navegador (evita erro de hidratação); depois, relógio local corrigido.
  const [now, setNow] = useState(() => initialServerNow ?? Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now() + (offset.current ?? 0)), intervalMs);
    return () => clearInterval(iv);
  }, [intervalMs]);
  const sync = (serverNow: number) => {
    offset.current = serverNow - Date.now();
  };
  return { now, sync };
}
