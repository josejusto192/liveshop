'use client';
import { useEffect, useState } from 'react';

/** Tempo desde `since` em hh:mm:ss, atualizado a cada segundo. */
export function Elapsed({ since, className }: { since: number; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const ms = Math.max(0, (now ?? since) - since);
  const t = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return <span className={`tabular ${className ?? ''}`}>{`${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`}</span>;
}
