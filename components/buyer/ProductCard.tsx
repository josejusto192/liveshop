'use client';
import { useEffect, useRef, useState } from 'react';
import type { PublicItem } from '@/lib/live-state';
import { formatBRL, formatInt } from '@/lib/money';
import { IconClose } from '@/components/icons';
import { CheckIcon, ProductImage, QtyMessage, TimerChip, type Quantity } from './parts';

type Props = {
  item: PublicItem | null;
  position: number | null;
  total: number;
  hidden: boolean;
  showTimer: boolean;
  remainingMs: number;
  q: Quantity;
  registering: boolean;
  onRegister: () => void;
  alertOn: boolean;
  onToggleAlert: () => void;
  compact?: boolean;
  swapKey: string;
};

/** Card do produto no ar (desktop). Estados: disponível, estoque baixo, esgotado e oculto (EstadosProduto). */
export function ProductCard(p: Props) {
  const { item, q } = p;
  const [shake, setShake] = useState(0);
  const prevQty = useRef(q.qty);
  useEffect(() => {
    if (q.over && q.qty !== prevQty.current) setShake((n) => n + 1);
    prevQty.current = q.qty;
  }, [q.qty, q.over]);

  const card = `box-border flex flex-grow flex-col gap-4 rounded-card-lg bg-surface p-5 ${p.compact ? '' : ''}`;
  if (!item || p.hidden) {
    return (
      <div className={`${card} items-center justify-center text-center`} aria-live="polite">
        <span className="h-10 w-10 animate-[lsPulse_1.6s_ease-in-out_infinite] rounded-full bg-line-2" aria-hidden />
        <p className="m-0 text-[16px] font-medium">{p.hidden ? 'Produto em preparação' : 'Aguardando o próximo produto'}</p>
        <p className="m-0 max-w-[280px] text-[14px] leading-[1.5] text-muted">Fique na live: o produto aparece aqui em instantes.</p>
      </div>
    );
  }

  const out = q.kind === 'out';
  const low = q.kind === 'low';
  const inputId = `qtd-${p.compact ? 'v' : 'h'}`;
  const msgId = `${inputId}-msg`;
  return (
    <div key={p.swapKey} className={`${card} anim-swap`}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-muted">Produto {p.position} de {p.total}</span>
        {out ? (
          <span className="rounded-full bg-danger-bg px-3 py-[6px] text-[13px] font-medium text-danger">Esgotado</span>
        ) : low ? (
          <span className="rounded-full bg-warn-bg px-3 py-[6px] text-[13px] font-medium text-warn">Últimas {formatInt(item.available)} un.</span>
        ) : p.showTimer && p.remainingMs > 0 ? (
          <TimerChip ms={p.remainingMs} />
        ) : null}
      </div>
      <div className={`relative ${p.compact ? 'h-[150px]' : 'h-[170px]'} shrink-0`}>
        <ProductImage item={item} className={`h-full w-full ${out ? 'opacity-50' : ''}`} />
        {out && <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white">Todo o estoque foi pedido</span>}
      </div>
      <div className="flex flex-col gap-[6px]">
        <h2 className={`font-medium leading-[1.15] tracking-[-0.03em] ${p.compact ? 'text-[24px]' : 'text-[26px]'} ${out ? 'text-muted' : ''}`}>{item.name}</h2>
        {!out && (
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-ink px-[10px] py-[5px] text-[12px] font-medium text-white">{formatBRL(item.priceCents)} / un.</span>
            <span className="rounded-full bg-surface-2 px-[10px] py-[5px] text-[12px]">Estoque {formatInt(item.available)} un.</span>
            {!p.compact && <span className="rounded-full bg-surface-2 px-[10px] py-[5px] font-mono text-[12px]">{item.sku}</span>}
          </div>
        )}
        {low && (
          <div className="mt-1 h-[6px] overflow-hidden rounded-full bg-line-2" aria-hidden>
            <div className="h-[6px] rounded-full bg-[#F5A25A]" style={{ width: `${Math.max(2, Math.round((item.available / item.stockTotal) * 100))}%` }} />
          </div>
        )}
      </div>

      {out ? (
        <>
          <div className="flex flex-col gap-[6px] rounded-[18px] bg-surface-2 p-4">
            <span className="text-[14px] font-medium">Este produto esgotou durante a live</span>
            <span className="text-[13px] leading-[1.5] text-muted">Quem já registrou pedido está garantido. Fique na live: o próximo produto entra em instantes.</span>
          </div>
          <button type="button" onClick={p.onToggleAlert} aria-pressed={p.alertOn} className={`h-11 rounded-full border border-solid border-line text-[13px] font-medium ${p.alertOn ? 'bg-ink text-accent' : 'bg-white text-ink'}`}>
            {p.alertOn ? 'Vamos avisar se voltar ao estoque' : 'Avisar se voltar ao estoque'}
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-[10px]">
          <label htmlFor={inputId} className="text-[13px] text-muted">Quantidade</label>
          <div
            style={q.isError && shake ? { animation: `${shake % 2 ? 'lsShakeA' : 'lsShakeB'} .3s ease` } : undefined}
            className={`box-border flex items-center gap-2 rounded-[18px] pl-5 pr-2 transition-[background-color,box-shadow] duration-200 ${p.compact ? 'h-[62px]' : 'h-16'} ${q.isError ? 'bg-danger-bg shadow-[inset_0_0_0_2px_var(--live)]' : 'bg-surface-2 focus-within:shadow-[inset_0_0_0_2px_var(--ink)]'}`}
          >
            <input
              id={inputId}
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={q.isError}
              aria-describedby={msgId}
              value={q.text}
              onChange={(e) => q.onText(e.target.value)}
              onBlur={q.touch}
              onKeyDown={(e) => e.key === 'Enter' && p.onRegister()}
              placeholder="0"
              className={`min-w-0 flex-grow border-none bg-transparent font-medium tracking-[-0.03em] text-ink outline-none focus-visible:shadow-none ${p.compact ? 'text-[28px]' : 'text-[30px]'}`}
            />
            <span className="text-[14px] text-muted">un.</span>
            <button type="button" onClick={q.clear} aria-label="Zerar quantidade" className="flex h-11 w-11 items-center justify-center rounded-full border-none bg-white text-ink">
              <IconClose />
            </button>
          </div>
          {low ? (
            <div className="grid grid-cols-3 gap-2">
              {[50, 100].map((v) => (
                <button key={v} type="button" onClick={() => q.add(v)} className="h-[42px] rounded-full border border-solid border-line bg-white text-[13px] font-medium text-ink">+{formatInt(v)}</button>
              ))}
              <button type="button" onClick={q.useMax} disabled={q.maxOrder <= 0} className="h-[42px] rounded-full border-none bg-warn-bg text-[13px] font-medium text-warn disabled:opacity-50">Pedir o máximo</button>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {[10, 50, 100, 1000].map((v) => (
                <button key={v} type="button" onClick={() => q.add(v)} className="h-11 rounded-full border border-solid border-line bg-white text-[14px] font-medium text-ink">+{formatInt(v)}</button>
              ))}
            </div>
          )}
          <QtyMessage q={q} id={msgId} />
        </div>
      )}

      <div className="flex-grow" />
      {out ? (
        <button type="button" disabled className="h-14 cursor-default rounded-full border-none bg-bg text-[15px] font-medium text-[#8A8F99]">Esgotado</button>
      ) : q.over ? (
        <button type="button" disabled className="h-[58px] rounded-full border-none bg-bg text-[16px] font-medium text-[#8A8F99]">Quantidade acima do estoque</button>
      ) : (
        <button
          type="button"
          onClick={p.onRegister}
          disabled={p.registering}
          aria-describedby={msgId}
          className="flex h-[58px] items-center justify-between rounded-full border-none bg-ink pl-6 pr-2 text-[16px] font-medium text-white disabled:opacity-80"
        >
          {p.registering ? 'Registrando…' : 'Registrar pedido'}
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent"><CheckIcon /></span>
        </button>
      )}
      {!out && !p.compact && <p className="m-0 -mt-[6px] text-center text-[12px] text-muted">Sem pagamento agora. A fatura chega depois da live.</p>}
    </div>
  );
}
