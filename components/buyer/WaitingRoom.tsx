'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { useEventStream, useServerClock } from '@/components/useEventStream';
import { IconPlay } from '@/components/icons';
import type { BuyerSnapshot, LiveInfo, PublicItem } from '@/lib/live-state';
import { formatBRL, formatInt } from '@/lib/money';
import { apiCall } from './useLiveRoom';
import { initialsOf, pad2, ProductImage } from './parts';

function countdown(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(t / 86400);
  const h = Math.floor((t % 86400) / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return d > 0 ? `${d}d ${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

/** Sala de espera (SalaEspera / SalaEsperaMobile): contagem regressiva e aviso quando a live começa. */
export function WaitingRoom({ slug, snapshot, company, whenLabel, notifyWhatsapp }: { slug: string; snapshot: BuyerSnapshot; company: { name: string }; whenLabel: string; notifyWhatsapp: boolean }) {
  const router = useRouter();
  const { flash, toast } = useToast(2600);
  const { now, sync } = useServerClock(500, snapshot.current.serverNow);
  const [live, setLive] = useState<LiveInfo>(snapshot.live);
  const [items, setItems] = useState<PublicItem[]>(snapshot.items);
  const [started, setStarted] = useState(snapshot.live.status === 'live');
  const [reminded, setReminded] = useState(false);

  useEventStream(`/api/lives/${slug}/stream`, {
    snapshot: (s: BuyerSnapshot) => {
      sync(s.current.serverNow);
      setLive(s.live);
      setItems(s.items);
      if (s.live.status === 'live') setStarted(true);
      if (s.live.status === 'ended') router.refresh();
    },
    status: (d: { status: LiveInfo['status'] }) => {
      if (d.status === 'live') setStarted(true);
      if (d.status === 'ended') router.refresh();
    },
    items: (d: { items: PublicItem[] }) => setItems(d.items),
    stock: (d: { productId: string; available: number }) => setItems((list) => list.map((i) => (i.productId === d.productId ? { ...i, available: d.available } : i))),
  });

  const left = live.startsAt - now;
  async function remind() {
    const r = await apiCall('/api/me', 'PATCH', { notifyWhatsapp: true });
    if (!r.ok) return flash(r.data.error?.message ?? 'Não foi possível salvar.');
    setReminded(true);
    flash('Vamos avisar no WhatsApp quando a live começar');
  }
  const enter = () => router.refresh();
  const chip = started ? (
    <span className="rounded-full bg-live px-[10px] py-1 text-[11px] font-semibold tracking-[0.06em] text-white">AO VIVO</span>
  ) : (
    <span className="rounded-full bg-line-2 px-[10px] py-1 text-[11px] font-semibold tracking-[0.06em] text-ink">EM BREVE</span>
  );
  const whatsDone = reminded || notifyWhatsapp;

  const startedCard = (big: boolean) => (
    <>
      <span className={`anim-in inline-flex items-center gap-[6px] rounded-full bg-live font-semibold tracking-[0.06em] text-white ${big ? 'px-3 py-[5px] text-[12px]' : 'px-[10px] py-1 text-[11px]'}`}>
        <span className="h-[6px] w-[6px] rounded-full bg-white" />
        AO VIVO
      </span>
      <h1 className={`anim-in font-medium ${big ? 'text-[44px] tracking-[-0.04em]' : 'text-[28px] tracking-[-0.03em]'}`}>A live começou</h1>
      <button type="button" onClick={enter} className={`anim-in flex items-center rounded-full border-none bg-accent font-medium text-ink ${big ? 'h-[58px] gap-[14px] pl-[26px] pr-2 text-[16px]' : 'h-[54px] gap-3 pl-[22px] pr-[7px] text-[15px]'}`}>
        Entrar na live
        <span className={`flex items-center justify-center rounded-full bg-ink ${big ? 'h-11 w-11' : 'h-10 w-10'}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D6F35B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </span>
      </button>
    </>
  );

  return (
    <>
      {/* Desktop */}
      <div className="box-border hidden h-screen min-h-[720px] flex-col gap-4 bg-bg p-4 lg:flex">
        <header className="box-border flex h-16 shrink-0 items-center gap-4 rounded-card bg-white pl-5 pr-[10px]">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-ink"><IconPlay /></span>
          <div className="flex flex-col">
            <span className="text-[15px] font-medium tracking-[-0.01em]">{live.name}</span>
            <span className="text-[12px] text-muted">{live.brandName}</span>
          </div>
          {chip}
          <div className="flex-grow" />
          <a href="/conta" className="flex h-11 items-center gap-[10px] rounded-full bg-surface-2 pl-[6px] pr-4 text-ink no-underline" title="Minha conta">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">{initialsOf(company.name)}</span>
            <span className="text-[13px] font-medium">{company.name}</span>
          </a>
        </header>
        <main className="anim-in flex min-h-0 flex-grow gap-4">
          <section className="on-dark relative flex flex-grow flex-col items-center justify-center gap-[22px] rounded-card-lg bg-dark text-white" aria-live="polite">
            {started ? (
              startedCard(true)
            ) : (
              <>
                <span className="inline-flex items-center gap-2 text-[14px] text-dark-muted">
                  <span className="h-2 w-2 animate-[lsPulse_1.6s_ease-in-out_infinite] rounded-full bg-accent" />
                  Você está na sala de espera
                </span>
                <span className="text-[16px] text-[#D5D8DE]">{left > 0 ? 'A transmissão começa em' : 'A transmissão vai começar'}</span>
                <span className="font-mono text-[96px] leading-none tracking-[-0.05em] text-accent tabular" aria-label={`Faltam ${countdown(left)}`}>{countdown(left)}</span>
                <span className="text-[14px] text-dark-muted">{whenLabel} · Você entra automaticamente quando começar</span>
                <div className="flex gap-2 pt-2">
                  <a href={`/api/lives/${slug}/calendar.ics`} download onClick={() => flash('Evento baixado: abra o arquivo para salvar na agenda')} className="flex h-[46px] items-center gap-2 rounded-full border border-solid border-dark-line bg-transparent px-5 text-[14px] text-white no-underline">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 11h18" /></svg>
                    Adicionar à agenda
                  </a>
                  <button type="button" onClick={remind} disabled={whatsDone} className="h-[46px] rounded-full border border-solid border-dark-line bg-transparent px-5 text-[14px] text-white disabled:opacity-70">
                    {whatsDone ? 'Aviso no WhatsApp ativado' : 'Me avisar no WhatsApp'}
                  </button>
                </div>
              </>
            )}
          </section>
          <aside className="flex w-[420px] shrink-0 flex-col gap-4">
            <div className="box-border flex min-h-0 flex-grow flex-col gap-1 overflow-y-auto rounded-card-lg bg-white p-[22px]">
              <span className="pb-[10px] text-[15px] font-medium">O que vai ser apresentado</span>
              {items.map((p, i) => (
                <div key={p.id} className="flex h-14 shrink-0 items-center gap-3 border-t border-solid border-line-2">
                  <span className="w-[26px] font-mono text-[12px] text-muted">{pad2(i + 1)}</span>
                  <ProductImage item={p} className="h-10 w-10 shrink-0" rounded="rounded-xl" label={false} />
                  <span className="flex min-w-0 flex-grow flex-col">
                    <span className="truncate text-[14px] font-medium">{p.name}</span>
                    <span className="text-[12px] text-muted">{formatBRL(p.priceCents)}/un. · estoque {formatInt(p.available)}</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="box-border flex flex-col gap-[10px] rounded-card-lg bg-accent px-[22px] py-5">
              <span className="text-[15px] font-medium">Como funciona</span>
              <span className="text-[13px] leading-[1.5] text-[#2C3310]">Cada produto fica disponível por um tempo. Escolha a quantidade e clique em Registrar pedido. Não há pagamento na live: a fatura chega por e-mail depois.</span>
            </div>
          </aside>
        </main>
      </div>

      {/* Celular */}
      <div className="on-dark relative box-border flex min-h-[100dvh] flex-col gap-[14px] overflow-hidden bg-dark px-4 pb-4 pt-5 text-white lg:hidden">
        <div className="flex items-center gap-[10px]">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-ink">{initialsOf(live.brandName)}</span>
          <span className="flex min-w-0 flex-grow flex-col">
            <span className="truncate text-[14px] font-medium">{live.brandName}</span>
            <span className="truncate text-[12px] text-dark-muted">{live.name}</span>
          </span>
          {started ? (
            <span className="rounded-full bg-live px-[10px] py-1 text-[10px] font-semibold tracking-[0.06em] text-white">AO VIVO</span>
          ) : (
            <span className="rounded-full bg-line-2 px-[10px] py-1 text-[10px] font-semibold tracking-[0.06em] text-ink">EM BREVE</span>
          )}
        </div>
        <div className="anim-in flex h-[300px] shrink-0 flex-col items-center justify-center gap-[14px] rounded-card-lg bg-dark-2" aria-live="polite">
          {started ? (
            startedCard(false)
          ) : (
            <>
              <span className="inline-flex items-center gap-2 text-[13px] text-dark-muted">
                <span className="h-[7px] w-[7px] animate-[lsPulse_1.6s_ease-in-out_infinite] rounded-full bg-accent" />
                Sala de espera
              </span>
              <span className="text-[14px] text-[#D5D8DE]">{left > 0 ? 'Começa em' : 'Vai começar'}</span>
              <span className={`font-mono leading-none tracking-[-0.05em] text-accent tabular ${left > 86400_000 ? 'text-[40px]' : 'text-[52px]'}`}>{countdown(left)}</span>
              <span className="px-4 text-center text-[12px] text-dark-muted">{whenLabel} · entra sozinho quando começar</span>
            </>
          )}
        </div>
        {!started && (
          <div className="flex gap-2">
            <a href={`/api/lives/${slug}/calendar.ics`} download onClick={() => flash('Evento baixado: abra o arquivo para salvar na agenda')} className="flex h-[46px] flex-grow items-center justify-center rounded-full border border-solid border-dark-line text-[13px] text-white no-underline">
              Adicionar à agenda
            </a>
            <button type="button" onClick={remind} disabled={whatsDone} className="h-[46px] flex-grow rounded-full border border-solid border-dark-line bg-transparent text-[13px] text-white disabled:opacity-70">
              {whatsDone ? 'Aviso ativado' : 'Avisar no WhatsApp'}
            </button>
          </div>
        )}
        <div className="box-border flex min-h-0 flex-grow flex-col gap-[2px] overflow-y-auto rounded-[22px] bg-white p-4 text-ink">
          <span className="pb-2 text-[14px] font-medium">O que vai ser apresentado</span>
          {items.map((p) => (
            <div key={p.id} className="flex h-12 shrink-0 items-center gap-[10px] border-t border-solid border-line-2">
              <ProductImage item={p} className="h-[34px] w-[34px] shrink-0" rounded="rounded-[10px]" label={false} />
              <span className="min-w-0 flex-grow truncate text-[13px] font-medium">{p.name}</span>
              <span className="text-[11px] text-muted">{formatInt(p.available)} un.</span>
            </div>
          ))}
        </div>
      </div>
      {toast}
    </>
  );
}
