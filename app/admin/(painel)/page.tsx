import Link from 'next/link';
import { requireAdminPage } from '@/lib/auth';
import { dashboard, monthKeyStr, monthLabel, parseMonth, shiftMonth } from '@/lib/dashboard';
import { listLives } from '@/lib/lives-admin';
import { formatInt } from '@/lib/money';
import { can } from '@/lib/permissions';
import { TZ } from '@/lib/dates';
import { IconSearch } from '@/components/icons';
import { IconArrowUpRight, IconCalendar } from '@/components/admin/icons-extra';
import { Elapsed } from '@/components/admin/Elapsed';
import { NotificationsBell } from '@/components/admin/NotificationsBell';
import { LivesTable, type LiveRowView } from './LivesTable';

export const dynamic = 'force-dynamic';

function greeting() {
  const h = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

function dayKey(d: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function liveDate(d: Date) {
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  if (dayKey(d) === dayKey(new Date())) return `Hoje, ${time}`;
  const day = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(d);
  return `${day}, ${time}`;
}

function barLabel(d: Date, live: boolean) {
  if (live || dayKey(d) === dayKey(new Date())) return 'Hoje';
  const m = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, month: '2-digit', day: '2-digit' }).formatToParts(d);
  return `${m[Number(p.find((x) => x.type === 'month')!.value) - 1]} ${p.find((x) => x.type === 'day')!.value}`;
}

export default async function VisaoGeral({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const admin = await requireAdminPage();
  const sp = await searchParams;
  const month = parseMonth(sp.mes);
  const [d, lives] = await Promise.all([dashboard(month), listLives({ q: sp.q })]);
  const canWrite = can(admin.role, 'lives:write');
  const canOrders = can(admin.role, 'orders:read');

  const variation = d.unitsPrev > 0 ? Math.round(((d.units - d.unitsPrev) / d.unitsPrev) * 100) : null;
  const ref = Math.max(d.units, d.unitsPrev, 1);
  const filled = Math.round((d.units / ref) * 44);
  const ticks = Array.from({ length: 44 }, (_, i) => (i < filled - 5 ? 'bg-ink' : i < filled ? 'bg-accent' : 'bg-[#ECEEF1]'));
  const conv = d.conversion && d.conversion.total ? Math.round((d.conversion.buying / d.conversion.total) * 100) : 0;
  const maxBar = Math.max(1, ...d.bars.map((b) => b.units));
  const maxOffer = Math.max(1, ...d.bars.map((b) => Math.max(b.offered, b.units)));
  const topMax = Math.max(1, ...d.top.map((t) => t.units));

  const rows: LiveRowView[] = lives.map((l) => ({
    id: l.id,
    name: l.name,
    brandName: l.brandName,
    date: liveDate(l.startedAt ?? l.startsAt),
    status: l.status,
    companies: formatInt(l.companies),
    units: formatInt(l.units),
  }));
  const prevM = monthKeyStr(shiftMonth(month, -1));
  const nextM = monthKeyStr(shiftMonth(month, 1));

  return (
    <>
      {sp['sem-permissao'] && <p role="alert" className="m-0 rounded-2xl bg-warn-bg px-4 py-3 text-[14px] text-warn">Seu papel não tem acesso a essa página.</p>}
      <header className="flex shrink-0 flex-wrap items-center gap-[10px] lg:h-[60px] lg:flex-nowrap">
        <div className="flex min-w-0 flex-grow flex-col gap-[2px]">
          <span className="text-[13px] text-muted lg:text-[14px]">{greeting()}, {admin.name.split(' ')[0]}</span>
          <h1 className="text-[24px] font-medium tracking-[-0.03em] lg:text-[30px]">Visão geral</h1>
        </div>
        <form role="search" className="order-last box-border flex h-11 w-full items-center lg:order-none lg:w-[260px] gap-2 rounded-full bg-white px-4 text-muted focus-within:shadow-[0_0_0_2px_var(--ink)]">
          <IconSearch />
          {sp.mes && <input type="hidden" name="mes" value={sp.mes} />}
          <input name="q" defaultValue={sp.q ?? ''} aria-label="Buscar" placeholder="Buscar live, marca ou empresa" className="min-w-0 flex-grow border-none bg-transparent text-[14px] text-ink outline-none focus-visible:shadow-none" />
        </form>
        <NotificationsBell />
        <div className="flex h-11 items-center rounded-full bg-white px-1 text-[14px] max-sm:order-last max-sm:w-full max-sm:justify-between">
          <Link href={`/admin?mes=${prevM}`} aria-label="Mês anterior" className="flex h-9 w-9 items-center justify-center rounded-full text-ink no-underline hover:bg-surface-2">‹</Link>
          <span className="flex items-center gap-2 px-2"><IconCalendar />{monthLabel(month)}</span>
          <Link href={`/admin?mes=${nextM}`} aria-label="Próximo mês" className="flex h-9 w-9 items-center justify-center rounded-full text-ink no-underline hover:bg-surface-2">›</Link>
        </div>
        {canWrite && (
          <Link href="/admin/lives/nova" className="flex h-11 items-center gap-[10px] whitespace-nowrap rounded-full bg-ink pl-2 pr-5 text-[14px] font-medium text-white no-underline">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-accent text-[18px] leading-none text-ink">+</span>Nova live
          </Link>
        )}
      </header>

      <div className="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:flex lg:h-[200px]">
        <div className="on-dark box-border flex min-h-[190px] flex-col sm:col-span-2 lg:min-h-0 lg:w-[360px] lg:shrink-0 gap-[10px] rounded-card bg-dark p-[22px] text-white">
          {d.liveNow ? (
            <>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-[6px] rounded-full bg-live px-[10px] py-1 text-[11px] font-semibold tracking-[0.06em]">
                  <span className="h-[6px] w-[6px] animate-[lsPulse_1.6s_ease-in-out_infinite] rounded-full bg-white" />AO VIVO
                </span>
                <Elapsed since={d.liveNow.startedAt.getTime()} className="font-mono text-[13px] text-dark-muted" />
              </div>
              <span className="truncate text-[18px] font-medium tracking-[-0.01em]">{d.liveNow.name}</span>
              <div className="flex items-baseline gap-2">
                <span className="text-[36px] font-medium leading-none tracking-[-0.04em] tabular">{formatInt(d.liveNow.viewers)}</span>
                <span className="text-[14px] text-dark-muted">{d.liveNow.viewers === 1 ? 'empresa assistindo' : 'empresas assistindo'}</span>
              </div>
              <div className="flex-grow" />
              <div className="flex items-center gap-2">
                {canWrite && (
                  <Link href={`/admin/lives/${d.liveNow.id}/central`} className="flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-[14px] font-medium text-ink no-underline">
                    Abrir central<IconArrowUpRight />
                  </Link>
                )}
                {d.liveNow.position && <span className="text-[13px] text-dark-muted">Produto {d.liveNow.position} de {d.liveNow.total} no ar</span>}
              </div>
            </>
          ) : (
            <>
              <span className="self-start rounded-full bg-dark-3 px-[10px] py-1 text-[11px] font-semibold tracking-[0.06em] text-dark-muted">SEM LIVE NO AR</span>
              {d.nextLive ? (
                <>
                  <span className="truncate text-[18px] font-medium tracking-[-0.01em]">{d.nextLive.name}</span>
                  <span className="text-[14px] text-dark-muted">Próxima live · {liveDate(d.nextLive.startsAt)}</span>
                  <div className="flex-grow" />
                  {canWrite && (
                    <Link href={`/admin/lives/${d.nextLive.id}/central`} className="flex h-10 items-center gap-2 self-start rounded-full bg-accent px-4 text-[14px] font-medium text-ink no-underline">
                      Abrir central<IconArrowUpRight />
                    </Link>
                  )}
                </>
              ) : (
                <>
                  <span className="text-[16px] text-dark-muted">Nenhuma live agendada.</span>
                  <div className="flex-grow" />
                  {canWrite && (
                    <Link href="/admin/lives/nova" className="flex h-10 items-center gap-2 self-start rounded-full bg-accent px-4 text-[14px] font-medium text-ink no-underline">Criar live</Link>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="box-border flex min-h-[180px] min-w-0 flex-grow flex-col gap-[10px] rounded-card bg-surface p-[22px] sm:col-span-2 lg:min-h-0">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-medium">Unidades registradas</span>
            {canOrders && (
              <Link href="/admin/pedidos" aria-label="Ver pedidos" className="flex h-8 w-8 items-center justify-center rounded-full border border-solid border-line text-ink"><IconArrowUpRight size={12} /></Link>
            )}
          </div>
          <div className="flex items-center gap-[10px]">
            <span className="text-[36px] font-medium tracking-[-0.04em] tabular">{formatInt(d.units)}</span>
            {variation !== null && (
              <span className={`rounded-full px-2 py-[3px] text-[12px] font-medium ${variation >= 0 ? 'bg-ok-bg text-ok' : 'bg-danger-bg text-danger'}`}>
                {variation >= 0 ? '↗' : '↘'} {Math.abs(variation)}%
              </span>
            )}
          </div>
          <span className="text-[13px] text-muted">No mês, somando todas as lives{variation !== null ? ' · comparado ao mês anterior' : ''}</span>
          <div className="flex-grow" />
          <div className="flex h-7 items-stretch gap-[3px]" aria-hidden>
            {ticks.map((c, i) => <span key={i} className={`flex-grow rounded-[2px] ${c}`} />)}
          </div>
        </div>

        <div className="box-border flex min-h-[180px] flex-col gap-[10px] rounded-card bg-surface p-[22px] lg:min-h-0 lg:w-[230px] lg:shrink-0">
          <span className="text-[15px] font-medium">Conversão da live</span>
          <div className="flex items-baseline gap-[6px]">
            <span className="text-[36px] font-medium tracking-[-0.04em] tabular">{conv}%</span>
            <span className="text-[13px] text-muted">pediram</span>
          </div>
          <span className="text-[13px] text-muted">{d.conversion ? `${formatInt(d.conversion.buying)} de ${formatInt(d.conversion.total)} empresas` : 'Nenhuma live realizada ainda'}</span>
          <div className="flex-grow" />
          <div className="flex h-3 gap-1" aria-hidden>
            <span className="rounded-full bg-ink" style={{ width: `${conv}%` }} />
            <span className="flex-grow rounded-full bg-[repeating-linear-gradient(135deg,#E4E6EA_0_4px,#F4F5F6_4px_8px)]" />
          </div>
        </div>

        <div className="box-border flex min-h-[180px] flex-col gap-[10px] rounded-card bg-accent p-[22px] lg:min-h-0 lg:w-[230px] lg:shrink-0">
          <span className="text-[15px] font-medium">Pedidos em rascunho</span>
          <span className="text-[36px] font-medium tracking-[-0.04em] tabular">{formatInt(d.draftOrders)}</span>
          <span className="text-[13px] text-accent-ink">Aguardando faturamento</span>
          <div className="flex-grow" />
          {canOrders && (
            <Link href="/admin/pedidos" className="flex h-[38px] items-center self-start rounded-full bg-ink px-4 text-[13px] font-medium text-white no-underline">Faturar pedidos</Link>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-4 lg:h-[270px] lg:flex-row">
        <div className="box-border flex h-[280px] min-w-0 flex-grow flex-col gap-[14px] rounded-card bg-surface p-[22px] lg:h-auto">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex-grow text-[15px] font-medium">Unidades por live</span>
            <span className="flex items-center gap-[6px] text-[12px] text-muted"><span className="h-2 w-2 rounded-full bg-ink" />Registradas</span>
            <span className="flex items-center gap-[6px] text-[12px] text-muted"><span className="h-2 w-2 rounded-full bg-[#D8DBE0]" />Estoque ofertado</span>
            <span className="hidden rounded-full border border-solid border-line px-3 py-[7px] text-[13px] sm:inline">Últimas 10 lives</span>
          </div>
          {d.bars.length === 0 ? (
            <div className="flex flex-grow items-center justify-center text-[14px] text-muted">As lives realizadas aparecem aqui.</div>
          ) : (
            <div className="relative flex flex-grow items-end gap-[6px] sm:gap-[14px]" role="img" aria-label={`Unidades por live: ${d.bars.map((b) => `${b.name} ${formatInt(b.units)}`).join(', ')}`}>
              {d.bars.map((b) => {
                const hi = b.units === maxBar && b.units > 0;
                const h = Math.round((b.units / maxOffer) * 150);
                const cap = Math.max(8, Math.round(((Math.max(b.offered, b.units) - b.units) / maxOffer) * 150));
                return (
                  <div key={b.id} className="relative flex h-full flex-grow flex-col items-center justify-end gap-[6px]" title={`${b.name}: ${formatInt(b.units)} un.`}>
                    {hi && <span className="absolute -top-1 whitespace-nowrap rounded-lg bg-ink px-[9px] py-[5px] text-[12px] text-white">{formatInt(b.units)} un.</span>}
                    <div className="w-full max-w-[44px] rounded-t-xl bg-[repeating-linear-gradient(135deg,#E4E6EA_0_4px,#F4F5F6_4px_8px)]" style={{ height: cap }} />
                    <div className={`-mt-[6px] w-full max-w-[44px] rounded-xl ${hi ? 'bg-ink' : b.live ? 'bg-accent' : 'bg-[#D8DBE0]'}`} style={{ height: Math.max(6, h) }} />
                    <span className="text-[11px] text-muted">{barLabel(b.at, b.live)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="box-border flex w-full flex-col gap-3 rounded-card bg-surface p-[22px] lg:w-[380px] lg:shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-medium">Mais pedidos no mês</span>
            {can(admin.role, 'products:write') && <Link href="/admin/produtos" className="text-[13px] text-muted">Ver todos</Link>}
          </div>
          {d.top.length === 0 && <p className="m-0 text-[14px] text-muted">Nenhum pedido neste mês.</p>}
          {d.top.map((t, i) => (
            <div key={t.productId} className="flex items-center gap-3">
              {t.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.imageUrl} alt="" className="h-[42px] w-[42px] shrink-0 rounded-xl object-cover" />
              ) : (
                <span className="h-[42px] w-[42px] shrink-0 rounded-xl bg-line-2" />
              )}
              <div className="flex min-w-0 flex-grow flex-col gap-[6px]">
                <div className="flex justify-between gap-2"><span className="truncate text-[14px] font-medium">{t.name}</span><span className="font-mono text-[13px]">{formatInt(t.units)}</span></div>
                <div className="h-[6px] overflow-hidden rounded-full bg-line-2">
                  <div className={`h-[6px] rounded-full ${i < 2 ? 'bg-ink' : i === 2 ? 'bg-accent' : 'bg-[#D8DBE0]'}`} style={{ width: `${Math.round((t.units / topMax) * 100)}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <LivesTable rows={rows} canWrite={canWrite} canOrders={canOrders} />
    </>
  );
}
