'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { waLink } from '@/lib/phone';
import { IconBell } from './icons-extra';

type Ticket = { id: string; subject: string; message: string; createdAt: string; company: string; email: string; whatsapp: string; orderCode: string | null };

const ago = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(new Date(iso));
};

/** Sininho da Visão geral: chamados de suporte abertos. A agência responde por e-mail/WhatsApp e marca como respondido. */
export function NotificationsBell() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/support/tickets').catch(() => null);
    if (res?.ok) setTickets((await res.json()).tickets);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  async function answered(id: string) {
    setBusy(id);
    const res = await fetch(`/api/admin/support/tickets/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'answered' }) });
    setBusy(null);
    if (!res.ok) return setMsg('Não foi possível atualizar o chamado.');
    setTickets((t) => t.filter((x) => x.id !== id));
    setMsg('Chamado marcado como respondido');
  }

  const n = tickets.length;
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setMsg('');
          if (!open) load();
        }}
        aria-expanded={open}
        aria-label={n ? `Notificações: ${n} ${n === 1 ? 'chamado aberto' : 'chamados abertos'}` : 'Notificações'}
        className="relative flex h-11 w-11 items-center justify-center rounded-full border-none bg-white text-ink"
      >
        <IconBell />
        {n > 0 && <span className="absolute right-[9px] top-[9px] h-2 w-2 rounded-full bg-live ring-2 ring-white" aria-hidden />}
      </button>
      {open && (
        <div role="dialog" aria-label="Chamados de suporte" className="anim-fade absolute right-0 top-[52px] z-30 box-border flex max-h-[520px] w-[380px] flex-col gap-2 overflow-y-auto rounded-[22px] bg-white p-4 shadow-[0_16px_40px_rgba(17,18,20,0.18)]">
          <div className="flex items-center justify-between pb-1">
            <span className="text-[15px] font-medium">Chamados de suporte</span>
            <span className="text-[12px] text-muted">{n ? `${n} ${n === 1 ? 'aberto' : 'abertos'}` : 'nenhum aberto'}</span>
          </div>
          <p aria-live="polite" className="m-0 text-[12px] text-ok empty:hidden">{msg}</p>
          {n === 0 && <p className="m-0 rounded-2xl bg-surface-2 p-4 text-center text-[13px] text-muted">Tudo respondido por aqui.</p>}
          {tickets.map((t) => (
            <article key={t.id} className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 flex-col gap-[2px]">
                  <span className="truncate text-[13px] font-medium">{t.company}</span>
                  <span className="text-[12px] text-muted">
                    {t.subject}
                    {t.orderCode ? ` · pedido ${t.orderCode}` : ''} · {ago(t.createdAt)}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-warn-bg px-2 py-[2px] text-[11px] font-medium text-warn">Aberto</span>
              </div>
              <p className="m-0 whitespace-pre-line text-[13px] leading-[1.45] text-ink-2">{t.message}</p>
              <div className="flex flex-wrap gap-2">
                <a href={waLink(t.whatsapp, `Olá! Sobre o seu chamado "${t.subject}"${t.orderCode ? ` (pedido ${t.orderCode})` : ''}.`)} target="_blank" rel="noreferrer" className="flex h-8 items-center rounded-full bg-accent px-3 text-[12px] font-medium text-ink no-underline">WhatsApp</a>
                <a href={`mailto:${t.email}?subject=${encodeURIComponent(`Re: ${t.subject}${t.orderCode ? ` · ${t.orderCode}` : ''}`)}`} className="flex h-8 items-center rounded-full border border-solid border-line bg-white px-3 text-[12px] text-ink no-underline">E-mail</a>
                <div className="flex-grow" />
                <button type="button" onClick={() => answered(t.id)} disabled={busy === t.id} className="h-8 rounded-full border-none bg-ink px-3 text-[12px] font-medium text-white disabled:opacity-60">
                  {busy === t.id ? 'Salvando…' : 'Marcar como respondido'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
