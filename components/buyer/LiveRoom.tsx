'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HlsPlayer } from '@/components/HlsPlayer';
import { IconClose, IconPlay } from '@/components/icons';
import type { BuyerSnapshot, PublicItem } from '@/lib/live-state';
import type { MyOrder } from '@/lib/orders';
import { formatBRL, formatInt } from '@/lib/money';
import { OrdersList } from './OrdersList';
import { ProductCard } from './ProductCard';
import {
  BagIcon,
  CheckIcon,
  DesktopOrderToast,
  EyeIcon,
  hhmmss,
  initialsOf,
  MobileOrderToast,
  ProductImage,
  QtyMessage,
  SoundIcon,
  TimerChip,
  orderTotals,
  stockKindOf,
  useOrderToast,
  useQuantity,
} from './parts';
import { apiCall, useLiveRoom, type LiveRoomState } from './useLiveRoom';

type Props = {
  slug: string;
  snapshot: BuyerSnapshot;
  myOrder: MyOrder;
  alerts: string[];
  company: { name: string };
  hlsUrl: string;
  hlsFallback: string | null;
  isMobileUA: boolean;
};

function useMediaQuery(q: string, initial: boolean) {
  const [m, setM] = useState(initial);
  useEffect(() => {
    const mq = window.matchMedia(q);
    setM(mq.matches);
    const h = () => setM(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [q]);
  return m;
}

/** Live do comprador: escolhe o layout pelo formato da live e pela largura da tela (desktop a partir de 1024 px). */
export function LiveRoom(p: Props) {
  const room = useLiveRoom(p.slug, p.snapshot, p.myOrder);
  const desktop = useMediaQuery('(min-width: 1024px)', !p.isMobileUA);
  const q = useQuantity(room.item, room.item ? room.qtyInOrder(room.item.productId) : 0);
  const { toast, show, close } = useOrderToast();
  const [registering, setRegistering] = useState(false);
  const [alerts, setAlerts] = useState<Set<string>>(() => new Set(p.alerts));
  const [muted, setMuted] = useState(true);

  async function register(after?: () => void) {
    const item = room.item;
    if (!item) return;
    if (!q.canSubmit) {
      q.touch();
      if (!q.qty) q.setServerError('Escolha a quantidade.');
      return;
    }
    setRegistering(true);
    const r = await apiCall(`/api/lives/${p.slug}/orders`, 'POST', { liveItemId: item.id, qty: q.qty });
    setRegistering(false);
    if (!r.ok) {
      q.setServerError(r.data.error?.message ?? 'Não foi possível registrar. Tente de novo.');
      return;
    }
    room.setMyOrder(r.data.order);
    show(`${item.name}, ${formatInt(q.qty)} un.`);
    q.reset();
    after?.();
  }

  async function toggleAlert(productId: string) {
    const on = !alerts.has(productId);
    const r = await apiCall(`/api/lives/${p.slug}/stock-alert`, on ? 'POST' : 'DELETE', { productId });
    if (r.ok)
      setAlerts((s) => {
        const n = new Set(s);
        if (on) n.add(productId);
        else n.delete(productId);
        return n;
      });
  }

  const shared = { p, room, q, register, registering, alerts, toggleAlert, toast, show, close, muted, setMuted };
  const vertical = room.live.format === 'vertical';
  if (desktop) return vertical ? <VerticalDesktop {...shared} /> : <HorizontalDesktop {...shared} />;
  return vertical ? <VerticalMobile {...shared} /> : <HorizontalMobile {...shared} />;
}

type Shared = {
  p: Props;
  room: LiveRoomState;
  q: ReturnType<typeof useQuantity>;
  register: (after?: () => void) => Promise<void>;
  registering: boolean;
  alerts: Set<string>;
  toggleAlert: (productId: string) => void;
  toast: ReturnType<typeof useOrderToast>['toast'];
  show: (line: string) => void;
  close: () => void;
  muted: boolean;
  setMuted: (m: boolean) => void;
};

// ---------- Peças comuns ----------

function LiveBadge({ small = false }: { small?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-[6px] rounded-full bg-live font-semibold tracking-[0.06em] text-white ${small ? 'h-[26px] px-[9px] text-[10px]' : 'px-[10px] py-1 text-[11px]'}`}>
      <span className="h-[6px] w-[6px] animate-[lsPulse_1.6s_ease-in-out_infinite] rounded-full bg-white" />
      AO VIVO
    </span>
  );
}

function Video({ s, className = '', label }: { s: Shared; className?: string; label: string }) {
  return (
    <HlsPlayer
      src={s.p.hlsUrl}
      fallbackSrc={s.p.hlsFallback}
      muted={s.muted}
      className={`h-full w-full object-cover ${className}`}
      label={label}
    />
  );
}

function SoundButton({ s, className }: { s: Shared; className: string }) {
  return (
    <button type="button" onClick={() => s.setMuted(!s.muted)} aria-label={s.muted ? 'Ativar som' : 'Silenciar'} className={className}>
      <SoundIcon muted={s.muted} />
    </button>
  );
}

function LiveClock({ s, className }: { s: Shared; className: string }) {
  const started = s.room.live.startedAt;
  return <span className={className}>{started ? hhmmss(s.room.now - started) : '00:00:00'}</span>;
}

function swapKeyOf(room: LiveRoomState) {
  return room.current.itemId ?? 'none';
}

function lineupTags(room: LiveRoomState) {
  const pos = room.current.position ?? 0;
  let nextMarked = false;
  return room.items.map((it) => {
    const isCur = it.id === room.current.itemId;
    const past = !isCur && (it.position < pos || it.status === 'presented');
    let tag: 'No ar' | 'Apresentado' | 'A seguir' | 'Em breve' = 'Em breve';
    if (isCur) tag = 'No ar';
    else if (past) tag = 'Apresentado';
    else if (!nextMarked && it.position > pos) {
      tag = 'A seguir';
      nextMarked = true;
    }
    return { it, isCur, past, tag };
  });
}

function OrdersDrawer({ s, onClose }: { s: Shared; onClose: () => void }) {
  const t = orderTotals(s.room.myOrder);
  const [closing, setClosing] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const doClose = () => {
    setClosing(true);
    setTimeout(onClose, 240);
  };
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && doClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <button type="button" aria-label="Fechar meus pedidos" onClick={doClose} className={`fixed inset-0 z-40 cursor-default border-none bg-[rgba(17,18,20,0.5)] p-0 ${closing ? 'animate-[lsFade_.25s_ease_reverse_both]' : 'anim-fade'}`} />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mpt"
        className={`fixed bottom-4 right-4 top-4 z-50 box-border flex w-[460px] flex-col gap-[14px] rounded-panel bg-white p-6 shadow-[0_24px_60px_rgba(17,18,20,0.3)] ${closing ? 'anim-drawer-out' : 'anim-drawer'}`}
      >
        <div className="flex items-center gap-3">
          <div className="flex flex-grow flex-col gap-[2px]">
            <h2 id="mpt" className="text-[22px] font-medium tracking-[-0.02em]">Seus pedidos nesta live</h2>
            <span className="text-[13px] text-muted">{s.room.live.status === 'live' ? 'Clique num pedido para alterar ou excluir' : 'A live terminou: os pedidos não mudam mais'}</span>
          </div>
          <button type="button" onClick={doClose} aria-label="Fechar" className="flex h-10 w-10 items-center justify-center rounded-full border-none bg-surface-2 text-ink">
            <IconClose />
          </button>
        </div>
        <div className="flex items-center justify-between rounded-[20px] bg-dark px-5 py-[18px] text-white">
          <span className="flex flex-col gap-[2px]">
            <span className="text-[12px] text-dark-muted">Total registrado · {t.count}</span>
            <span className="text-[30px] font-medium tracking-[-0.04em] tabular">{t.money}</span>
          </span>
          <span className="rounded-full bg-dark-3 px-3 py-[6px] text-[13px] text-accent">{t.units} un.</span>
        </div>
        <div className="min-h-0 flex-grow overflow-auto">
          <OrdersList order={s.room.myOrder} onOrder={s.room.setMyOrder} editable={s.room.live.status === 'live'} variant="drawer" />
        </div>
        <span className="text-center text-[12px] leading-[1.5] text-muted">
          Preços de atacado por unidade. Frete e impostos vêm na fatura.
          <br />
          As alterações valem na hora, até a live terminar.
        </span>
      </div>
    </>
  );
}

function DesktopHeader({ s, onOpenOrders }: { s: Shared; onOpenOrders: () => void }) {
  const { room, p } = s;
  return (
    <header className="box-border flex h-16 shrink-0 items-center gap-4 rounded-card bg-white pl-5 pr-[10px]">
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-ink"><IconPlay /></span>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[15px] font-medium tracking-[-0.01em]">{room.live.name}</span>
        <span className="text-[12px] text-muted">{room.live.brandName}</span>
      </div>
      <LiveBadge />
      <div className="flex-grow" />
      <span className="flex h-11 items-center gap-2 rounded-full bg-surface-2 px-4 text-[13px] text-ink-2">
        <EyeIcon />
        {formatInt(room.viewers)} {room.viewers === 1 ? 'empresa assistindo' : 'empresas assistindo'}
      </span>
      <Link href="/conta" title="Minha conta" className="flex h-11 items-center gap-[10px] rounded-full bg-surface-2 pl-[6px] pr-4 text-ink no-underline">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">{initialsOf(p.company.name)}</span>
        <span className="max-w-[220px] truncate text-[13px] font-medium">{p.company.name}</span>
      </Link>
      <button type="button" onClick={onOpenOrders} className="flex h-11 items-center gap-2 rounded-full border-none bg-ink pl-[14px] pr-[6px] text-[13px] font-medium text-white">
        <BagIcon />
        Meus pedidos
        <span className="box-border flex h-8 min-w-8 items-center justify-center rounded-full bg-accent px-2 text-[12px] font-semibold text-ink">{room.myOrder.items.length}</span>
      </button>
    </header>
  );
}

function TotalCard({ s, onOpen }: { s: Shared; onOpen: () => void }) {
  const t = orderTotals(s.room.myOrder);
  return (
    <button type="button" onClick={onOpen} className="box-border flex h-[88px] shrink-0 items-center gap-3 rounded-card border-none bg-dark pl-[22px] pr-3 text-left text-white">
      <div className="flex min-w-0 flex-grow flex-col gap-[2px]">
        <span className="truncate text-[12px] text-dark-muted">Seus pedidos · {t.count} · {t.money}</span>
        <span className="text-[28px] font-medium tracking-[-0.04em] tabular">
          {t.units} <span className="text-[14px] tracking-normal text-dark-muted">un.</span>
        </span>
      </div>
      <span className="flex h-10 items-center gap-[6px] rounded-full bg-dark-3 px-[14px] text-[13px] text-accent">
        Ver e editar
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
      </span>
    </button>
  );
}

function ProductCardFor({ s, compact }: { s: Shared; compact?: boolean }) {
  const { room, q } = s;
  const item = room.item;
  return (
    <ProductCard
      item={item}
      position={room.current.position}
      total={room.items.length}
      hidden={room.current.hidden}
      showTimer={room.current.showTimer}
      remainingMs={room.remainingMs}
      q={q}
      registering={s.registering}
      onRegister={() => s.register()}
      alertOn={!!item && s.alerts.has(item.productId)}
      onToggleAlert={() => item && s.toggleAlert(item.productId)}
      compact={compact}
      swapKey={swapKeyOf(room)}
    />
  );
}

// ---------- 3. Live horizontal (desktop) · Main ----------

function HorizontalDesktop(s: Shared) {
  const { room } = s;
  const [drawer, setDrawer] = useState(false);
  const tags = lineupTags(room);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    strip.current?.querySelector('[data-current="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [room.current.itemId]);
  return (
    <div className="box-border flex h-screen min-h-[760px] flex-col gap-4 bg-bg p-4">
      <DesktopHeader s={s} onOpenOrders={() => setDrawer(true)} />
      <main className="anim-in flex min-h-0 flex-grow gap-4">
        <section className="flex min-w-0 flex-grow flex-col gap-4">
          <div className="relative flex min-h-0 flex-grow items-center justify-center overflow-hidden rounded-card-lg bg-dark">
            <Video s={s} label="Transmissão ao vivo" className="object-contain" />
            <LiveClock s={s} className="absolute bottom-[18px] left-[18px] rounded-full bg-white/[.12] px-3 py-[7px] font-mono text-[13px] text-white" />
            <SoundButton s={s} className="absolute bottom-[14px] right-4 flex h-11 w-11 items-center justify-center rounded-full border-none bg-white/[.12] text-white" />
          </div>
          <div className="box-border flex h-[88px] shrink-0 items-center gap-[10px] rounded-card bg-white px-5">
            <span className="mr-[6px] shrink-0 text-[13px] text-muted">Nesta live</span>
            <div ref={strip} className="flex min-w-0 items-center gap-[10px] overflow-x-auto [scrollbar-width:none]">
              {tags.map(({ it, isCur, past, tag }) => (
                <div key={it.id} data-current={isCur} className={`flex h-[52px] shrink-0 items-center gap-[10px] rounded-full pl-[6px] pr-4 ${isCur ? 'bg-ink text-white' : 'bg-surface-2 text-ink'} ${past ? 'opacity-55' : ''}`}>
                  {it.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.imageUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <span className={`h-10 w-10 rounded-full ${isCur ? 'bg-accent' : 'bg-line'}`} />
                  )}
                  <span className="flex flex-col">
                    <span className="whitespace-nowrap text-[13px] font-medium">{it.name}</span>
                    <span className="text-[11px] opacity-70">{tag === 'No ar' ? 'No ar agora' : tag}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
        <aside className="flex w-[420px] shrink-0 flex-col gap-4">
          <ProductCardFor s={s} />
          <TotalCard s={s} onOpen={() => setDrawer(true)} />
        </aside>
      </main>
      <DesktopOrderToast toast={s.toast} order={room.myOrder} onClose={s.close} />
      {drawer && <OrdersDrawer s={s} onClose={() => setDrawer(false)} />}
    </div>
  );
}

// ---------- 4. Live vertical (desktop) · LiveVerticalDesktop ----------

function VerticalDesktop(s: Shared) {
  const { room } = s;
  const [drawer, setDrawer] = useState(false);
  const tags = lineupTags(room);
  return (
    <div className="box-border flex h-screen min-h-[760px] flex-col gap-4 bg-bg p-4">
      <DesktopHeader s={s} onOpenOrders={() => setDrawer(true)} />
      <main className="anim-in flex min-h-0 flex-grow gap-4">
        <section className="flex min-w-0 flex-grow flex-col gap-4">
          <div className="box-border flex max-h-[55%] flex-col gap-1 overflow-y-auto rounded-card bg-white p-5">
            <span className="pb-2 text-[15px] font-medium">Nesta live</span>
            {tags.map(({ it, isCur, past, tag }) => (
              <div key={it.id} className={`flex h-[52px] shrink-0 items-center gap-3 border-t border-solid border-line-2 ${past ? 'opacity-50' : ''}`}>
                {it.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.imageUrl} alt="" className="h-9 w-9 rounded-[10px] object-cover" />
                ) : (
                  <span className={`h-9 w-9 rounded-[10px] ${isCur ? 'bg-accent' : 'bg-line-2'}`} />
                )}
                <span className="min-w-0 flex-grow truncate text-[14px] font-medium">{it.name}</span>
                <span className={`rounded-full px-[10px] py-1 text-[11px] font-medium ${isCur ? 'bg-ink text-accent' : 'bg-surface-2 text-ink-2'}`}>{tag === 'A seguir' ? 'Em breve' : tag}</span>
              </div>
            ))}
          </div>
          {room.live.showActivity && (
            <div className="on-dark box-border flex min-h-0 flex-grow flex-col gap-[10px] overflow-hidden rounded-card bg-dark p-5 text-white" aria-live="polite">
              <span className="flex items-center gap-2 text-[15px] font-medium"><span className="h-2 w-2 rounded-full bg-accent" />Acontecendo agora</span>
              {room.activity.length === 0 && <span className="text-[13px] text-dark-muted">Os pedidos das empresas aparecem aqui, sem nomes.</span>}
              {room.activity.slice(0, 5).map((a, i) => (
                <div key={a.id} className="anim-swap rounded-[14px] bg-dark-2 px-3 py-[10px] text-[13px] text-[#D5D8DE]" style={{ opacity: 1 - i * 0.15 }}>
                  {a.text}
                </div>
              ))}
            </div>
          )}
        </section>
        <div className="relative flex w-[444px] shrink-0 items-center justify-center overflow-hidden rounded-card-lg bg-[#202226]">
          <Video s={s} label="Vídeo vertical da live" />
          <LiveClock s={s} className="absolute left-4 top-4 rounded-full bg-white/[.12] px-[11px] py-[6px] font-mono text-[12px] text-white" />
          <SoundButton s={s} className="absolute bottom-[14px] right-[14px] flex h-11 w-11 items-center justify-center rounded-full border-none bg-white/[.12] text-white" />
        </div>
        <aside className="flex w-[420px] shrink-0 flex-col gap-4">
          <ProductCardFor s={s} compact />
          <TotalCard s={s} onOpen={() => setDrawer(true)} />
        </aside>
      </main>
      <DesktopOrderToast toast={s.toast} order={room.myOrder} onClose={s.close} />
      {drawer && <OrdersDrawer s={s} onClose={() => setDrawer(false)} />}
    </div>
  );
}

// ---------- Sheets do celular ----------

type SheetKind = 'buy' | 'orders' | 'lineup' | null;

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const [closing, setClosing] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const doClose = () => {
    setClosing(true);
    setTimeout(onClose, 240);
  };
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && doClose();
    document.addEventListener('keydown', onKey);
    box.current?.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <button type="button" aria-label="Fechar" onClick={doClose} className={`fixed inset-0 z-40 cursor-default border-none bg-black/45 p-0 ${closing ? 'animate-[lsFade_.25s_ease_reverse_both]' : 'anim-fade'}`} />
      <div ref={box} role="dialog" aria-modal="true" aria-label={title} className={`fixed inset-x-0 bottom-0 z-50 box-border flex max-h-[88dvh] flex-col gap-[14px] overflow-y-auto rounded-t-[28px] bg-white px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-[10px] text-ink ${closing ? 'anim-sheet-out' : 'anim-sheet'}`}>
        <span className="h-[5px] w-10 self-center rounded-full bg-line" aria-hidden />
        <div className="flex items-center">
          <h2 className="flex-grow text-[19px] font-medium tracking-[-0.02em]">{title}</h2>
          <button type="button" onClick={doClose} aria-label="Fechar" className="flex h-9 w-9 items-center justify-center rounded-full border-none bg-surface-2 text-ink">
            <IconClose size={12} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

function BuySheetBody({ s, onDone }: { s: Shared; onDone: () => void }) {
  const { room, q } = s;
  const item = room.item;
  if (!item || room.current.hidden) return <p className="m-0 py-6 text-center text-[14px] text-muted">Aguarde: o produto aparece em instantes.</p>;
  if (q.kind === 'out') return <SoldOutBody s={s} item={item} />;
  const low = q.kind === 'low';
  return (
    <>
      <div className="flex items-center gap-3">
        <ProductImage item={item} className="h-[52px] w-[52px] shrink-0" rounded="rounded-[14px]" label={false} />
        <span className="flex min-w-0 flex-col gap-[2px]">
          <span className="truncate text-[15px] font-medium">{item.name}</span>
          <span className="text-[12px] text-muted">
            Pedido mínimo {formatInt(item.minQty)} un.{item.stepQty > 1 ? ` · múltiplos de ${formatInt(item.stepQty)}` : ''}
            {low ? ` · últimas ${formatInt(item.available)} un.` : ''}
          </span>
        </span>
      </div>
      <label htmlFor="vq" className="-mb-2 text-[12px] text-muted">Quantidade</label>
      <div className={`box-border flex h-[66px] items-center gap-2 rounded-[18px] pl-5 pr-2 ${q.isError ? 'bg-danger-bg shadow-[inset_0_0_0_2px_var(--live)]' : 'bg-surface-2'}`}>
        <input
          id="vq"
          inputMode="numeric"
          autoComplete="off"
          value={q.text}
          onChange={(e) => q.onText(e.target.value)}
          onBlur={q.touch}
          aria-invalid={q.isError}
          aria-describedby="vq-msg"
          placeholder="0"
          className="min-w-0 flex-grow border-none bg-transparent text-[32px] font-medium tracking-[-0.03em] text-ink outline-none focus-visible:shadow-none"
        />
        <span className="text-[13px] text-muted">un.</span>
        <button type="button" onClick={q.clear} aria-label="Zerar quantidade" className="flex h-11 w-11 items-center justify-center rounded-full border-none bg-white text-ink"><IconClose size={12} /></button>
      </div>
      {low ? (
        <div className="grid grid-cols-3 gap-[6px]">
          {[50, 100].map((v) => (
            <button key={v} type="button" onClick={() => q.add(v)} className="h-[46px] rounded-full border border-solid border-line bg-white text-[14px] font-medium text-ink">+{formatInt(v)}</button>
          ))}
          <button type="button" onClick={q.useMax} disabled={q.maxOrder <= 0} className="h-[46px] rounded-full border-none bg-warn-bg text-[13px] font-medium text-warn disabled:opacity-50">Pedir o máximo</button>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-[6px]">
          {[10, 50, 100, 1000].map((v) => (
            <button key={v} type="button" onClick={() => q.add(v)} className="h-[46px] rounded-full border border-solid border-line bg-white text-[14px] font-medium text-ink">+{formatInt(v)}</button>
          ))}
        </div>
      )}
      {q.isError ? (
        <QtyMessage q={q} id="vq-msg" />
      ) : (
        <div id="vq-msg" className="flex items-baseline justify-between text-[13px] text-muted" aria-live="polite">
          <span>{formatBRL(item.priceCents)}/un.</span>
          <span>
            Subtotal <span className="text-[17px] font-semibold text-ink">{formatBRL(q.qty * item.priceCents)}</span>
          </span>
        </div>
      )}
      {q.over ? (
        <button type="button" disabled className="h-14 rounded-full border-none bg-bg text-[16px] font-medium text-[#8A8F99]">Quantidade acima do estoque</button>
      ) : (
        <button type="button" onClick={() => s.register(onDone)} disabled={s.registering} className="flex h-14 items-center justify-between rounded-full border-none bg-ink pl-[22px] pr-[7px] text-[16px] font-medium text-white disabled:opacity-80">
          {s.registering ? 'Registrando…' : 'Registrar pedido'}
          <span className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-accent"><CheckIcon size={16} width={2.4} /></span>
        </button>
      )}
      <span className="text-center text-[12px] text-muted">Sem pagamento agora. A fatura chega depois da live.</span>
    </>
  );
}

function SoldOutBody({ s, item }: { s: Shared; item: PublicItem }) {
  const on = s.alerts.has(item.productId);
  return (
    <>
      <div className="relative h-[120px]">
        <ProductImage item={item} className="h-full w-full opacity-50" />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white">Todo o estoque foi pedido</span>
      </div>
      <h3 className="text-[19px] font-medium text-muted">{item.name}</h3>
      <div className="flex flex-col gap-[6px] rounded-[18px] bg-surface-2 p-4">
        <span className="text-[14px] font-medium">Este produto esgotou durante a live</span>
        <span className="text-[13px] leading-[1.5] text-muted">Quem já registrou pedido está garantido. Fique na live: o próximo produto entra em instantes.</span>
      </div>
      <button type="button" onClick={() => s.toggleAlert(item.productId)} aria-pressed={on} className={`h-11 rounded-full border border-solid border-line text-[13px] font-medium ${on ? 'bg-ink text-accent' : 'bg-white text-ink'}`}>
        {on ? 'Vamos avisar se voltar ao estoque' : 'Avisar se voltar ao estoque'}
      </button>
      <button type="button" disabled className="h-14 rounded-full border-none bg-bg text-[15px] font-medium text-[#8A8F99]">Esgotado</button>
    </>
  );
}

function OrdersSheetBody({ s }: { s: Shared }) {
  const t = orderTotals(s.room.myOrder);
  return (
    <>
      <div className="flex items-center justify-between rounded-[18px] bg-dark p-4 text-white">
        <span className="flex flex-col gap-[2px]">
          <span className="text-[12px] text-dark-muted">Total registrado</span>
          <span className="text-[13px]">{t.units} un.</span>
        </span>
        <span className="text-[24px] font-medium tracking-[-0.03em] text-accent tabular">{t.money}</span>
      </div>
      <OrdersList order={s.room.myOrder} onOrder={s.room.setMyOrder} editable={s.room.live.status === 'live'} variant="sheet" />
      <span className="text-center text-[12px] text-muted">
        {s.room.live.status === 'live' ? 'Toque num pedido para alterar ou excluir. Vale até a live terminar.' : 'A live terminou: os pedidos não mudam mais.'} Frete e impostos vêm na fatura.
      </span>
    </>
  );
}

function LineupSheetBody({ s }: { s: Shared }) {
  return (
    <ul className="m-0 list-none p-0">
      {lineupTags(s.room).map(({ it, isCur, past, tag }) => (
        <li key={it.id} className={`flex items-center gap-3 border-t border-solid border-line-2 py-2 ${past ? 'opacity-50' : ''}`}>
          {it.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={it.imageUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
          ) : (
            <span className={`h-10 w-10 rounded-xl ${isCur ? 'bg-accent' : 'bg-line-2'}`} />
          )}
          <span className="flex min-w-0 flex-grow flex-col">
            <span className="truncate text-[14px] font-medium">{it.name}</span>
            <span className="text-[12px] text-muted">{formatBRL(it.priceCents)}/un. · estoque {formatInt(it.available)}</span>
          </span>
          <span className={`rounded-full px-[10px] py-1 text-[11px] font-medium ${isCur ? 'bg-ink text-accent' : 'bg-surface-2 text-ink-2'}`}>{tag === 'A seguir' ? 'Em breve' : tag}</span>
        </li>
      ))}
    </ul>
  );
}

function MobileSheets({ s, sheet, setSheet }: { s: Shared; sheet: SheetKind; setSheet: (k: SheetKind) => void }) {
  if (!sheet) return null;
  const close = () => setSheet(null);
  if (sheet === 'buy')
    return (
      <Sheet title="Fazer pedido" onClose={close}>
        <BuySheetBody s={s} onDone={close} />
      </Sheet>
    );
  if (sheet === 'orders')
    return (
      <Sheet title="Meus pedidos nesta live" onClose={close}>
        <OrdersSheetBody s={s} />
      </Sheet>
    );
  return (
    <Sheet title="Produtos da live" onClose={close}>
      <LineupSheetBody s={s} />
    </Sheet>
  );
}

// ---------- 5. Live vertical (celular) · LiveVertical ----------

function VerticalMobile(s: Shared) {
  const { room, p } = s;
  const [sheet, setSheet] = useState<SheetKind>(null);
  const item = room.item;
  const here = item ? room.qtyInOrder(item.productId) : 0;
  const kind = item ? stockKindOf(item) : 'in';
  const brandIni = useMemo(() => initialsOf(room.live.brandName), [room.live.brandName]);
  // Fecha a gaveta de pedir quando o produto troca (evita pedir o produto errado).
  const lastItem = useRef(room.current.itemId);
  useEffect(() => {
    if (lastItem.current !== room.current.itemId && sheet === 'buy') setSheet(null);
    lastItem.current = room.current.itemId;
  }, [room.current.itemId, sheet]);

  return (
    <div className="on-dark fixed inset-0 overflow-hidden bg-[#1A1C20] text-white">
      <div className="absolute inset-0 bg-[#202226]">
        <Video s={s} label="Vídeo vertical da live" />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/55 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[360px] bg-gradient-to-t from-black/70 to-transparent" />

      <header className="absolute left-3 right-3 top-[max(14px,env(safe-area-inset-top))] flex items-center gap-2">
        <div className="flex h-11 min-w-0 items-center gap-2 rounded-full bg-[rgba(20,21,24,0.55)] pl-[5px] pr-3 backdrop-blur-md">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-ink">{brandIni}</span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-medium">{room.live.brandName}</span>
            <span className="truncate text-[11px] text-[#C9CCD3]">{room.live.name}</span>
          </span>
        </div>
        <LiveBadge small />
        <div className="flex-grow" />
        <span className="flex h-8 items-center gap-[5px] rounded-full bg-[rgba(20,21,24,0.55)] px-[10px] text-[12px]" aria-label={`${room.viewers} empresas assistindo`}>
          <EyeIcon size={13} />
          {formatInt(room.viewers)}
        </span>
        <Link href="/conta" aria-label="Sair da live" className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(20,21,24,0.55)] text-white">
          <IconClose size={16} />
        </Link>
      </header>

      <div className="absolute right-3 top-[40%] flex flex-col items-center gap-[14px]">
        <button type="button" onClick={() => setSheet('orders')} aria-label="Meus pedidos" className="relative flex h-12 w-12 items-center justify-center rounded-full border-none bg-[rgba(20,21,24,0.55)] text-white">
          <BagIcon size={20} />
          <span className="absolute -right-[2px] -top-[2px] box-border flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-[5px] text-[11px] font-semibold text-ink">{room.myOrder.items.length}</span>
        </button>
        <button type="button" onClick={() => setSheet('lineup')} aria-label="Produtos da live" className="flex h-12 w-12 items-center justify-center rounded-full border-none bg-[rgba(20,21,24,0.55)] text-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></svg>
        </button>
        <SoundButton s={s} className="flex h-12 w-12 items-center justify-center rounded-full border-none bg-[rgba(20,21,24,0.55)] text-white" />
      </div>

      {room.live.showActivity && (
        <div aria-live="polite" className="absolute bottom-[214px] left-3 flex w-[260px] max-w-[70%] flex-col items-start gap-[6px]">
          {room.activity.slice(0, 3).reverse().map((a, idx, arr) => {
            const newest = idx === arr.length - 1;
            return (
              <div key={a.id} className={`flex max-w-[260px] items-center gap-2 rounded-full bg-[rgba(20,21,24,0.55)] py-[7px] pl-[7px] pr-3 backdrop-blur-md transition-opacity duration-300 ${newest ? 'anim-swap' : ''}`} style={{ opacity: newest ? 1 : idx === arr.length - 2 ? 0.8 : 0.55 }}>
                <span className={`h-[22px] w-[22px] shrink-0 rounded-full ${newest ? 'bg-accent' : 'bg-[#5E626A]'}`} />
                <span className="text-[12px] leading-[1.3]">{a.text}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="absolute bottom-[max(16px,env(safe-area-inset-bottom))] left-3 right-3 box-border flex flex-col gap-3 rounded-card-lg bg-white p-3 text-ink shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
        {item && !room.current.hidden ? (
          <div key={room.current.itemId ?? ''} className="anim-swap flex items-center gap-3">
            <span className="relative h-[72px] w-[72px] shrink-0">
              <ProductImage item={item} className={`h-full w-full ${kind === 'out' ? 'opacity-50' : ''}`} rounded="rounded-2xl" label={false} />
              <span className="absolute bottom-[5px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-[7px] py-[2px] text-[10px] text-white">
                {room.current.position} de {room.items.length}
              </span>
            </span>
            <div className="flex min-w-0 flex-grow flex-col gap-1">
              {kind === 'out' ? (
                <span className="self-start rounded-full bg-danger-bg px-[9px] py-[3px] text-[11px] font-medium text-danger">Esgotado</span>
              ) : kind === 'low' ? (
                <span className="self-start rounded-full bg-warn-bg px-[9px] py-[3px] text-[11px] font-medium text-warn">Últimas {formatInt(item.available)} un.</span>
              ) : room.current.showTimer && room.remainingMs > 0 ? (
                <span className="self-start"><TimerChip ms={room.remainingMs} small /></span>
              ) : null}
              <span className="truncate text-[17px] font-medium leading-[1.15] tracking-[-0.02em]">{item.name}</span>
              <span className="text-[12px] text-muted">
                <span className="font-semibold text-ink">{formatBRL(item.priceCents)}/un.</span> · Estoque {formatInt(item.available)}
              </span>
            </div>
          </div>
        ) : (
          <p className="m-0 py-3 text-center text-[14px] text-muted">Aguarde: o próximo produto aparece em instantes.</p>
        )}
        <div className="flex gap-2">
          {here > 0 && <span className="flex h-[50px] items-center whitespace-nowrap rounded-full bg-surface-2 px-[14px] text-[13px]">Você pediu {formatInt(here)} un.</span>}
          <button
            type="button"
            onClick={() => setSheet('buy')}
            disabled={!item || room.current.hidden}
            className="flex h-[50px] flex-grow items-center justify-between rounded-full border-none bg-ink pl-5 pr-[6px] text-[15px] font-medium text-white disabled:opacity-50"
          >
            <span>{kind === 'out' ? 'Produto esgotado' : 'Pedir este produto'}</span>
            <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-accent text-ink">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111214" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
            </span>
          </button>
        </div>
      </div>

      <MobileOrderToast toast={s.toast} order={room.myOrder} />
      <MobileSheets s={s} sheet={sheet} setSheet={setSheet} />
      <span className="sr-only">{p.company.name}</span>
    </div>
  );
}

// ---------- 6. Live horizontal (celular) · LiveMobile ----------

function HorizontalMobile(s: Shared) {
  const { room, q } = s;
  const [sheet, setSheet] = useState<SheetKind>(null);
  const item = room.item;
  const kind = item ? stockKindOf(item) : 'in';
  const t = orderTotals(room.myOrder);
  return (
    <div className="box-border flex min-h-[100dvh] flex-col gap-[10px] bg-bg p-3">
      <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-card bg-dark">
        <Video s={s} label="Transmissão ao vivo" className="object-contain" />
        <span className="absolute left-3 top-3"><LiveBadge small /></span>
        <span className="absolute right-3 top-3 rounded-full bg-white/[.12] px-[10px] py-1 text-[11px] text-white">{formatInt(room.viewers)} assistindo</span>
        <SoundButton s={s} className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full border-none bg-white/[.12] text-white" />
      </div>
      <div aria-live="polite">
        {s.toast && (
          <div key={s.toast.key} role="status" className="anim-in flex items-center gap-[10px] rounded-full bg-dark py-2 pl-2 pr-[14px] text-white">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent"><CheckIcon size={14} width={2.6} /></span>
            <span className="flex-grow text-[13px]">Pedido registrado</span>
            <span className="text-[13px] font-medium text-accent">Total {t.units} un.</span>
          </div>
        )}
      </div>
      <div className="anim-in box-border flex flex-grow flex-col gap-[14px] rounded-card bg-white p-4">
        {!item || room.current.hidden ? (
          <p className="m-auto text-center text-[14px] text-muted">Aguarde: o próximo produto aparece em instantes.</p>
        ) : kind === 'out' ? (
          <SoldOutBody s={s} item={item} />
        ) : (
          <>
            <div key={room.current.itemId ?? ''} className="anim-swap flex items-center gap-3">
              <ProductImage item={item} className="h-16 w-16 shrink-0" rounded="rounded-2xl" label={false} />
              <div className="flex min-w-0 flex-col gap-1">
                {kind === 'low' ? (
                  <span className="self-start rounded-full bg-warn-bg px-[9px] py-[3px] text-[11px] font-medium text-warn">Últimas {formatInt(item.available)} un.</span>
                ) : room.current.showTimer && room.remainingMs > 0 ? (
                  <span className="self-start"><TimerChip ms={room.remainingMs} small /></span>
                ) : null}
                <span className="text-[18px] font-medium leading-[1.15] tracking-[-0.02em]">{item.name}</span>
                <span className="text-[12px] text-muted">{formatBRL(item.priceCents)}/un. · Estoque {formatInt(item.available)}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="qtdm" className="text-[12px] text-muted">Quantidade</label>
              <div className={`box-border flex h-[58px] items-center gap-2 rounded-2xl px-[18px] ${q.isError ? 'bg-danger-bg shadow-[inset_0_0_0_2px_var(--live)]' : 'bg-surface-2'}`}>
                <input id="qtdm" inputMode="numeric" autoComplete="off" value={q.text} onChange={(e) => q.onText(e.target.value)} onBlur={q.touch} placeholder="0" aria-invalid={q.isError} aria-describedby="qtdm-msg" className="min-w-0 flex-grow border-none bg-transparent text-[26px] font-medium tracking-[-0.03em] text-ink outline-none focus-visible:shadow-none" />
                <span className="text-[13px] text-muted">un.</span>
              </div>
              {kind === 'low' ? (
                <div className="grid grid-cols-3 gap-[6px]">
                  {[50, 100].map((v) => (
                    <button key={v} type="button" onClick={() => q.add(v)} className="h-11 rounded-full border border-solid border-line bg-white text-[13px] font-medium text-ink">+{formatInt(v)}</button>
                  ))}
                  <button type="button" onClick={q.useMax} className="h-11 rounded-full border-none bg-warn-bg text-[13px] font-medium text-warn">Pedir o máximo</button>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-[6px]">
                  {[10, 50, 100, 1000].map((v) => (
                    <button key={v} type="button" onClick={() => q.add(v)} className="h-11 rounded-full border border-solid border-line bg-white text-[13px] font-medium text-ink">+{formatInt(v)}</button>
                  ))}
                </div>
              )}
              <QtyMessage q={q} id="qtdm-msg" />
            </div>
            <div className="flex-grow" />
            {q.over ? (
              <button type="button" disabled className="h-14 rounded-full border-none bg-bg text-[15px] font-medium text-[#8A8F99]">Quantidade acima do estoque</button>
            ) : (
              <button type="button" onClick={() => s.register()} disabled={s.registering} className="flex h-14 items-center justify-between rounded-full border-none bg-ink pl-[22px] pr-[7px] text-[15px] font-medium text-white disabled:opacity-80">
                {s.registering ? 'Registrando…' : 'Registrar pedido'}
                <span className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-accent"><CheckIcon size={16} /></span>
              </button>
            )}
          </>
        )}
      </div>
      <button type="button" onClick={() => setSheet('orders')} className="box-border flex h-16 shrink-0 items-center justify-between rounded-card border-none bg-white px-[18px] text-left text-ink">
        <span className="text-[12px] text-muted">Seus pedidos</span>
        <span className="text-[20px] font-medium tracking-[-0.03em] tabular">
          {t.units} un. <span className="text-[12px] tracking-normal text-muted">· {t.count}</span>
        </span>
      </button>
      <MobileSheets s={s} sheet={sheet} setSheet={setSheet} />
    </div>
  );
}
