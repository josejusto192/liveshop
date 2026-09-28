'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { PageHeader } from '@/components/admin/PageHeader';
import { IconSearch } from '@/components/icons';
import { formatInt } from '@/lib/money';
import { initialsOf, waLink } from '@/lib/phone';
import type { CompanyDetail, CompanyRow, CompanySeg } from '@/lib/admin-companies';

type Props = {
  filters: { seg: CompanySeg; q: string };
  rows: CompanyRow[];
  kpis: { total: number; buyers: number; watchers: number; fresh: number };
  initial: CompanyDetail | null;
  canOrders: boolean;
};

const SEGS: [CompanySeg, string][] = [['all', 'Todas'], ['buyers', 'Compraram'], ['watchers', 'Só assistiram']];
const GRID = 'lg:grid lg:grid-cols-[2.2fr_1.6fr_0.7fr_0.9fr_1fr_0.8fr] gap-3';

export function EmpresasView({ filters, rows, kpis, initial, canOrders }: Props) {
  const router = useRouter();
  const { flash, toast } = useToast();
  const [q, setQ] = useState(filters.q);
  const [sel, setSel] = useState<CompanyDetail | null>(initial);
  const [loading, setLoading] = useState(false);
  const [swap, setSwap] = useState(0);

  useEffect(() => setSel(initial), [initial]);

  function go(patch: Partial<{ seg: CompanySeg; q: string }>) {
    const next = { ...filters, ...patch };
    const p = new URLSearchParams();
    if (next.seg !== 'all') p.set('seg', next.seg);
    if (next.q) p.set('q', next.q);
    router.push(`/admin/empresas?${p}`, { scroll: false });
  }

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => q.trim() !== filters.q && go({ q: q.trim() }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function pick(id: string) {
    if (sel?.id === id) return;
    setLoading(true);
    const res = await fetch(`/api/admin/companies/${id}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) return flash(data.error?.message ?? 'Não foi possível abrir a empresa.');
    setSel(data.company);
    setSwap((n) => n + 1);
    // No celular o detalhe fica abaixo da lista: rola até ele.
    if (window.matchMedia('(max-width: 1023px)').matches) setTimeout(() => document.getElementById('empresa-detalhe')?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  const exportQs = new URLSearchParams({ ...(filters.seg !== 'all' ? { seg: filters.seg } : {}), ...(filters.q ? { q: filters.q } : {}) }).toString();
  const pct = kpis.total ? Math.round((kpis.buyers / kpis.total) * 100) : 0;

  return (
    <div className="flex min-h-0 flex-grow flex-col gap-4 lg:flex-row">
      <div className="flex min-w-0 flex-grow flex-col gap-4">
        <PageHeader eyebrow="Quem assiste e compra nas lives" title="Empresas compradoras">
          <a href={`/api/admin/companies/export.xlsx?${exportQs}`} download onClick={() => flash('Lista de empresas exportada em Excel')} className="flex h-11 items-center rounded-full bg-white px-[18px] text-[14px] text-ink no-underline">
            Exportar lista
          </a>
        </PageHeader>

        <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:h-[104px] lg:gap-4">
          <div className="box-border flex flex-col gap-1 rounded-card bg-surface px-5 py-[18px]">
            <span className="text-[13px] text-muted">Empresas cadastradas</span>
            <span className="text-[32px] font-medium tracking-[-0.04em]">{formatInt(kpis.total)}</span>
          </div>
          <div className="box-border flex flex-col gap-1 rounded-card bg-surface px-5 py-[18px]">
            <span className="text-[13px] text-muted">Compraram pelo menos 1 vez</span>
            <span className="text-[32px] font-medium tracking-[-0.04em]">
              {formatInt(kpis.buyers)} <span className="text-[14px] tracking-normal text-muted">{pct}%</span>
            </span>
          </div>
          <div className="col-span-2 box-border flex flex-col gap-1 rounded-card bg-accent px-5 py-[18px] sm:col-span-1">
            <span className="text-[13px] text-accent-ink">Novas este mês</span>
            <span className="text-[32px] font-medium tracking-[-0.04em]">+{formatInt(kpis.fresh)}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div role="group" aria-label="Segmento" className="flex max-w-full overflow-x-auto rounded-full bg-white p-1">
            {SEGS.map(([s, label]) => (
              <button key={s} type="button" aria-pressed={filters.seg === s} onClick={() => go({ seg: s })} className={`h-[34px] shrink-0 whitespace-nowrap rounded-full border-none px-4 text-[13px] font-medium ${filters.seg === s ? 'bg-ink text-white' : 'bg-transparent text-ink-2'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex-grow" />
          <label className="box-border flex h-[42px] w-full items-center gap-2 rounded-full bg-white px-4 text-muted sm:w-[260px]">
            <IconSearch />
            <input aria-label="Buscar empresa" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, e-mail ou WhatsApp" className="min-w-0 flex-grow border-none bg-transparent text-[14px] text-ink outline-none focus-visible:shadow-none" />
          </label>
        </div>

        <div key={filters.seg} className="anim-swap box-border flex min-h-[240px] flex-grow flex-col overflow-hidden rounded-card bg-surface px-4 py-1 lg:min-h-0 lg:px-[22px]">
          <div className={`${GRID} hidden h-[42px] shrink-0 items-center text-[12px] text-muted`}>
            <span>Empresa</span>
            <span>WhatsApp</span>
            <span>Lives</span>
            <span>Pedidos</span>
            <span>Unidades</span>
            <span />
          </div>
          {rows.length === 0 ? (
            <div className="flex flex-grow flex-col items-center justify-center gap-[6px] text-[14px] text-muted">
              <span className="text-[16px] font-medium text-ink">Nenhuma empresa por aqui</span>
              {filters.q ? 'Tente outro nome, e-mail ou WhatsApp.' : 'As empresas aparecem quando se cadastram numa live.'}
            </div>
          ) : (
            <div className="-mx-4 min-h-0 flex-grow overflow-y-auto lg:-mx-[22px]">
              {rows.map((r) => {
                const on = r.id === sel?.id;
                return (
                  <div key={r.id} className={`${GRID} flex flex-wrap items-center gap-y-1 border-t border-solid border-line-2 px-4 py-3 text-[14px] lg:h-[58px] lg:px-[22px] lg:py-0 ${on ? 'bg-[#F7F9EC]' : 'bg-white'}`}>
                    <span className="flex min-w-0 flex-1 items-center gap-[10px] lg:flex-none">
                      <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${on ? 'bg-ink text-accent' : 'bg-line-2 text-ink'}`}>{initialsOf(r.name)}</span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{r.name}</span>
                        <span className="truncate text-[12px] text-muted">{r.email}</span>
                      </span>
                    </span>
                    <span className="text-ink-2 max-lg:order-2 max-lg:basis-full max-lg:pl-11 max-lg:text-[13px]">{r.whatsapp}</span>
                    <span className="font-mono max-lg:order-2 max-lg:pl-11 max-lg:text-[13px]"><span className="font-sans text-muted lg:hidden">Lives </span>{formatInt(r.lives)}</span>
                    <span className="font-mono max-lg:order-2 max-lg:text-[13px]"><span className="font-sans text-muted lg:hidden"> · Pedidos </span>{formatInt(r.orders)}</span>
                    <span className="font-mono max-lg:order-2 max-lg:text-[13px]"><span className="font-sans text-muted lg:hidden"> · Unidades </span>{formatInt(r.units)}</span>
                    <span className="flex shrink-0 justify-end">
                      <button type="button" onClick={() => pick(r.id)} aria-pressed={on} aria-label={`Detalhes de ${r.name}`} className={`h-8 rounded-full border border-solid border-line px-[14px] text-[12px] ${on ? 'bg-ink text-white' : 'bg-white text-ink'}`}>
                        Detalhes
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <aside id="empresa-detalhe" aria-label="Detalhes da empresa" aria-busy={loading} key={swap} className="anim-swap flex w-full scroll-mt-16 flex-col gap-4 lg:w-[340px] lg:shrink-0">
        {sel ? (
          <>
            <section className="on-dark box-border flex flex-col gap-[14px] rounded-card bg-dark p-[22px] text-white">
              <div className="flex items-center gap-3">
                <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-accent text-[16px] font-semibold text-ink">{initialsOf(sel.name)}</span>
                <div className="flex min-w-0 flex-col gap-[2px]">
                  <span className="truncate text-[18px] font-medium tracking-[-0.02em]">{sel.name}</span>
                  <span className="text-[12px] text-dark-muted">Cliente desde {sel.since}</span>
                </div>
              </div>
              <div className="flex flex-col gap-[6px] text-[13px] text-[#D5D8DE]">
                <span className="truncate">{sel.email}</span>
                <span>{sel.whatsapp}</span>
                {sel.cnpj && <span>CNPJ {sel.cnpj}</span>}
                {sel.city && <span>{sel.city}</span>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['Lives', formatInt(sel.lives), ''],
                  ['Pedidos', formatInt(sel.orders), ''],
                  ['Unidades', formatInt(sel.units), 'text-accent'],
                ].map(([label, value, cls]) => (
                  <div key={label} className="flex flex-col gap-[2px] rounded-[14px] bg-dark-2 p-3">
                    <span className="text-[11px] text-dark-muted">{label}</span>
                    <span className={`text-[20px] font-medium ${cls}`}>{value}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <a href={waLink(sel.whatsapp)} target="_blank" rel="noreferrer" onClick={() => flash(`Abrindo conversa com ${sel.name} no WhatsApp`)} className="flex h-[42px] flex-grow items-center justify-center rounded-full bg-accent text-[13px] font-medium text-ink no-underline">
                  Chamar no WhatsApp
                </a>
                {canOrders && (
                  <Link href={`/admin/pedidos?companyId=${sel.id}`} className="flex h-[42px] items-center rounded-full border border-solid border-dark-line px-4 text-[13px] text-white no-underline">
                    Ver pedidos
                  </Link>
                )}
              </div>
            </section>
            <section className="box-border flex min-h-0 flex-grow flex-col gap-1 overflow-y-auto rounded-card bg-surface px-[22px] py-5">
              <span className="pb-2 text-[15px] font-medium">Histórico nas lives</span>
              {sel.history.length === 0 && <span className="border-t border-solid border-line-2 py-3 text-[13px] text-muted">Ainda não entrou em nenhuma live.</span>}
              {sel.history.map((h) => (
                <div key={h.liveId} className="flex items-center gap-3 border-t border-solid border-line-2 py-3">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${h.onAir ? 'bg-live' : h.units > 0 ? 'bg-ink' : 'bg-[#D8DBE0]'}`} aria-hidden />
                  <span className="flex min-w-0 flex-grow flex-col gap-[2px]">
                    <span className="truncate text-[13px] font-medium">{h.live}</span>
                    <span className="text-[12px] text-muted">
                      {h.onAir ? 'ao vivo agora' : h.date} · {h.products ? `${formatInt(h.products)} ${h.products === 1 ? 'produto' : 'produtos'}` : 'assistiu, sem pedido'}
                    </span>
                  </span>
                  <span className="font-mono text-[13px]">{formatInt(h.units)} un.</span>
                </div>
              ))}
            </section>
          </>
        ) : (
          <section className="flex flex-grow items-center justify-center rounded-card bg-surface p-6 text-center text-[14px] text-muted">Escolha uma empresa para ver os detalhes.</section>
        )}
      </aside>
      {toast}
    </div>
  );
}
