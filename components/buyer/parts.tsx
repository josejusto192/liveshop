'use client';
import { useEffect, useRef, useState } from 'react';
import type { PublicItem } from '@/lib/live-state';
import type { MyOrder } from '@/lib/orders';
import { formatBRL, formatInt } from '@/lib/money';
import { IconClose } from '@/components/icons';

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const mmss = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600);
  return h ? `${h}:${pad2(Math.floor((t % 3600) / 60))}:${pad2(t % 60)}` : `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`;
};
export const hhmmss = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${pad2(Math.floor(t / 3600))}:${pad2(Math.floor((t % 3600) / 60))}:${pad2(t % 60)}`;
};
export const initialsOf = (name: string) => {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? '') + (w[1]?.[0] ?? '')).toUpperCase();
};

export type StockKind = 'in' | 'low' | 'out';
export function stockKindOf(item: Pick<PublicItem, 'available' | 'stockTotal'>): StockKind {
  if (item.available <= 0) return 'out';
  return item.available / Math.max(1, item.stockTotal) < 0.1 ? 'low' : 'in';
}

/** Quantidade do card: texto no formato brasileiro, validação igual à do servidor. */
export function useQuantity(item: PublicItem | null, existingQty: number) {
  const [qty, setQty] = useState(0);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState('');
  const itemId = item?.id;
  useEffect(() => {
    setQty(0);
    setTouched(false);
    setServerError('');
  }, [itemId]);

  const kind = item ? stockKindOf(item) : 'in';
  const available = item ? Math.max(0, item.available) : 0;
  const step = item?.stepQty ?? 1;
  const min = item?.minQty ?? 1;
  const over = !!item && item.blockOverStock && qty > available;
  let error = '';
  if (item && qty > 0) {
    if (over) error = kind === 'low' ? `Só restam ${formatInt(available)} un. Ajuste a quantidade ou peça o máximo.` : `Só temos ${formatInt(available)} un. em estoque. Ajuste a quantidade.`;
    else if (touched && step > 1 && qty % step !== 0) error = `Use múltiplos de ${formatInt(step)}`;
    else if (touched && qty + existingQty < min) error = `Pedido mínimo ${formatInt(min)} un.`;
  }
  const message = serverError || error || (item && qty > 0 ? `Subtotal: ${formatInt(qty)} × ${formatBRL(item.priceCents)} = ${formatBRL(qty * item.priceCents)}` : '');
  const invalidNow = !!error || (step > 1 && qty % step !== 0) || qty + existingQty < min;
  const maxOrder = item ? Math.floor(available / step) * step : 0;

  return {
    qty,
    text: qty ? formatInt(qty) : '',
    kind,
    over,
    error: serverError || error,
    message,
    isError: !!(serverError || error),
    canSubmit: !!item && qty > 0 && !invalidNow && kind !== 'out',
    set: (n: number) => {
      setServerError('');
      setQty(Math.max(0, Math.min(n, 10_000_000)));
    },
    onText: (v: string) => {
      setServerError('');
      const n = parseInt(v.replace(/\D/g, ''), 10);
      setQty(Number.isNaN(n) ? 0 : Math.min(n, 10_000_000));
    },
    add: (n: number) => {
      setServerError('');
      setQty((q) => q + n);
    },
    clear: () => {
      setServerError('');
      setTouched(false);
      setQty(0);
    },
    useMax: () => {
      setServerError('');
      setQty(maxOrder);
    },
    maxOrder,
    touch: () => setTouched(true),
    setServerError,
    reset: () => {
      setQty(0);
      setTouched(false);
      setServerError('');
    },
  };
}
export type Quantity = ReturnType<typeof useQuantity>;

export function ProductImage({ item, className = '', rounded = 'rounded-[18px]', label = true }: { item: Pick<PublicItem, 'imageUrl' | 'name'> | null; className?: string; rounded?: string; label?: boolean }) {
  if (item?.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.imageUrl} alt={item.name} className={`${rounded} object-cover ${className}`} />;
  }
  return (
    <div className={`stripes flex items-center justify-center text-[13px] text-muted ${rounded} ${className}`} aria-hidden>
      {label ? '[Foto do produto]' : null}
    </div>
  );
}

export function TimerChip({ ms, small = false }: { ms: number; small?: boolean }) {
  const warn = ms <= 60_000;
  return (
    <span className={`inline-flex items-center gap-[6px] rounded-full font-medium ${small ? 'px-[9px] py-[3px] text-[11px]' : 'px-3 py-[6px] text-[13px]'} ${warn ? 'bg-warn-bg text-warn' : 'bg-accent text-ink'}`}>
      {!small && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      )}
      Disponível por <span className="font-mono tabular">{mmss(ms)}</span>
    </span>
  );
}

export function BagIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 8h14l-1.2 12H6.2z" />
      <path d="M9 11V7a3 3 0 0 1 6 0v4" />
    </svg>
  );
}
export function EyeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
export function SoundIcon({ muted, size = 18 }: { muted: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5L6 9H2v6h4l5 4z" />
      {muted ? <path d="M22 9l-6 6M16 9l6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />}
    </svg>
  );
}
export function CheckIcon({ size = 18, color = '#111214', width = 2.2 }: { size?: number; color?: string; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
export function TrashIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </svg>
  );
}

/** Mensagem abaixo da quantidade (subtotal ou erro). */
export function QtyMessage({ q, id }: { q: Quantity; id: string }) {
  return (
    <span id={id} role="status" aria-live="polite" className={`min-h-[18px] text-[13px] ${q.isError ? 'text-danger' : 'text-ink-2'}`}>
      {q.message}
    </span>
  );
}

/** Aviso "Pedido registrado" (some em 3,6 s). */
export function useOrderToast(ms = 3600) {
  const [toast, setToast] = useState<null | { line: string; key: number }>(null);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = (line: string) => {
    clearTimeout(t.current);
    setToast({ line, key: Date.now() });
    t.current = setTimeout(() => setToast(null), ms);
  };
  useEffect(() => () => clearTimeout(t.current), []);
  return { toast, show, close: () => setToast(null) };
}

export function orderTotals(o: MyOrder) {
  return {
    units: formatInt(o.totalUnits),
    money: formatBRL(o.totalCents),
    count: `${o.items.length} ${o.items.length === 1 ? 'produto' : 'produtos'}`,
  };
}

export function DesktopOrderToast({ toast, order, onClose }: { toast: { line: string; key: number } | null; order: MyOrder; onClose: () => void }) {
  const t = orderTotals(order);
  return (
    <div aria-live="polite" className="pointer-events-none">
      {toast && (
        <div key={toast.key} role="status" className="anim-pop-top pointer-events-auto fixed left-1/2 top-24 z-40 flex items-center gap-[14px] rounded-full bg-dark py-[10px] pl-3 pr-[10px] text-white shadow-[0_18px_44px_rgba(17,18,20,0.28)]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent"><CheckIcon width={2.6} /></span>
          <div className="flex flex-col gap-px">
            <span className="text-[14px] font-medium">Pedido registrado · {toast.line}</span>
            <span className="text-[13px] text-dark-muted">
              Total registrado: <span className="font-medium text-accent">{t.units} un. · {t.money}</span>
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar aviso" className="ml-2 flex h-9 w-9 items-center justify-center rounded-full border-none bg-dark-3 text-white">
            <IconClose />
          </button>
        </div>
      )}
    </div>
  );
}

export function MobileOrderToast({ toast, order }: { toast: { line: string; key: number } | null; order: MyOrder }) {
  const t = orderTotals(order);
  return (
    <div aria-live="polite" className="pointer-events-none">
      {toast && (
        <div key={toast.key} role="status" className="anim-in absolute left-3 right-3 top-[70px] z-30 flex items-center gap-[10px] rounded-full bg-white py-2 pl-2 pr-[14px] text-ink shadow-[0_14px_34px_rgba(0,0,0,0.3)]">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-ink"><CheckIcon size={15} color="#D6F35B" width={2.6} /></span>
          <span className="flex min-w-0 flex-grow flex-col">
            <span className="truncate text-[13px] font-medium">Pedido registrado · {toast.line}</span>
            <span className="text-[12px] text-muted">
              Total: <span className="font-medium text-ink">{t.units} un. · {t.money}</span>
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
