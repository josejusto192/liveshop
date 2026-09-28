'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { IconClose } from '@/components/icons';
import { IconPaperclip, IconWhatsapp } from '@/components/admin/icons-extra';
import { formatBRL, formatInt } from '@/lib/money';
import { initialsOf, waLink } from '@/lib/phone';
import { ADMIN_STATUS_LABEL, offsetLabel, ORDER_STATUSES, STATUS_PILL, type OrderStatus } from '@/lib/orders-shared';
import type { AdminOrderDetail } from '@/lib/admin-orders';

const when = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)).replace(',', ' ·') : null;

/** Painel do pedido (empresa + live): itens, status, fatura e contato. */
export function OrderPanel({ orderId, canStatus, onClose, onChanged }: { orderId: string; canStatus: boolean; onClose: () => void; onChanged: (msg: string) => void }) {
  const [o, setO] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [closing, setClosing] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/orders/${orderId}`);
    const data = await res.json();
    if (!res.ok) return setError(data.error?.message ?? 'Não foi possível abrir o pedido.');
    setO(data.order);
  }, [orderId]);

  useEffect(() => {
    setO(null);
    setError('');
    setConfirmCancel(false);
    load();
  }, [load]);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 220);
  }, [onClose]);

  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  async function setStatus(status: OrderStatus) {
    if (!o) return;
    setBusy(true);
    setError('');
    const res = await fetch('/api/admin/orders/bulk-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderIds: [o.id], status }) });
    const data = await res.json();
    setBusy(false);
    setConfirmCancel(false);
    if (!res.ok) return setError(data.error?.message ?? 'Não foi possível mudar o status.');
    await load();
    onChanged(`Pedido ${o.code} agora está ${ADMIN_STATUS_LABEL[status].toLowerCase()}`);
  }

  async function upload(f: File) {
    if (!o) return;
    setBusy(true);
    setError('');
    const fd = new FormData();
    fd.append('file', f);
    const res = await fetch(`/api/admin/orders/${o.id}/invoice`, { method: 'POST', body: fd });
    const data = await res.json();
    setBusy(false);
    if (file.current) file.current.value = '';
    if (!res.ok) return setError(data.error?.message ?? 'Não foi possível anexar a fatura.');
    const before = o.status;
    setO(data.order);
    onChanged(before !== data.order.status ? `Fatura anexada. Pedido ${o.code} marcado como faturado` : `Fatura do pedido ${o.code} anexada`);
  }

  const ended = o?.live.status === 'ended';
  const units = o?.lines.reduce((a, l) => a + l.qty, 0) ?? 0;
  const cents = o?.lines.reduce((a, l) => a + l.subtotalCents, 0) ?? 0;
  const steps = o
    ? [
        ['Pedido registrado', o.createdAt],
        ['Enviado à marca', o.sentToBrandAt],
        ['Fatura emitida', o.invoicedAt],
        ['Entregue', o.deliveredAt],
        ...(o.canceledAt ? [['Cancelado', o.canceledAt]] : []),
      ]
    : [];

  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Fechar" onClick={close} className={`absolute inset-0 cursor-default border-none bg-[rgba(17,18,20,0.35)] p-0 ${closing ? 'opacity-0' : 'anim-overlay'}`} />
      <aside role="dialog" aria-modal="true" aria-labelledby="order-panel-title" className={`absolute inset-2 box-border flex flex-col sm:inset-y-4 sm:left-auto sm:right-4 sm:w-[420px] gap-4 overflow-y-auto rounded-card bg-bg p-4 ${closing ? 'anim-drawer-out' : 'anim-drawer'}`}>
        <section className="on-dark box-border flex flex-col gap-[14px] rounded-card bg-dark p-[22px] text-white">
          <div className="flex items-start gap-3">
            <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-accent text-[16px] font-semibold text-ink">{o ? initialsOf(o.company.name) : ''}</span>
            <div className="flex min-w-0 flex-grow flex-col gap-[2px]">
              <h2 id="order-panel-title" className="truncate text-[18px] font-medium tracking-[-0.02em]">{o?.company.name ?? 'Carregando…'}</h2>
              <span className="text-[12px] text-dark-muted">{o ? `Pedido ${o.code} · ${o.live.name}` : ''}</span>
            </div>
            <button ref={closeBtn} type="button" onClick={close} aria-label="Fechar painel" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-none bg-dark-2 text-white">
              <IconClose />
            </button>
          </div>
          {o && (
            <>
              <div className="flex flex-col gap-[6px] text-[13px] text-[#D5D8DE]">
                <span>{o.company.email}</span>
                <span>{o.company.whatsapp}</span>
                {o.company.cnpj && <span>CNPJ {o.company.cnpj}</span>}
                {(o.company.address || o.company.city) && <span>{[o.company.address, o.company.city, o.company.cep].filter(Boolean).join(' · ')}</span>}
              </div>
              <div className="flex gap-2">
                <a href={waLink(o.company.whatsapp, `Olá! Sobre o pedido ${o.code} da live ${o.live.name}.`)} target="_blank" rel="noreferrer" className="flex h-[42px] flex-grow items-center justify-center gap-2 rounded-full bg-accent text-[13px] font-medium text-ink no-underline">
                  <IconWhatsapp size={16} />
                  Chamar no WhatsApp
                </a>
                <a href={`mailto:${o.company.email}?subject=${encodeURIComponent(`Pedido ${o.code}`)}`} className="flex h-[42px] items-center rounded-full border border-solid border-dark-line px-4 text-[13px] text-white no-underline">E-mail</a>
              </div>
            </>
          )}
        </section>

        {error && (
          <p role="alert" className="m-0 rounded-2xl bg-danger-bg px-4 py-3 text-[13px] text-danger">
            {error}
          </p>
        )}

        {o && (
          <>
            <section className="box-border flex flex-col gap-3 rounded-card bg-surface p-5">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-medium">Status do pedido</span>
                <span className={`rounded-full px-[10px] py-1 text-[12px] font-medium ${STATUS_PILL[o.status]}`}>{ADMIN_STATUS_LABEL[o.status]}</span>
              </div>
              {canStatus && ended ? (
                confirmCancel ? (
                  <div role="alertdialog" aria-label="Confirmar cancelamento" className="flex flex-col gap-2 rounded-2xl bg-danger-bg p-3">
                    <span className="text-[13px] text-danger">Cancelar o pedido {o.code}? As unidades voltam para o estoque dos produtos.</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setConfirmCancel(false)} className="h-9 flex-grow rounded-full border-none bg-white text-[13px] text-ink">Manter pedido</button>
                      <button type="button" onClick={() => setStatus('canceled')} disabled={busy} className="h-9 flex-grow rounded-full border-none bg-live text-[13px] font-medium text-white">Cancelar pedido</button>
                    </div>
                  </div>
                ) : (
                  <div role="group" aria-label="Mudar status" className="grid grid-cols-2 gap-2">
                    {ORDER_STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={o.status === s}
                        disabled={busy || o.status === s}
                        onClick={() => (s === 'canceled' ? setConfirmCancel(true) : setStatus(s))}
                        className={`h-10 rounded-full text-[13px] font-medium disabled:cursor-default ${o.status === s ? 'border-none bg-ink text-white' : s === 'canceled' ? 'border border-solid border-line bg-white text-danger' : 'border border-solid border-line bg-white text-ink'}`}
                      >
                        {ADMIN_STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <p className="m-0 text-[13px] text-muted">{!ended ? 'A live ainda não terminou. O status muda depois de encerrar.' : 'Seu papel só consulta os pedidos.'}</p>
              )}
              <ol aria-label="Andamento" className="m-0 flex list-none flex-col gap-[6px] p-0">
                {steps.map(([label, at]) => (
                  <li key={label} className="flex items-center gap-[10px] text-[13px]">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${at ? (label === 'Cancelado' ? 'bg-live' : 'bg-ink') : 'bg-line'}`} />
                    <span className={`flex-grow ${at ? 'text-ink' : 'text-muted'}`}>{label}</span>
                    <span className="text-[12px] text-muted">{when(at) ?? 'aguardando'}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="box-border flex flex-col gap-3 rounded-card bg-surface p-5">
              <span className="text-[15px] font-medium">Fatura</span>
              {o.hasInvoice ? (
                <div className="flex gap-2">
                  <a href={`/api/admin/orders/${o.id}/invoice.pdf`} target="_blank" rel="noreferrer" className="flex h-10 flex-grow items-center justify-center rounded-full bg-ink text-[13px] font-medium text-white no-underline">Ver fatura (PDF)</a>
                  {canStatus && o.status !== 'canceled' && (
                    <button type="button" onClick={() => file.current?.click()} disabled={busy || !ended} className="h-10 rounded-full border border-solid border-line bg-white px-4 text-[13px] text-ink">Trocar PDF</button>
                  )}
                </div>
              ) : canStatus && o.status !== 'canceled' ? (
                <>
                  <button type="button" onClick={() => file.current?.click()} disabled={busy || !ended} className="flex h-11 items-center justify-center gap-2 rounded-full border-none bg-ink text-[13px] font-medium text-white disabled:opacity-50">
                    <IconPaperclip />
                    {busy ? 'Enviando…' : 'Anexar fatura (PDF)'}
                  </button>
                  <span className="text-[12px] text-muted">O comprador baixa a fatura em Minha conta. Pedido em rascunho passa para Faturado.</span>
                </>
              ) : (
                <span className="text-[13px] text-muted">Nenhuma fatura anexada.</span>
              )}
              <input ref={file} type="file" accept="application/pdf" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} aria-label="PDF da fatura" />
            </section>

            <section className="box-border flex flex-col rounded-card bg-surface p-5">
              <span className="pb-2 text-[15px] font-medium">Itens</span>
              {o.lines.length === 0 && <span className="text-[13px] text-muted">Sem itens ativos.</span>}
              {o.lines.map((l) => (
                <div key={l.id} className="flex items-center gap-3 border-t border-solid border-line-2 py-[10px] text-[13px]">
                  <span className="flex min-w-0 flex-grow flex-col gap-[2px]">
                    <span className="truncate font-medium">{l.product}</span>
                    <span className="text-[12px] text-muted">
                      {formatInt(l.qty)} un. × {formatBRL(l.unitPriceCents)} · min {offsetLabel(l.offsetS)}
                    </span>
                  </span>
                  <span className="font-medium">{formatBRL(l.subtotalCents)}</span>
                </div>
              ))}
              <div className="-mx-5 -mb-5 mt-2 flex items-center justify-between rounded-b-card bg-dark px-5 py-[14px] text-white">
                <span className="flex flex-col gap-[2px]">
                  <span className="text-[13px] text-dark-muted">Total · {formatInt(units)} un.</span>
                  <span className="text-[11px] text-[#7C8088]">Frete e impostos vêm na fatura</span>
                </span>
                <span className="text-[20px] font-medium tracking-[-0.03em] text-accent">{formatBRL(cents)}</span>
              </div>
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
