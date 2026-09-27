'use client';
import { useEffect, useRef, useState } from 'react';
import type { MyOrder, MyOrderItem } from '@/lib/orders';
import { formatBRL, formatInt } from '@/lib/money';
import { apiCall } from './useLiveRoom';
import { ProductImage, TrashIcon } from './parts';

/** Lista "Meus pedidos": clicar no item abre −/+ e Excluir (só com a live no ar). */
export function OrdersList({ order, onOrder, editable, variant }: { order: MyOrder; onOrder: (o: MyOrder) => void; editable: boolean; variant: 'drawer' | 'sheet' }) {
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  if (!order.items.length) {
    return <p className={`m-0 text-center text-[14px] text-muted ${variant === 'drawer' ? 'py-10' : 'py-5'}`}>Você ainda não tem pedidos nesta live.</p>;
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-[6px] p-0">
      {order.items.map((it) => (
        <Row
          key={it.id}
          it={it}
          variant={variant}
          editable={editable}
          open={open === it.id}
          confirming={open === it.id && confirm}
          onToggle={() => {
            setOpen(open === it.id ? null : it.id);
            setConfirm(false);
          }}
          onAskDelete={() => setConfirm(true)}
          onKeep={() => setConfirm(false)}
          onOrder={(o) => {
            onOrder(o);
            if (!o.items.some((x) => x.id === it.id)) {
              setOpen(null);
              setConfirm(false);
            }
          }}
        />
      ))}
    </ul>
  );
}

function Row(p: {
  it: MyOrderItem;
  variant: 'drawer' | 'sheet';
  editable: boolean;
  open: boolean;
  confirming: boolean;
  onToggle: () => void;
  onAskDelete: () => void;
  onKeep: () => void;
  onOrder: (o: MyOrder) => void;
}) {
  const { it } = p;
  const [qty, setQty] = useState(it.qty);
  const [text, setText] = useState(formatInt(it.qty));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastSent = useRef(it.qty);

  useEffect(() => {
    // O servidor manda o pedido atualizado (também de outro aparelho): sincroniza quando não há edição pendente.
    if (!timer.current) {
      setQty(it.qty);
      setText(formatInt(it.qty));
      lastSent.current = it.qty;
    }
  }, [it.qty]);

  async function send(n: number) {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (n === lastSent.current) return;
    setSaving(true);
    const r = await apiCall(`/api/order-items/${it.id}`, 'PATCH', { qty: n });
    setSaving(false);
    if (!r.ok) {
      setError(r.data.error?.message ?? 'Não foi possível alterar.');
      setQty(lastSent.current);
      setText(formatInt(lastSent.current));
      return;
    }
    setError('');
    lastSent.current = n;
    p.onOrder(r.data.order);
  }
  function schedule(n: number) {
    setQty(n);
    setText(formatInt(n));
    setError('');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => send(n), 450);
  }
  async function remove() {
    setSaving(true);
    const r = await apiCall(`/api/order-items/${it.id}`, 'DELETE');
    setSaving(false);
    if (!r.ok) return setError(r.data.error?.message ?? 'Não foi possível excluir.');
    p.onOrder(r.data.order);
  }

  const step = Math.max(1, it.stepQty);
  const sheet = p.variant === 'sheet';
  return (
    <li className={`rounded-[18px] transition-colors duration-200 ${p.open ? 'bg-surface-2' : 'bg-white'} ${sheet ? 'rounded-2xl border-t border-solid border-line-2' : ''}`}>
      <button
        type="button"
        onClick={p.editable ? p.onToggle : undefined}
        aria-expanded={p.editable ? p.open : undefined}
        disabled={!p.editable}
        className={`flex w-full items-center gap-3 border-none bg-transparent text-left text-ink disabled:cursor-default ${sheet ? 'px-2 py-[10px]' : 'p-3'}`}
      >
        <ProductImage item={it} className={sheet ? 'h-10 w-10 shrink-0' : 'h-11 w-11 shrink-0'} rounded="rounded-xl" label={false} />
        <span className="flex min-w-0 flex-grow flex-col gap-[2px]">
          <span className={`truncate font-medium ${sheet ? 'text-[14px]' : 'text-[15px]'}`}>{it.name}</span>
          <span className="text-[12px] text-muted">
            {formatBRL(it.unitPriceCents)}/un. · {sheet ? '' : 'subtotal '}
            {formatBRL(qty * it.unitPriceCents)}
          </span>
        </span>
        <span className={`font-medium tabular ${sheet ? 'text-[14px]' : 'text-[15px]'}`}>{formatInt(qty)} un.</span>
        {p.editable && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B6F76" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`transition-transform duration-200 ${p.open ? 'rotate-180' : ''}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>
      {p.open && !p.confirming && (
        <div className={`anim-fade flex items-center gap-2 ${sheet ? 'px-2 pb-3' : 'px-3 pb-3'}`}>
          <div className="flex items-center gap-1 rounded-full bg-white p-1">
            <button type="button" onClick={() => schedule(qty - step)} disabled={qty - step < Math.max(it.minQty, step) || saving} aria-label={`Diminuir ${formatInt(step)} unidades`} className="h-[38px] w-[38px] rounded-full border-none bg-surface-2 text-[18px] disabled:opacity-40">−</button>
            <span className="flex items-center gap-1 px-1">
              <input
                inputMode="numeric"
                aria-label={`Quantidade de ${it.name}`}
                value={text}
                onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ''))}
                onBlur={() => {
                  const n = parseInt(text.replace(/\D/g, ''), 10);
                  if (Number.isNaN(n)) {
                    setText(formatInt(qty));
                    return;
                  }
                  setQty(n);
                  setText(formatInt(n));
                  send(n);
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className={`h-[34px] rounded-[10px] border-none bg-surface-2 text-center font-medium text-ink ${sheet ? 'w-[72px] text-[16px]' : 'w-[76px] text-[15px]'}`}
              />
              <span className="text-[13px] text-muted">un.</span>
            </span>
            <button type="button" onClick={() => schedule(qty + step)} disabled={saving} aria-label={`Aumentar ${formatInt(step)} unidades`} className="h-[38px] w-[38px] rounded-full border-none bg-surface-2 text-[18px] disabled:opacity-40">+</button>
          </div>
          <div className="flex-grow" />
          {sheet ? (
            <button type="button" onClick={p.onAskDelete} aria-label="Excluir pedido" className="flex h-11 w-11 items-center justify-center rounded-full border-none bg-danger-bg text-danger">
              <TrashIcon size={16} />
            </button>
          ) : (
            <button type="button" onClick={p.onAskDelete} className="flex h-10 items-center gap-[6px] rounded-full border-none bg-danger-bg px-[14px] text-[13px] text-danger">
              <TrashIcon />
              Excluir
            </button>
          )}
        </div>
      )}
      {p.open && p.confirming && (
        <div className={`anim-fade flex items-center gap-2 rounded-full bg-danger-bg py-2 pl-[14px] pr-2 ${sheet ? 'mx-2 mb-3' : 'mx-3 mb-3'}`} role="alertdialog" aria-label="Confirmar exclusão">
          <span className="flex-grow text-[13px] text-danger">Excluir este pedido?</span>
          <button type="button" onClick={p.onKeep} className="h-[34px] rounded-full border-none bg-white px-3 text-[12px]">Manter</button>
          <button type="button" onClick={remove} disabled={saving} className="h-[34px] rounded-full border-none bg-live px-3 text-[12px] text-white">Excluir</button>
        </div>
      )}
      {error && <p role="alert" className="m-0 px-3 pb-3 text-[12px] text-danger">{error}</p>}
    </li>
  );
}
