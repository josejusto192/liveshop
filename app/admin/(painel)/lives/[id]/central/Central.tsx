'use client';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HlsPlayer } from '@/components/HlsPlayer';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { useEventStream, useServerClock } from '@/components/useEventStream';
import { TransmitQrModal } from '@/components/admin/TransmitQr';
import { IconPhone, IconQr } from '@/components/admin/icons-extra';
import type { AdminItem, AdminItemState, AdminSnapshot, FeedEntry, Kpis, LiveInfo } from '@/lib/live-state';
import type { Signal } from '@/lib/signal';
import { formatInt } from '@/lib/money';

const pad = (n: number) => String(n).padStart(2, '0');
function mmss(ms: number) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600);
  return h ? `${h}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}` : `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}
function hhmmss(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
}
const offsetLabel = (s: number | null) => (s === null ? '--:--' : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`);

export function Central({ initial, hlsUrl, hlsFallback, addable: addableInit }: { initial: AdminSnapshot; hlsUrl: string; hlsFallback: string | null; addable: { id: string; name: string }[] }) {
  const router = useRouter();
  const { flash, toast } = useToast();
  const { now, sync } = useServerClock(250, initial.current.serverNow);
  const [live, setLive] = useState<LiveInfo>(initial.live);
  const [items, setItems] = useState<AdminItem[]>(initial.items);
  const [cur, setCur] = useState<AdminItemState>(initial.current);
  const [kpis, setKpis] = useState<Kpis>(initial.kpis);
  const [history, setHistory] = useState<Kpis[]>(initial.history);
  const [feed, setFeed] = useState<FeedEntry[]>(initial.feed);
  const [signal, setSignal] = useState<Signal>(initial.signal as Signal);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'start' | 'end'>(null);
  const [qr, setQr] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addable, setAddable] = useState(addableInit);
  const [swapKey, setSwapKey] = useState(0);
  const lastItem = useRef(initial.current.itemId);

  useEventStream(`/api/admin/lives/${live.id}/stream`, {
    snapshot: (s: AdminSnapshot) => {
      setLive(s.live);
      setItems(s.items);
      setCur(s.current);
      sync(s.current.serverNow);
      setKpis(s.kpis);
      setHistory(s.history);
      setFeed(s.feed);
      setSignal(s.signal as Signal);
    },
    item: (s: AdminItemState) => {
      sync(s.serverNow);
      if (s.itemId !== lastItem.current) {
        lastItem.current = s.itemId;
        setSwapKey((k) => k + 1);
      }
      setCur(s);
    },
    items: (d: { items: AdminItem[] }) => setItems(d.items),
    status: (d: { status: LiveInfo['status']; startedAt: number | null; endedAt: number | null }) => setLive((l) => ({ ...l, ...d })),
    kpis: (d: Kpis & { history: Kpis[] }) => {
      setKpis(d);
      setHistory(d.history);
    },
    viewers: (d: { count: number }) => setKpis((k) => ({ ...k, viewers: d.count })),
    stock: (d: { productId: string; available: number }) =>
      setItems((list) => list.map((i) => (i.productId === d.productId ? { ...i, available: d.available, reserved: i.stockTotal - d.available } : i))),
    order: (d: FeedEntry) => setFeed((f) => [d, ...f.filter((x) => x.id !== d.id)].slice(0, 30)),
    signal: (d: Signal) => setSignal(d),
  });

  const current = items.find((i) => i.id === cur.itemId) ?? null;
  const running = live.status === 'live';
  const auto = cur.mode === 'auto';
  const remaining = cur.paused || cur.endsAt === null ? (cur.remainingMs ?? 0) : Math.max(0, cur.endsAt - now);
  const progressDone = cur.totalMs ? Math.round((1 - remaining / cur.totalMs) * 60) : 0;
  const curIdx = current ? items.findIndex((i) => i.id === current.id) : -1;
  const vertical = live.format === 'vertical';

  async function act(action: string, body?: object) {
    setBusy(action);
    const res = await fetch(`/api/admin/lives/${live.id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      flash(data.error?.message ?? 'Não foi possível concluir.');
      return false;
    }
    return true;
  }

  async function addProduct(productId: string) {
    setAdding(false);
    const res = await fetch(`/api/admin/lives/${live.id}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return flash(data.error?.message ?? 'Não foi possível adicionar.');
    setAddable((a) => a.filter((x) => x.id !== productId));
    flash('Produto adicionado ao fim do roteiro');
  }

  const kpiCards = useMemo(() => {
    const series = (key: keyof Kpis) => {
      const vals = [...history.map((h) => h[key]), kpis[key]].slice(-8);
      const max = Math.max(1, ...vals);
      return vals.map((v) => Math.max(6, Math.round((v / max) * 44)));
    };
    return [
      { label: 'Assistindo', value: formatInt(kpis.viewers), spark: series('viewers'), last: 'bg-ink' },
      { label: 'Empresas que pediram', value: formatInt(kpis.buyingCompanies), spark: series('buyingCompanies'), last: 'bg-ink' },
      { label: 'Pedidos', value: formatInt(kpis.orders), spark: series('orders'), last: 'bg-ink' },
      { label: 'Unidades', value: formatInt(kpis.units), spark: series('units'), last: 'bg-accent' },
    ];
  }, [history, kpis]);

  const signalView =
    signal.state === 'receiving'
      ? { dot: 'bg-[#7CB518]', text: running ? 'Prévia ao vivo · sinal estável' : 'Sinal recebido' }
      : signal.state === 'unstable'
        ? { dot: 'bg-[#F5B97A]', text: 'Sinal instável' }
        : { dot: 'bg-[#6B6F76]', text: 'Sem sinal' };
  const tech = [signal.tracks.filter((t) => /264|VP9|AV1|265/i.test(t))[0], signal.kbps ? `${(signal.kbps / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} Mbps` : null, `atraso ${live.videoDelayS} s`]
    .filter(Boolean)
    .join(' · ');

  const statusPill = running ? (
    <span className="inline-flex items-center gap-[6px] rounded-full bg-live px-[9px] py-[3px] text-[11px] font-semibold tracking-[0.06em] text-white">
      <span className="h-[6px] w-[6px] animate-[lsPulse_1.6s_ease-in-out_infinite] rounded-full bg-white" />AO VIVO
    </span>
  ) : (
    <span className="rounded-full bg-line px-[9px] py-[3px] text-[11px] font-semibold tracking-[0.06em] text-ink-2">
      {live.status === 'ended' ? 'ENCERRADA' : live.status === 'draft' ? 'RASCUNHO' : 'AGENDADA'}
    </span>
  );

  const startsAt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(live.startsAt);

  return (
    <>
      <header className="flex shrink-0 flex-wrap items-center gap-[10px] lg:h-[60px] lg:flex-nowrap">
        <div className="flex min-w-0 flex-grow basis-full flex-col gap-1 sm:basis-auto">
          <span className="flex items-center gap-2 text-[13px] text-muted lg:text-[14px]">{statusPill}{live.brandName}</span>
          <h1 className="truncate text-[22px] font-medium tracking-[-0.03em] lg:text-[30px]">{live.name}</h1>
        </div>
        {running && live.startedAt ? (
          <span className="flex h-11 items-center gap-2 rounded-full bg-white px-[18px] font-mono text-[15px]" aria-label="Tempo de live">
            <span className="h-2 w-2 rounded-full bg-live" />
            {hhmmss(now - live.startedAt)}
          </span>
        ) : live.status !== 'ended' ? (
          <span className="flex h-11 items-center rounded-full bg-white px-[18px] text-[14px] text-ink-2">Início previsto {startsAt}</span>
        ) : null}
        <Link href={`/admin/lives/${live.id}/editar`} className="flex h-11 items-center rounded-full bg-white px-[18px] text-[14px] text-ink no-underline">
          Configurar
        </Link>
        {running && (
          <button type="button" onClick={() => setConfirm('end')} className="h-11 rounded-full border border-solid border-[#F0C4C5] bg-white px-[18px] text-[14px] font-medium text-danger">
            Encerrar live
          </button>
        )}
        {(live.status === 'scheduled' || live.status === 'draft') && (
          <button type="button" onClick={() => setConfirm('start')} disabled={!items.length} className="h-11 rounded-full border-none bg-ink px-5 text-[14px] font-medium text-white disabled:opacity-50">
            Iniciar live
          </button>
        )}
        {live.status === 'ended' && (
          <Link href={`/admin/pedidos?liveId=${live.id}`} className="flex h-11 items-center rounded-full bg-ink px-5 text-[14px] font-medium text-white no-underline">Ver pedidos</Link>
        )}
      </header>

      <div className="grid shrink-0 grid-cols-2 gap-3 lg:h-[104px] lg:grid-cols-4 lg:gap-4">
        {kpiCards.map((k) => (
          <div key={k.label} className="box-border flex items-center gap-[10px] rounded-card bg-surface px-4 py-[14px] lg:gap-[14px] lg:px-5 lg:py-[18px]">
            <div className="flex min-w-0 flex-grow flex-col gap-1">
              <span className="text-[13px] text-muted">{k.label}</span>
              <span className="text-[26px] font-medium leading-[1.05] tracking-[-0.04em] tabular lg:text-[32px]">{k.value}</span>
            </div>
            <div className="hidden h-11 items-end gap-[3px] sm:flex" aria-hidden>
              {k.spark.map((h, i) => (
                <span key={i} className={`w-[6px] rounded-[3px] ${i === k.spark.length - 1 ? k.last : 'bg-line'}`} style={{ height: h }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex min-h-0 flex-grow flex-col gap-4 lg:flex-row">
        <section className="flex w-full flex-col gap-4 max-lg:order-2 lg:w-[320px] lg:shrink-0">
          <div className="on-dark box-border flex min-h-0 flex-grow flex-col max-lg:h-[440px] items-center gap-[10px] rounded-card bg-dark p-3 text-white">
            <div
              aria-label={`Prévia da transmissão ${vertical ? 'vertical' : 'horizontal'}`}
              className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-dark-3"
              style={vertical ? { width: 228, height: 405 } : { width: 296, height: 166 }}
            >
              {signal.state !== 'none' && <HlsPlayer src={hlsUrl} fallbackSrc={hlsFallback} muted className="absolute inset-0 h-full w-full object-cover" label="Prévia do vídeo" />}
              {signal.state === 'none' && (
                <div className={`flex flex-col items-center gap-2 text-muted ${vertical ? '-mt-[70px]' : ''}`}>
                  <IconPhone />
                  <span className="text-[12px]">Sem sinal · {vertical ? '9:16' : '16:9'}</span>
                </div>
              )}
              {running && (
                <span className="absolute left-3 top-3 inline-flex items-center gap-[5px] rounded-full bg-live px-2 py-1 text-[10px] font-semibold tracking-[0.06em]">
                  <span className="h-[5px] w-[5px] rounded-full bg-white" />AO VIVO
                </span>
              )}
              <span className="absolute right-3 top-3 rounded-full bg-black/40 px-2 py-1 text-[10px]">{formatInt(kpis.viewers)} assistindo</span>
              {signal.state !== 'none' && tech && vertical && (
                <span className="absolute bottom-[76px] left-3 rounded-full bg-black/40 px-2 py-1 font-mono text-[10px]">{tech}</span>
              )}
              {current && running && (
                <div
                  key={swapKey}
                  className={`anim-swap absolute box-border flex items-center gap-2 bg-white text-ink transition-opacity duration-300 ${vertical ? 'bottom-[10px] left-[10px] right-[10px] rounded-[14px] p-2' : 'bottom-2 left-2 max-w-[70%] rounded-xl px-2 py-1'} ${cur.hidden ? 'opacity-0' : 'opacity-100'}`}
                >
                  {vertical &&
                    (current.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={current.imageUrl} alt="" className="h-[38px] w-[38px] shrink-0 rounded-[10px] object-cover" />
                    ) : (
                      <span className="h-[38px] w-[38px] shrink-0 rounded-[10px] bg-line-2" />
                    ))}
                  <span className="flex min-w-0 flex-col gap-[3px]">
                    {auto && live.showTimer && <span className="self-start rounded-full bg-accent px-[6px] py-px font-mono text-[9px] font-medium">{mmss(remaining)}</span>}
                    <span className="truncate text-[12px] font-medium">{current.name}</span>
                  </span>
                </div>
              )}
            </div>
            <span className="inline-flex items-center gap-[6px] text-[12px] text-dark-muted" aria-live="polite">
              <span className={`h-[7px] w-[7px] rounded-full ${signalView.dot}`} />
              {signalView.text}
            </span>
            {!vertical && signal.state !== 'none' && tech && <span className="font-mono text-[11px] text-dark-muted">{tech}</span>}
          </div>
          <div className="box-border flex shrink-0 flex-col gap-2 rounded-card bg-surface px-[14px] py-3">
            <span className="text-[13px] font-medium">Transmitir</span>
            <span className="text-[12px] leading-[1.4] text-muted">A câmera do celular ou do computador envia o vídeo. Não precisa de programa nem de chave.</span>
            <div className="flex gap-[6px]">
              <a href={`/admin/lives/${live.id}/transmitir`} target="_blank" rel="noreferrer" className="flex h-9 flex-grow items-center justify-center rounded-full bg-ink text-[13px] font-medium text-white no-underline">
                Transmitir
              </a>
              <button type="button" onClick={() => setQr(true)} disabled={live.status === 'ended'} className="flex h-9 items-center gap-[6px] rounded-full border border-solid border-line bg-white px-3 text-[13px] disabled:opacity-50">
                <IconQr />Celular
              </button>
            </div>
          </div>
        </section>

        <section className="flex min-w-0 flex-grow flex-col gap-4 max-lg:order-1">
          <div className="on-dark box-border flex flex-col gap-4 rounded-card bg-dark p-4 text-white sm:p-[22px]">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-dark-muted">
                {running && current ? `No ar agora · produto ${curIdx + 1} de ${items.length}` : live.status === 'ended' ? 'Live encerrada' : 'A live ainda não começou'}
              </span>
              <div role="group" aria-label="Modo de troca" className="flex rounded-full bg-dark-3 p-1">
                {(['auto', 'manual'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={cur.mode === m}
                    disabled={live.status === 'ended' || busy === 'mode'}
                    onClick={() => cur.mode !== m && act('mode', { mode: m })}
                    className={`h-[30px] rounded-full border-none px-[14px] text-[13px] font-medium ${cur.mode === m ? 'bg-white text-ink' : 'bg-transparent text-dark-muted'}`}
                  >
                    {m === 'auto' ? 'Automático' : 'Manual'}
                  </button>
                ))}
              </div>
            </div>
            {(() => {
              const shown = running ? current : live.status === 'ended' ? null : items[0] ?? null;
              if (!shown) return <p className="m-0 py-4 text-[15px] text-dark-muted">{live.status === 'ended' ? 'A transmissão terminou para todos os compradores.' : 'Adicione produtos ao roteiro para começar.'}</p>;
              const sold = shown.available <= 0;
              const info = running && cur.hidden ? 'Oculto para os compradores' : sold ? 'Esgotado' : `${formatInt(shown.reserved)} un. registradas · ${formatInt(shown.available)} disponíveis`;
              return (
                <div key={swapKey} className="anim-swap flex items-center gap-4">
                  {shown.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={shown.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover sm:h-[76px] sm:w-[76px]" />
                  ) : (
                    <span className="h-14 w-14 shrink-0 rounded-2xl bg-dark-3 sm:h-[76px] sm:w-[76px]" />
                  )}
                  <div className="flex min-w-0 flex-grow flex-col gap-1">
                    <span className="truncate text-[20px] font-medium tracking-[-0.03em] sm:text-[26px]">{shown.name}</span>
                    <span className="text-[13px] text-dark-muted">{running ? info : `Primeiro do roteiro · ${mmss(shown.durationS * 1000)}`}</span>
                  </div>
                  <div className="flex flex-col items-end gap-[2px]">
                    <span className={`whitespace-nowrap font-mono text-[28px] leading-none tracking-[-0.04em] sm:text-[40px] ${running && auto && !cur.paused ? (remaining <= 60_000 ? 'text-[#F5B97A]' : 'text-accent') : 'text-dark-muted'}`} aria-live="off">
                      {running && auto ? mmss(remaining) : '--:--'}
                    </span>
                    <span className="text-[12px] text-dark-muted">{!running ? 'aguardando início' : !auto ? 'troca manual' : cur.paused ? 'timer pausado' : remaining === 0 && curIdx === items.length - 1 ? 'último produto' : 'para trocar'}</span>
                  </div>
                </div>
              );
            })()}
            <div className="flex h-[10px] gap-[3px]" aria-hidden>
              {Array.from({ length: 60 }, (_, i) => (
                <span key={i} className={`flex-grow rounded-[2px] transition-colors duration-500 ${running && auto && i < progressDone ? 'bg-accent' : 'bg-[#34373D]'}`} />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-[6px] sm:flex">
              <button type="button" onClick={() => act('next')} disabled={!running || curIdx >= items.length - 1 || busy === 'next'} className="h-11 rounded-full border-none bg-accent px-4 max-sm:col-span-3 sm:flex-[1.6_1_0] text-[14px] font-medium text-ink disabled:opacity-40">
                Próximo agora
              </button>
              <button type="button" onClick={() => act('extend', { seconds: 300 })} disabled={!running || busy === 'extend'} className="h-11 sm:flex-[1_1_0] rounded-full border border-solid border-dark-line bg-transparent px-[14px] text-[14px] text-white disabled:opacity-40">
                +5 min
              </button>
              <button type="button" onClick={() => act(cur.paused ? 'resume' : 'pause')} disabled={!running || !!busy} className="h-11 sm:flex-[1_1_0] rounded-full border border-solid border-dark-line bg-transparent px-[14px] text-[14px] text-white disabled:opacity-40">
                {cur.paused ? 'Retomar' : 'Pausar'}
              </button>
              <button type="button" onClick={() => act(cur.hidden ? 'show' : 'hide')} disabled={!running || !!busy} className={`h-11 sm:flex-[1_1_0] rounded-full border border-solid border-dark-line px-[14px] text-[14px] text-white disabled:opacity-40 ${cur.hidden ? 'bg-dark-line' : 'bg-transparent'}`}>
                {cur.hidden ? 'Mostrar' : 'Ocultar'}
              </button>
            </div>
          </div>

          <div className="box-border flex min-h-0 flex-grow flex-col overflow-hidden rounded-card bg-surface px-4 pb-2 pt-[18px] max-lg:max-h-[520px] sm:px-[22px]">
            <div className="relative flex items-center justify-between pb-2">
              <span className="text-[15px] font-medium">Roteiro da live</span>
              {live.status !== 'ended' && (
                <button type="button" onClick={() => setAdding((v) => !v)} aria-expanded={adding} className="h-[34px] rounded-full border border-solid border-line bg-white px-[14px] text-[13px]">
                  + Adicionar produto
                </button>
              )}
              {adding && (
                <div className="anim-fade absolute right-0 top-10 z-10 flex max-h-[260px] w-[300px] flex-col overflow-y-auto rounded-2xl border border-solid border-line bg-white p-2 shadow-[0_12px_32px_rgba(17,18,20,0.12)]" role="menu">
                  {addable.length === 0 && <span className="px-3 py-2 text-[13px] text-muted">Todos os produtos da marca já estão no roteiro.</span>}
                  {addable.map((p) => (
                    <button key={p.id} type="button" role="menuitem" onClick={() => addProduct(p.id)} className="rounded-xl border-none bg-transparent px-3 py-2 text-left text-[14px] hover:bg-surface-2">
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <ol className="m-0 min-h-0 flex-grow list-none overflow-y-auto p-0">
              {items.map((q, i) => {
                const on = running && q.id === cur.itemId;
                const status = on ? 'No ar' : q.status === 'presented' ? 'Apresentado' : running && i === curIdx + 1 ? 'Próximo' : 'Na fila';
                return (
                  <li key={q.id} className={`flex flex-wrap items-center gap-x-[14px] gap-y-1 py-2 sm:h-[46px] sm:flex-nowrap sm:py-0 border-t border-solid border-line-2 ${q.status === 'presented' && !on ? 'opacity-50' : ''}`}>
                    <span className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[12px] font-medium ${on ? 'bg-accent' : 'bg-line-2'}`}>{i + 1}</span>
                    <span className="min-w-0 flex-grow truncate text-[14px] font-medium max-sm:basis-[calc(100%-40px)]">{q.name}</span>
                    <span className="whitespace-nowrap text-[12px] text-muted max-sm:ml-10">{status}</span>
                    <span className="w-14 text-right font-mono text-[13px] max-sm:mr-auto max-sm:text-left">{mmss(q.durationS * 1000)}</span>
                    {on ? (
                      <span className="flex h-[30px] items-center rounded-full bg-ink px-3 text-[12px] text-accent">No ar</span>
                    ) : (
                      <button type="button" onClick={() => act('goto', { itemId: q.id })} disabled={!running || !!busy} className="h-[30px] rounded-full border border-solid border-line bg-white px-3 text-[12px] disabled:opacity-40">
                        Colocar no ar
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <aside className="flex w-full flex-col overflow-hidden rounded-card bg-surface max-lg:order-3 max-lg:max-h-[460px] lg:w-[300px] lg:shrink-0">
          <div className="flex items-center justify-between px-5 pb-[10px] pt-[18px]">
            <span className="text-[15px] font-medium">Pedidos em tempo real</span>
            <span className={`h-2 w-2 rounded-full ${running ? 'bg-[#7CB518]' : 'bg-line'}`} aria-hidden />
          </div>
          <ul className="m-0 min-h-0 flex-grow list-none overflow-y-auto p-0" aria-live="polite" aria-label="Pedidos em tempo real">
            {feed.length === 0 && <li className="mx-3 border-t border-solid border-line-2 px-2 py-6 text-center text-[13px] text-muted">Os pedidos aparecem aqui assim que chegam.</li>}
            {feed.map((f) => (
              <li key={f.id} className="anim-fade mx-3 flex items-center gap-[10px] border-t border-solid border-line-2 px-2 py-[10px]">
                <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-line-2 text-[12px] font-semibold">{f.initials}</span>
                <div className="flex min-w-0 flex-grow flex-col gap-[2px]">
                  <span className="truncate text-[13px] font-medium">{f.company}</span>
                  <span className="truncate text-[12px] text-muted">{f.product}</span>
                </div>
                <div className="flex flex-col items-end gap-[2px]">
                  <span className="text-[13px] font-medium">{formatInt(f.qty)} un.</span>
                  <span className="font-mono text-[11px] text-muted">{offsetLabel(f.liveOffsetS)}</span>
                </div>
              </li>
            ))}
          </ul>
          <Link href={`/admin/pedidos?liveId=${live.id}`} className="m-3 flex h-[42px] items-center justify-center rounded-full bg-ink text-[13px] font-medium text-white no-underline">
            Ver todos os pedidos
          </Link>
        </aside>
      </div>

      {confirm === 'end' && (
        <Modal labelledBy="endt" onClose={() => setConfirm(null)} width={440}>
          <h2 id="endt" className="text-[22px] font-medium tracking-[-0.02em]">Encerrar a live?</h2>
          <p className="m-0 text-[14px] leading-[1.5] text-muted">
            A transmissão para para todos os compradores. {kpis.orders ? `Os ${formatInt(kpis.orders)} pedidos registrados ficam em Pedidos em rascunho, prontos para faturar.` : 'Os pedidos registrados ficam em Pedidos em rascunho, prontos para faturar.'}
          </p>
          <div className="flex justify-end gap-2 pt-[6px]">
            <button type="button" onClick={() => setConfirm(null)} className="h-11 rounded-full border border-solid border-line bg-white px-[18px] text-[14px]">Continuar ao vivo</button>
            <button
              type="button"
              disabled={busy === 'end'}
              onClick={async () => {
                if (await act('end')) {
                  setConfirm(null);
                  router.push(`/admin/pedidos?liveId=${live.id}`);
                }
              }}
              className="h-11 rounded-full border-none bg-live px-[18px] text-[14px] font-medium text-white disabled:opacity-70"
            >
              Encerrar e ver pedidos
            </button>
          </div>
        </Modal>
      )}
      {confirm === 'start' && (
        <Modal labelledBy="startt" onClose={() => setConfirm(null)} width={440}>
          <h2 id="startt" className="text-[22px] font-medium tracking-[-0.02em]">Iniciar a live?</h2>
          <p className="m-0 text-[14px] leading-[1.5] text-muted">
            {signal.state === 'none'
              ? 'Ainda não chegou sinal de vídeo. Os compradores entram na live e veem a tela escura até a transmissão começar.'
              : 'O sinal está chegando. Os compradores da sala de espera entram na live e o primeiro produto vai ao ar.'}
          </p>
          <div className="flex justify-end gap-2 pt-[6px]">
            <button type="button" onClick={() => setConfirm(null)} className="h-11 rounded-full border border-solid border-line bg-white px-[18px] text-[14px]">Agora não</button>
            <button
              type="button"
              disabled={busy === 'start'}
              onClick={async () => {
                if (await act('start')) setConfirm(null);
              }}
              className="h-11 rounded-full border-none bg-ink px-[18px] text-[14px] font-medium text-white disabled:opacity-70"
            >
              {signal.state === 'none' ? 'Iniciar mesmo assim' : 'Iniciar live'}
            </button>
          </div>
        </Modal>
      )}
      {qr && <TransmitQrModal liveId={live.id} liveName={live.name} onClose={() => setQr(false)} />}
      {toast}
    </>
  );
}
