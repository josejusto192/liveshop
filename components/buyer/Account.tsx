'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { Switch } from '@/components/Switch';
import { useToast } from '@/components/Toast';
import { IconBack, IconMailBox, IconWhatsapp } from '@/components/admin/icons-extra';
import type { AccountOrder, TimelineStep } from '@/lib/buyer-orders';
import { formatBRL, formatInt } from '@/lib/money';
import { STATUS_PILL, type OrderStatus } from '@/lib/orders-shared';
import { initialsOf } from '@/lib/phone';
import type { CompanyTicket } from '@/lib/support';

export type AccountTab = 'pedidos' | 'perfil' | 'suporte';
export type AccountCompany = {
  name: string;
  email: string;
  cnpj: string | null;
  whatsapp: string;
  contactName: string | null;
  cep: string | null;
  address: string | null;
  city: string | null;
  notifyEmail: boolean;
  notifyWhatsapp: boolean;
  since: string;
};

type Props = {
  platformName: string;
  company: AccountCompany;
  orders: AccountOrder[];
  tickets: CompanyTicket[];
  support: { whatsapp: string | null; email: string | null };
  backLive: { slug: string; onAir: boolean } | null;
  initialTab: AccountTab;
  initialOrderId: string | null;
};

const SUBJECTS = ['Dúvida sobre pedido', 'Fatura e pagamento', 'Entrega', 'Acesso à live'];
const TICKET_LABEL: Record<string, string> = { open: 'Aberto', answered: 'Respondido', closed: 'Fechado' };
const TICKET_PILL: Record<string, string> = { open: 'bg-warn-bg', answered: 'bg-ok-bg', closed: 'bg-line-2' };

function ticketMeta(t: CompanyTicket) {
  const d = new Date(t.createdAt);
  const recent = Date.now() - d.getTime() < 60_000;
  const when = recent ? 'agora' : new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(d);
  return t.orderCode ? `Pedido ${t.orderCode} · ${when}` : when;
}

const stepBar = (s: TimelineStep) => (s.state === 'done' ? 'bg-ink' : s.state === 'current' ? 'bg-accent' : 'bg-bg');
const stepFg = (s: TimelineStep) => (s.state === 'todo' ? 'text-muted' : 'text-ink');

// Máscaras dos campos do perfil.
const maskCnpj = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 14);
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
};
const maskCep = (v: string) => v.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
const maskPhone = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export function Account(p: Props) {
  const router = useRouter();
  const { flash, toast } = useToast(2600);
  const [tab, setTabState] = useState<AccountTab>(p.initialTab);
  const [selId, setSelId] = useState<string | null>(p.initialOrderId ?? p.orders[0]?.id ?? null);
  const [sheet, setSheet] = useState<'open' | 'closing' | null>(p.initialOrderId && p.initialTab === 'pedidos' ? 'open' : null);
  const [tickets, setTickets] = useState(p.tickets);
  const [ticketOrder, setTicketOrder] = useState<string>(p.orders[0]?.id ?? '');
  const [company, setCompany] = useState(p.company);

  function setTab(t: AccountTab) {
    setTabState(t);
    try {
      window.history.replaceState(null, '', `/conta?aba=${t}`);
    } catch {}
  }
  function helpOrder(o: AccountOrder) {
    setTicketOrder(o.id);
    setSheet(null);
    setTab('suporte');
  }
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: 'company' }) });
    router.replace('/conta');
    router.refresh();
  }

  const sel = p.orders.find((o) => o.id === selId) ?? p.orders[0] ?? null;
  const openTickets = tickets.filter((t) => t.status === 'open').length;
  const shared = {
    ...p,
    company,
    tab,
    setTab,
    sel,
    select: (id: string) => setSelId(id),
    helpOrder,
    flash,
    tickets,
    onTicket: (t: CompanyTicket) => setTickets((x) => [t, ...x]),
    ticketOrder,
    setTicketOrder,
    onSaved: (c: AccountCompany) => setCompany(c),
    logout,
    openTickets,
  };

  return (
    <>
      <div className="hidden lg:flex">
        <Desktop {...shared} />
      </div>
      <div className="lg:hidden">
        <Mobile {...shared} sheet={sheet} openSheet={(id) => { setSelId(id); setSheet('open'); }} closeSheet={() => { setSheet('closing'); setTimeout(() => setSheet(null), 250); }} />
      </div>
      {toast}
    </>
  );
}

type Shared = Props & {
  tab: AccountTab;
  setTab: (t: AccountTab) => void;
  sel: AccountOrder | null;
  select: (id: string) => void;
  helpOrder: (o: AccountOrder) => void;
  flash: (m: string) => void;
  onTicket: (t: CompanyTicket) => void;
  ticketOrder: string;
  setTicketOrder: (id: string) => void;
  onSaved: (c: AccountCompany) => void;
  logout: () => void;
  openTickets: number;
};

// ---------------- Desktop (MinhaConta) ----------------

function Desktop(s: Shared) {
  const total = s.orders.reduce((a, o) => a + o.cents, 0);
  const tabs: [AccountTab, string, string, string][] = [
    ['pedidos', 'Meus pedidos', s.orders.length ? String(s.orders.length) : '', 'bg-accent'],
    ['perfil', 'Perfil da empresa', '', ''],
    ['suporte', 'Suporte', s.openTickets ? String(s.openTickets) : '', 'bg-[#F5B97A]'],
  ];
  return (
    <div className="box-border flex h-screen min-h-[760px] w-full flex-col gap-4 p-4">
      <header className="box-border flex h-16 shrink-0 items-center gap-[14px] rounded-card bg-surface pl-5 pr-[10px]">
        <Logo name={s.platformName} />
        <span className="h-6 w-px bg-line" />
        <span className="text-[15px] text-muted">Minha conta</span>
        <div className="flex-grow" />
        {s.backLive && (
          <Link href={`/l/${s.backLive.slug}`} className="flex h-11 items-center gap-2 rounded-full bg-surface-2 px-4 text-[13px] font-medium text-ink no-underline">
            {s.backLive.onAir && <span className="h-[7px] w-[7px] rounded-full bg-live" aria-hidden />}
            Voltar para a live
          </Link>
        )}
        <div className="flex h-11 items-center gap-[10px] rounded-full bg-ink pl-[6px] pr-4 text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-ink">{initialsOf(s.company.name)}</span>
          <span className="text-[13px] font-medium">{s.company.name}</span>
        </div>
      </header>

      <main className="anim-in flex min-h-0 flex-grow gap-4">
        <nav aria-label="Minha conta" className="box-border flex w-[240px] shrink-0 flex-col gap-1 rounded-panel bg-surface p-[14px]">
          {tabs.map(([t, label, badge, badgeBg]) => (
            <button key={t} type="button" onClick={() => s.setTab(t)} aria-current={s.tab === t ? 'page' : undefined} className={`flex h-[46px] items-center gap-[10px] rounded-[14px] border-none px-[14px] text-left text-[14px] font-medium ${s.tab === t ? 'bg-ink text-white' : 'bg-transparent text-ink-2'}`}>
              <span className="flex-grow">{label}</span>
              {badge && <span className={`box-border flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-[6px] text-[11px] font-semibold text-ink ${badgeBg}`}>{badge}</span>}
            </button>
          ))}
          <div className="flex-grow" />
          <div className="flex flex-col gap-1 rounded-2xl bg-surface-2 p-[14px]">
            <span className="text-[12px] text-muted">Cliente desde</span>
            <span className="text-[14px] font-medium">{s.company.since}</span>
          </div>
          <button type="button" onClick={s.logout} className="flex h-11 items-center rounded-[14px] border-none bg-transparent px-[14px] text-left text-[14px] text-danger">Sair da conta</button>
        </nav>

        {s.tab === 'pedidos' && (
          <>
            <section className="box-border flex min-h-0 w-[440px] shrink-0 flex-col gap-2 overflow-y-auto rounded-panel bg-surface p-5">
              <div className="flex items-baseline justify-between pb-[6px]">
                <h1 className="text-[22px] font-medium tracking-[-0.02em]">Meus pedidos</h1>
                {s.orders.length > 0 && (
                  <span className="text-[13px] text-muted">
                    {s.orders.length} {s.orders.length === 1 ? 'live' : 'lives'} · {formatBRL(total)}
                  </span>
                )}
              </div>
              {s.orders.length === 0 && <EmptyOrders />}
              {s.orders.map((o) => {
                const on = o.id === s.sel?.id;
                return (
                  <button key={o.id} type="button" onClick={() => s.select(o.id)} aria-pressed={on} className={`box-border flex w-full flex-col gap-[10px] rounded-[18px] border-2 border-solid p-[14px] text-left text-ink ${on ? 'border-ink bg-surface-2' : 'border-line-2 bg-white'}`}>
                    <span className="flex w-full items-center gap-[10px]">
                      <span className="flex-grow text-[15px] font-medium">{o.liveName}</span>
                      <StatusPill o={o} />
                    </span>
                    <span className="flex w-full justify-between text-[13px] text-muted">
                      <span>
                        {o.brandName} · {o.dateLabel} · {formatInt(o.units)} un.
                      </span>
                      <span className="font-medium text-ink">{formatBRL(o.cents)}</span>
                    </span>
                  </button>
                );
              })}
            </section>
            {s.sel ? <OrderDetailDesktop key={s.sel.id} o={s.sel} flash={s.flash} onHelp={() => s.helpOrder(s.sel!)} /> : <section className="flex-grow rounded-panel bg-surface" />}
          </>
        )}

        {s.tab === 'perfil' && (
          <section className="anim-in box-border flex min-w-0 flex-grow flex-col gap-[18px] overflow-y-auto rounded-panel bg-surface p-[26px]">
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-ink text-[20px] font-semibold text-accent">{initialsOf(s.company.name)}</span>
              <div className="flex flex-grow flex-col gap-[2px]">
                <h1 className="text-[22px] font-medium tracking-[-0.02em]">Perfil da empresa</h1>
                <span className="text-[13px] text-muted">Esses dados vão na fatura e no contato da entrega</span>
              </div>
            </div>
            <ProfileForm company={s.company} variant="desktop" flash={s.flash} onSaved={s.onSaved} logout={s.logout} />
          </section>
        )}

        {s.tab === 'suporte' && (
          <section className="anim-in box-border flex min-w-0 flex-grow flex-col gap-4 rounded-panel bg-surface p-[26px]">
            <div className="flex flex-col gap-[2px]">
              <h1 className="text-[22px] font-medium tracking-[-0.02em]">Falar com o suporte</h1>
              <span className="text-[13px] text-muted">Respondemos em horário comercial, normalmente no mesmo dia</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SupportWhats support={s.support} flash={s.flash} label="WhatsApp" />
              <a href={s.support.email ? `mailto:${s.support.email}` : undefined} onClick={() => s.support.email && s.flash(`Abrindo seu e-mail para ${s.support.email}`)} aria-disabled={!s.support.email} className="flex h-[72px] items-center gap-3 rounded-[18px] bg-surface-2 px-[18px] text-left text-ink no-underline">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink"><IconMailBox /></span>
                <span className="flex flex-col gap-[2px]">
                  <span className="text-[15px] font-medium">E-mail</span>
                  <span className="text-[12px] text-muted">{s.support.email ?? 'não configurado'}</span>
                </span>
              </a>
            </div>
            <div className="flex min-h-0 flex-grow gap-4">
              <TicketForm {...s} variant="desktop" />
              <div className="flex w-[300px] shrink-0 flex-col gap-2 overflow-y-auto">
                <span className="text-[15px] font-medium">Seus chamados</span>
                {s.tickets.length === 0 && <span className="rounded-2xl bg-surface-2 p-[14px] text-[13px] text-muted">Nenhum chamado ainda.</span>}
                {s.tickets.map((t) => (
                  <div key={t.id} className="anim-in flex flex-col gap-[6px] rounded-2xl bg-surface-2 p-[14px]">
                    <span className="flex justify-between gap-2">
                      <span className="text-[13px] font-medium">{t.subject}</span>
                      <span className={`self-start rounded-full px-2 py-[2px] text-[11px] font-medium ${TICKET_PILL[t.status]}`}>{TICKET_LABEL[t.status]}</span>
                    </span>
                    <span className="text-[12px] text-muted">{ticketMeta(t)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function StatusPill({ o, small = false }: { o: AccountOrder; small?: boolean }) {
  return <span className={`shrink-0 whitespace-nowrap rounded-full font-medium ${small ? 'px-[9px] py-[3px] text-[11px]' : 'px-[10px] py-1 text-[11px]'} ${STATUS_PILL[o.status as OrderStatus] ?? STATUS_PILL.draft}`}>{o.statusLabel}</span>;
}

function EmptyOrders() {
  return (
    <div className="flex flex-grow flex-col items-center justify-center gap-[6px] rounded-[18px] bg-surface-2 p-6 text-center">
      <span className="text-[15px] font-medium">Você ainda não tem pedidos</span>
      <span className="text-[13px] leading-[1.5] text-muted">Os pedidos que você registrar nas lives aparecem aqui, com o andamento até a entrega.</span>
    </div>
  );
}

function InvoiceButton({ o, flash, cls, short = false }: { o: AccountOrder; flash: (m: string) => void; cls: string; short?: boolean }) {
  if (o.invoice === 'ready') {
    return (
      <a href={`/api/me/orders/${o.id}/invoice.pdf`} download onClick={() => flash(`Fatura do pedido ${o.code} baixada`)} className={`${cls} flex items-center justify-center whitespace-nowrap bg-ink text-white no-underline`}>
        {short ? 'Baixar fatura' : 'Baixar fatura (PDF)'}
      </a>
    );
  }
  return (
    <button type="button" disabled className={`${cls} whitespace-nowrap border-none bg-bg text-[#8A8F99]`}>
      {o.invoice === 'by_email' ? (short ? 'Fatura por e-mail' : 'Fatura enviada por e-mail') : 'Fatura ainda não emitida'}
    </button>
  );
}

function OrderDetailDesktop({ o, flash, onHelp }: { o: AccountOrder; flash: (m: string) => void; onHelp: () => void }) {
  return (
    <section className="anim-swap box-border flex min-w-0 flex-grow flex-col gap-[18px] rounded-panel bg-surface p-6">
      <div className="flex items-start gap-3">
        <div className="flex flex-grow flex-col gap-1">
          <span className="text-[13px] text-muted">
            {o.brandName} · {o.dateLabel} · pedido {o.code}
          </span>
          <h2 className="text-[26px] font-medium tracking-[-0.03em]">{o.liveName}</h2>
        </div>
        <span className={`rounded-full px-3 py-[6px] text-[12px] font-medium ${STATUS_PILL[o.status as OrderStatus] ?? STATUS_PILL.draft}`}>{o.statusLabel}</span>
      </div>

      <ol aria-label="Andamento do pedido" className="m-0 grid list-none grid-cols-4 gap-2 p-0">
        {o.steps.map((st) => (
          <li key={st.label} className="flex flex-col gap-2">
            <span className={`h-[6px] rounded-full ${stepBar(st)}`} />
            <span className={`text-[13px] font-medium ${stepFg(st)}`}>{st.label}</span>
            <span className="text-[12px] text-muted">{st.when}</span>
          </li>
        ))}
      </ol>

      <div className="flex min-h-0 flex-grow flex-col overflow-hidden rounded-[18px] border border-solid border-bg">
        <div className="grid grid-cols-[2.2fr_1fr_1fr_1.1fr] gap-3 bg-[#F7F8F9] px-4 py-3 text-[12px] text-muted">
          <span>Produto</span>
          <span>Preço atacado</span>
          <span>Quantidade</span>
          <span className="text-right">Subtotal</span>
        </div>
        <div className="min-h-0 flex-grow overflow-y-auto">
          {o.items.map((i) => (
            <div key={i.id} className="grid h-14 grid-cols-[2.2fr_1fr_1fr_1.1fr] items-center gap-3 border-t border-solid border-line-2 px-4 text-[14px]">
              <span className="flex min-w-0 items-center gap-[10px]">
                {i.imageUrl ? <img src={i.imageUrl} alt="" className="h-[34px] w-[34px] shrink-0 rounded-[10px] object-cover" /> : <span className="h-[34px] w-[34px] shrink-0 rounded-[10px] bg-line-2" aria-hidden />}
                <span className="truncate font-medium">{i.name}</span>
              </span>
              <span className="text-ink-2">{formatBRL(i.unitPriceCents)}</span>
              <span className="text-ink-2">{formatInt(i.qty)} un.</span>
              <span className="text-right font-medium">{formatBRL(i.subtotalCents)}</span>
            </div>
          ))}
          {o.items.length === 0 && <p className="m-0 border-t border-solid border-line-2 p-4 text-[13px] text-muted">Sem itens ativos neste pedido.</p>}
        </div>
        <div className="on-dark flex items-center justify-between bg-dark px-4 py-[14px] text-white">
          <span className="flex flex-col gap-[2px]">
            <span className="text-[13px] text-dark-muted">Total do pedido · {formatInt(o.units)} un.</span>
            <span className="text-[11px] text-[#7C8088]">Frete e impostos vêm na fatura</span>
          </span>
          <span className="text-[22px] font-medium tracking-[-0.03em] text-accent">{formatBRL(o.cents)}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <InvoiceButton o={o} flash={flash} cls="h-12 rounded-full px-5 text-[14px] font-medium" />
        <a href={`/api/me/orders/${o.id}/summary.pdf`} download onClick={() => flash(`Resumo do pedido ${o.code} baixado`)} className="flex h-12 items-center rounded-full border border-solid border-line bg-white px-[18px] text-[14px] text-ink no-underline">
          Baixar resumo
        </a>
        <div className="flex-grow" />
        <button type="button" onClick={onHelp} className="h-12 rounded-full border-none bg-surface-2 px-[18px] text-[14px] font-medium text-ink">Falar com o suporte</button>
      </div>
    </section>
  );
}

// ---------------- Celular (ContaMobile) ----------------

function Mobile(s: Shared & { sheet: 'open' | 'closing' | null; openSheet: (id: string) => void; closeSheet: () => void }) {
  const tabs: [AccountTab, string][] = [['pedidos', 'Pedidos'], ['perfil', 'Perfil'], ['suporte', 'Suporte']];
  const o = s.sel;
  useEffect(() => {
    if (!s.sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && s.closeSheet();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [s]);
  return (
    <main className="relative box-border flex min-h-[100dvh] flex-col gap-3 px-3 pb-3 pt-4">
      <div className="flex items-center gap-[10px] px-1">
        <Link href={s.backLive ? `/l/${s.backLive.slug}` : '/conta'} aria-label="Voltar para a live" className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink">
          <IconBack />
        </Link>
        <span className="flex min-w-0 flex-grow flex-col">
          <h1 className="text-[17px] font-medium tracking-[-0.02em]">Minha conta</h1>
          <span className="truncate text-[12px] text-ink-2">{s.company.name}</span>
        </span>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-accent">{initialsOf(s.company.name)}</span>
      </div>

      <div role="tablist" aria-label="Seções" className="grid grid-cols-3 rounded-full bg-white p-1">
        {tabs.map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={s.tab === t} onClick={() => s.setTab(t)} className={`h-[38px] rounded-full border-none text-[13px] font-medium ${s.tab === t ? 'bg-ink text-white' : 'bg-transparent text-ink-2'}`}>
            {label}
          </button>
        ))}
      </div>

      {s.tab === 'pedidos' && (
        <div className="anim-in flex flex-grow flex-col gap-[10px]">
          {s.orders.length === 0 && <EmptyOrders />}
          {s.orders.map((x) => (
            <button key={x.id} type="button" onClick={() => s.openSheet(x.id)} className="box-border flex flex-col gap-[10px] rounded-[22px] border-none bg-white p-4 text-left text-ink">
              <span className="flex w-full items-center gap-2">
                <span className="flex-grow text-[15px] font-medium">{x.liveName}</span>
                <StatusPill o={x} small />
              </span>
              <span className="flex w-full gap-1" aria-hidden>
                {x.steps.map((st) => (
                  <span key={st.label} className={`h-[5px] flex-grow rounded-full ${stepBar(st)}`} />
                ))}
              </span>
              <span className="flex w-full justify-between text-[12px] text-muted">
                <span>
                  {x.brandName} · {x.dateLabel} · {formatInt(x.units)} un.
                </span>
                <span className="font-medium text-ink">{formatBRL(x.cents)}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {s.tab === 'perfil' && (
        <div className="anim-in box-border flex flex-grow flex-col gap-3 rounded-[22px] bg-white p-[18px]">
          <ProfileForm company={s.company} variant="mobile" flash={s.flash} onSaved={s.onSaved} logout={s.logout} />
        </div>
      )}

      {s.tab === 'suporte' && (
        <div className="anim-in flex flex-grow flex-col gap-[10px]">
          <SupportWhats support={s.support} flash={s.flash} label="Chamar no WhatsApp" mobile />
          {s.support.email && (
            <a href={`mailto:${s.support.email}`} className="flex h-14 items-center gap-3 rounded-[22px] bg-white px-4 text-ink no-underline">
              <IconMailBox />
              <span className="flex flex-col">
                <span className="text-[14px] font-medium">E-mail</span>
                <span className="text-[12px] text-muted">{s.support.email}</span>
              </span>
            </a>
          )}
          <div className="box-border flex flex-grow flex-col gap-[10px] rounded-[22px] bg-white p-4">
            <TicketForm {...s} variant="mobile" />
            {s.tickets.map((t) => (
              <div key={t.id} className="anim-in flex justify-between gap-2 rounded-[14px] bg-surface-2 p-3 text-[12px]">
                <span className="flex flex-col gap-[2px]">
                  <span className="font-medium">{t.subject}</span>
                  <span className="text-muted">{ticketMeta(t)}</span>
                </span>
                <span className={`self-start rounded-full px-2 py-[2px] font-medium ${TICKET_PILL[t.status]}`}>{TICKET_LABEL[t.status]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {s.sheet && o && (
        <>
          <button type="button" aria-label="Fechar" onClick={s.closeSheet} className={`fixed inset-0 z-40 cursor-default border-none bg-[rgba(17,18,20,0.45)] p-0 ${s.sheet === 'closing' ? 'opacity-0' : 'anim-overlay'}`} />
          <div role="dialog" aria-modal="true" aria-labelledby="pdt" className={`fixed inset-x-0 bottom-0 z-50 box-border flex max-h-[88dvh] flex-col gap-[14px] overflow-y-auto rounded-t-[28px] bg-white px-4 pb-[18px] pt-[10px] ${s.sheet === 'closing' ? 'anim-sheet-out' : 'anim-sheet'}`}>
            <span className="h-[5px] w-10 self-center rounded-full bg-line" aria-hidden />
            <div className="flex items-start gap-[10px]">
              <div className="flex flex-grow flex-col gap-[2px]">
                <span className="text-[12px] text-muted">
                  {o.brandName} · {o.code}
                </span>
                <h2 id="pdt" className="text-[19px] font-medium tracking-[-0.02em]">{o.liveName}</h2>
              </div>
              <StatusPill o={o} />
            </div>
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {o.steps.map((st) => (
                <li key={st.label} className="flex items-center gap-[10px] text-[13px]">
                  <span className={`h-[18px] w-[18px] shrink-0 rounded-full ${stepBar(st)}`} />
                  <span className={`flex-grow ${stepFg(st)}`}>{st.label}</span>
                  <span className="text-[12px] text-muted">{st.when}</span>
                </li>
              ))}
            </ol>
            <div className="rounded-2xl bg-surface-2 px-[14px] py-1">
              {o.items.map((i) => (
                <div key={i.id} className="flex justify-between gap-2 border-b border-solid border-[#E9EAEC] py-[10px] text-[13px]">
                  <span className="flex flex-col gap-[1px]">
                    <span>{i.name}</span>
                    <span className="text-[11px] text-muted">
                      {formatInt(i.qty)} un. × {formatBRL(i.unitPriceCents)}
                    </span>
                  </span>
                  <span className="font-medium">{formatBRL(i.subtotalCents)}</span>
                </div>
              ))}
              <div className="flex justify-between py-3 text-[14px] font-medium">
                <span>Total · {formatInt(o.units)} un.</span>
                <span>{formatBRL(o.cents)}</span>
              </div>
            </div>
            <p className="m-0 -mt-1 text-[12px] text-muted">Frete e impostos vêm na fatura.</p>
            <div className="flex gap-2">
              <InvoiceButton o={o} flash={s.flash} short cls="h-[50px] min-w-0 flex-grow rounded-full px-3 text-[14px] font-medium" />
              <button type="button" onClick={() => s.helpOrder(o)} className="h-[50px] shrink-0 rounded-full border-none bg-surface-2 px-4 text-[14px] font-medium text-ink">Suporte</button>
            </div>
            <a href={`/api/me/orders/${o.id}/summary.pdf`} download onClick={() => s.flash(`Resumo do pedido ${o.code} baixado`)} className="-mt-1 self-center py-1 text-[13px] text-ink underline">
              Baixar resumo do pedido (PDF)
            </a>
          </div>
        </>
      )}
    </main>
  );
}

// ---------------- Partes comuns ----------------

function SupportWhats({ support, flash, label, mobile = false }: { support: Props['support']; flash: (m: string) => void; label: string; mobile?: boolean }) {
  const href = support.whatsapp ? `https://wa.me/${support.whatsapp.replace(/\D/g, '')}` : undefined;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={() => href && flash('Abrindo o WhatsApp do suporte')}
      aria-disabled={!href}
      className={`flex items-center gap-3 bg-accent px-4 text-left text-ink no-underline ${mobile ? 'h-16 rounded-[22px]' : 'h-[72px] rounded-[18px] px-[18px]'}`}
    >
      <span className={`flex items-center justify-center rounded-full bg-ink text-accent ${mobile ? 'h-[38px] w-[38px]' : 'h-10 w-10'}`}>
        <IconWhatsapp size={17} />
      </span>
      <span className="flex flex-col gap-[2px]">
        <span className="text-[15px] font-medium">{label}</span>
        <span className="text-[12px] text-accent-ink">Resposta mais rápida</span>
      </span>
    </a>
  );
}

function TicketForm(s: Shared & { variant: 'desktop' | 'mobile' }) {
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const mobile = s.variant === 'mobile';
  const order = s.orders.find((o) => o.id === s.ticketOrder);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (msg.trim().length < 5) return setError('Conte o que aconteceu.');
    setSending(true);
    setError('');
    const res = await fetch('/api/support/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject, orderId: s.ticketOrder || null, message: msg }) });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) return setError(data.error?.message ?? 'Não foi possível enviar. Tente de novo.');
    setMsg('');
    s.onTicket(data.ticket);
    s.flash(mobile ? 'Chamado enviado' : 'Chamado enviado. Você recebe a resposta por e-mail e WhatsApp.');
  }

  const field = `rounded-xl border-none bg-surface-2 text-ink ${mobile ? 'h-11 px-3 text-[16px]' : 'h-11 px-3 text-[14px]'}`;
  const id = (k: string) => `${s.variant}-${k}`;
  return (
    <form onSubmit={send} noValidate className={mobile ? 'flex flex-col gap-[10px]' : 'box-border flex flex-grow flex-col gap-3 rounded-[18px] border border-solid border-bg p-[18px]'}>
      <span className="text-[15px] font-medium">Abrir um chamado</span>
      {mobile && order && <span className="-mt-1 text-[12px] text-muted">Sobre o pedido {order.code}</span>}
      <div className={`grid gap-[10px] ${mobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <div className="flex flex-col gap-[6px]">
          <label htmlFor={id('s1')} className="text-[12px] text-muted">Assunto</label>
          <select id={id('s1')} value={subject} onChange={(e) => setSubject(e.target.value)} className={field}>
            {SUBJECTS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-[6px]">
          <label htmlFor={id('s2')} className="text-[12px] text-muted">Pedido relacionado</label>
          <select id={id('s2')} value={s.ticketOrder} onChange={(e) => s.setTicketOrder(e.target.value)} className={field}>
            {s.orders.map((o) => (
              <option key={o.id} value={o.id}>
                Pedido {o.code}
              </option>
            ))}
            <option value="">Nenhum</option>
          </select>
        </div>
      </div>
      <div className="flex flex-grow flex-col gap-[6px]">
        <label htmlFor={id('s3')} className={mobile ? 'sr-only' : 'text-[12px] text-muted'}>Mensagem</label>
        <textarea
          id={id('s3')}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Conte o que aconteceu"
          aria-invalid={!!error}
          aria-describedby={id('err')}
          className={`resize-none rounded-[14px] border-none bg-surface-2 px-[14px] py-3 text-ink ${mobile ? 'min-h-[110px] text-[16px]' : 'min-h-[90px] flex-grow text-[14px]'}`}
        />
        <span id={id('err')} role="status" aria-live="polite" className="text-[12px] text-danger empty:hidden">{error}</span>
      </div>
      <button type="submit" disabled={sending} className={`rounded-full border-none bg-ink text-[14px] font-medium text-white disabled:opacity-70 ${mobile ? 'h-[50px]' : 'h-[46px] self-start px-[22px]'}`}>
        {sending ? 'Enviando…' : 'Enviar chamado'}
      </button>
    </form>
  );
}

function ProfileForm({ company, variant, flash, onSaved, logout }: { company: AccountCompany; variant: 'desktop' | 'mobile'; flash: (m: string) => void; onSaved: (c: AccountCompany) => void; logout: () => void }) {
  const [f, setF] = useState({
    name: company.name,
    cnpj: company.cnpj ?? '',
    whatsapp: company.whatsapp,
    contactName: company.contactName ?? '',
    cep: company.cep ?? '',
    address: company.address ?? '',
    city: company.city ?? '',
    notifyEmail: company.notifyEmail,
    notifyWhatsapp: company.notifyWhatsapp,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const mobile = variant === 'mobile';
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch('/api/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setErrors(data.error?.fields ?? { form: data.error?.message ?? 'Não foi possível salvar.' });
      return;
    }
    setErrors({});
    const c = data.company;
    onSaved({ ...company, name: c.name, cnpj: c.cnpj, whatsapp: c.whatsapp, contactName: c.contactName, cep: c.cep, address: c.address, city: c.city, notifyEmail: c.notifyEmail, notifyWhatsapp: c.notifyWhatsapp });
    flash('Dados da empresa salvos');
  }

  const p = mobile ? 'm' : 'd';
  const input = (err?: string) => `box-border h-12 w-full rounded-xl border-none px-[14px] text-ink ${mobile ? 'text-[16px]' : 'text-[14px]'} ${err ? 'bg-danger-bg shadow-[inset_0_0_0_2px_var(--live)]' : 'bg-surface-2'}`;
  const fieldBox = (k: string, label: string, el: React.ReactNode, span = false) => (
    <div className={`flex flex-col gap-[6px] ${span ? 'col-span-2' : ''}`}>
      <label htmlFor={`${p}-${k}`} className="text-[12px] text-muted">{label}</label>
      {el}
      {errors[k] && (
        <span id={`${p}-${k}-err`} className="text-[12px] text-danger">
          {errors[k]}
        </span>
      )}
    </div>
  );
  const aria = (k: string) => ({ 'aria-invalid': !!errors[k], 'aria-describedby': errors[k] ? `${p}-${k}-err` : undefined });

  return (
    <form onSubmit={save} noValidate className={`flex flex-grow flex-col ${mobile ? 'gap-3' : 'gap-[18px]'}`}>
      <div className={mobile ? 'flex flex-col gap-3' : 'grid grid-cols-2 gap-[14px]'}>
        {fieldBox('name', 'Nome da empresa', <input id={`${p}-name`} value={f.name} onChange={set('name')} autoComplete="organization" className={input(errors.name)} {...aria('name')} />)}
        {fieldBox('cnpj', 'CNPJ', <input id={`${p}-cnpj`} inputMode="numeric" placeholder="00.000.000/0000-00" value={f.cnpj} onChange={(e) => setF((x) => ({ ...x, cnpj: maskCnpj(e.target.value) }))} className={input(errors.cnpj)} {...aria('cnpj')} />)}
        {fieldBox(
          'email',
          'E-mail de compras',
          <>
            <input id={`${p}-email`} type="email" value={company.email} readOnly aria-describedby={`${p}-email-hint`} className={`${input()} text-muted`} />
            <span id={`${p}-email-hint`} className="text-[11px] text-muted">É o e-mail de acesso. Para trocar, fale com o suporte.</span>
          </>,
        )}
        {fieldBox('whatsapp', 'WhatsApp', <input id={`${p}-whatsapp`} type="tel" value={f.whatsapp} onChange={(e) => setF((x) => ({ ...x, whatsapp: maskPhone(e.target.value) }))} autoComplete="tel" className={input(errors.whatsapp)} {...aria('whatsapp')} />)}
        {fieldBox('contactName', 'Responsável pelas compras', <input id={`${p}-contactName`} placeholder="Nome de quem recebe o contato" value={f.contactName} onChange={set('contactName')} autoComplete="name" className={input(errors.contactName)} {...aria('contactName')} />)}
        {fieldBox('cep', 'CEP', <input id={`${p}-cep`} inputMode="numeric" placeholder="00000-000" value={f.cep} onChange={(e) => setF((x) => ({ ...x, cep: maskCep(e.target.value) }))} autoComplete="postal-code" className={input(errors.cep)} {...aria('cep')} />)}
        {fieldBox('address', 'Endereço de entrega', <input id={`${p}-address`} placeholder="Rua, número, bairro" value={f.address} onChange={set('address')} autoComplete="street-address" className={input(errors.address)} {...aria('address')} />)}
        {fieldBox('city', 'Cidade', <input id={`${p}-city`} placeholder="Cidade / UF" value={f.city} onChange={set('city')} autoComplete="address-level2" className={input(errors.city)} {...aria('city')} />)}
      </div>
      <div className="flex flex-col gap-[10px]">
        <span className="text-[14px] font-medium">Avisos</span>
        <div className="flex items-center gap-3">
          <span className="flex-grow text-[14px]">Receber resumo e fatura por e-mail</span>
          <Switch checked={f.notifyEmail} onChange={(v) => setF((x) => ({ ...x, notifyEmail: v }))} label="Receber resumo e fatura por e-mail" />
        </div>
        <div className="flex items-center gap-3">
          <span className="flex-grow text-[14px]">Receber lembrete das lives no WhatsApp</span>
          <Switch checked={f.notifyWhatsapp} onChange={(v) => setF((x) => ({ ...x, notifyWhatsapp: v }))} label="Receber lembrete das lives no WhatsApp" />
        </div>
      </div>
      {errors.form && (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {errors.form}
        </p>
      )}
      <div className="flex-grow" />
      <button type="submit" disabled={saving} className={`rounded-full border-none bg-ink font-medium text-white disabled:opacity-70 ${mobile ? 'h-[52px] text-[15px]' : 'h-[50px] self-start px-[26px] text-[14px]'}`}>
        {saving ? 'Salvando…' : 'Salvar alterações'}
      </button>
      {mobile && (
        <button type="button" onClick={logout} className="h-10 border-none bg-transparent text-[14px] text-danger">
          Sair da conta
        </button>
      )}
    </form>
  );
}
