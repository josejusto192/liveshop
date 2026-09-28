'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { PageHeader } from '@/components/admin/PageHeader';
import { IconClose, IconSearch } from '@/components/icons';
import { IconChevronDown, IconDownload } from '@/components/admin/icons-extra';
import { formatBRL, formatInt } from '@/lib/money';
import { initialsOf } from '@/lib/phone';
import { ADMIN_STATUS_LABEL, filtersToQuery, offsetLabel, STATUS_PILL, type OrderFilters, type OrderTab } from '@/lib/orders-shared';
import type { AdminOrderLine } from '@/lib/admin-orders';
import { useDismiss } from '@/components/useDismiss';
import { OrderPanel } from './OrderPanel';

type Props = {
  filters: OrderFilters;
  lines: AdminOrderLine[];
  counts: Record<OrderTab, number>;
  perMinute: number[];
  kpis: { orders: number; units: number; companies: number; cents: number };
  lives: { id: string; name: string; status: string }[];
  products: { id: string; name: string }[];
  brandName: string | null;
  companyName: string | null;
  liveDurationS: number;
  canStatus: boolean;
  canExport: boolean;
  shown: number;
  brandEmails: { name: string; email: string | null }[];
};

const TABS: [OrderTab, string][] = [['draft', 'Rascunho'], ['invoiced', 'Faturados'], ['canceled', 'Cancelados']];
const TITLE: Record<OrderTab, string> = { draft: 'Pedidos em rascunho', invoiced: 'Pedidos faturados', canceled: 'Pedidos cancelados' };
const GRID = 'lg:grid lg:grid-cols-[24px_2fr_1.9fr_1.7fr_0.7fr_0.8fr_0.9fr_0.7fr_0.9fr] lg:gap-[14px]';
// No celular cada linha vira um cartão: empresa e status em cima, produto e valores embaixo.
const M2 = 'max-lg:order-2';
const mm = (m: number) => `${String(m).padStart(2, '0')}:00`;

export function PedidosView(p: Props) {
  const router = useRouter();
  const { flash, toast } = useToast(2600);
  const f = p.filters;
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState(f.q);
  const [panel, setPanel] = useState<string | null>(null);
  const [minOpen, setMinOpen] = useState(false);
  const [dlOpen, setDlOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pdfMenu, setPdfMenu] = useState(false);
  const [sending, setSending] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);
  const dlRef = useRef<HTMLDivElement>(null);
  useDismiss(pdfRef, pdfMenu, () => setPdfMenu(false));
  useDismiss(dlRef, dlOpen, () => setDlOpen(false));

  // Navega mantendo os filtros; "Todas" as lives vai explícito na URL (senão a tela volta para a última live).
  function go(patch: Partial<OrderFilters>) {
    const next = { ...f, ...patch, ids: null };
    const qs = filtersToQuery(next);
    const all = next.liveId ? '' : `${qs ? '&' : ''}liveId=all`;
    setSel(new Set());
    router.push(`/admin/pedidos?${qs}${all}`, { scroll: false });
  }

  // Busca com espera curta enquanto digita.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      if (q.trim() !== f.q) go({ q: q.trim() });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => setSel(new Set()), [f.tab]);

  const visible = p.lines;
  const selected = visible.filter((l) => sel.has(l.itemId));
  const selUnits = selected.reduce((a, l) => a + l.qty, 0);
  const allSel = visible.length > 0 && selected.length === visible.length;
  const exportQs = filtersToQuery({ ...f, ids: null });
  const selQs = filtersToQuery({ ...f, ids: selected.map((l) => l.itemId) });
  const brands = useMemo(() => [...new Set(p.lines.map((l) => l.brandName))], [p.lines]);
  const liveName = p.lives.find((l) => l.id === f.liveId)?.name ?? 'Todas';
  const productName = p.products.find((x) => x.id === f.productId)?.name ?? 'Todos';
  const endMin = Math.max(1, Math.ceil(p.liveDurationS / 60));
  const minLabel = f.minFrom === null && f.minTo === null ? `00:00 a ${mm(endMin)}` : `${mm(f.minFrom ?? 0)} a ${f.minTo !== null ? `${String(f.minTo).padStart(2, '0')}:59` : mm(endMin)}`;

  async function markInvoiced() {
    const orderIds = [...new Set(selected.map((l) => l.orderId))];
    setBusy(true);
    const res = await fetch('/api/admin/orders/bulk-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderIds, status: 'invoiced' }) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return flash(data.error?.message ?? 'Não foi possível mudar o status.');
    setSel(new Set());
    flash(orderIds.length === 1 ? '1 pedido marcado como faturado' : `${formatInt(orderIds.length)} pedidos marcados como faturados`);
    router.refresh();
  }

  async function sendToBrand() {
    setSending(true);
    const res = await fetch(`/api/admin/orders/send-to-brand?${exportQs}`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    setPdfMenu(false);
    if (!res.ok) return flash(data.error?.message ?? 'Não foi possível enviar.');
    const sent = data.sent as { brand: string; email: string }[];
    flash(sent.length === 1 ? `PDF enviado para ${sent[0].email}` : `PDF enviado para ${sent.length} marcas`);
    router.refresh();
  }

  function toggle(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const pdfToast = brands.length === 1 ? `PDF da ${brands[0]} gerado, pronto para enviar` : 'PDF gerado por marca, pronto para enviar';

  return (
    <div className="relative flex min-h-0 flex-grow flex-col gap-4">
      <PageHeader eyebrow="Faturamento" title={TITLE[f.tab]}>
        {p.canExport && (
          <>
            <a href={`/api/admin/orders/export.csv?${exportQs}`} download onClick={() => flash('Arquivo CSV gerado com os pedidos do filtro')} className="flex h-11 items-center rounded-full bg-white px-[18px] text-[14px] text-ink no-underline">CSV</a>
            <a href={`/api/admin/orders/export.xlsx?${exportQs}`} download onClick={() => flash('Planilha Excel gerada com os pedidos do filtro')} className="flex h-11 items-center rounded-full bg-white px-[18px] text-[14px] text-ink no-underline">Excel</a>
            <div ref={pdfRef} className="relative flex h-11 items-center rounded-full bg-ink">
              <a href={`/api/admin/orders/export.pdf?${exportQs}`} download onClick={() => flash(pdfToast)} className="flex h-11 items-center gap-[10px] rounded-l-full pl-2 pr-3 text-[14px] font-medium text-white no-underline">
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-accent text-ink"><IconDownload /></span>PDF para a marca
              </a>
              <span className="h-5 w-px bg-dark-line" aria-hidden />
              <button type="button" aria-label="Enviar o PDF para a marca por e-mail" aria-expanded={pdfMenu} onClick={() => setPdfMenu((o) => !o)} className="flex h-11 w-10 items-center justify-center rounded-r-full border-none bg-transparent pr-1 text-white">
                <IconChevronDown />
              </button>
              {pdfMenu && (
                <div className="anim-fade absolute right-0 top-[52px] z-30 flex w-[300px] flex-col gap-2 rounded-[18px] bg-white p-3 text-ink shadow-[0_16px_40px_rgba(17,18,20,0.18)]">
                  <span className="px-1 text-[13px] font-medium">Enviar por e-mail</span>
                  {p.brandEmails.length === 0 && <span className="px-1 text-[12px] text-muted">Nenhum pedido no filtro.</span>}
                  {p.brandEmails.map((b) => (
                    <span key={b.name} className="px-1 text-[12px] text-muted">
                      {b.name}: {b.email ?? 'sem e-mail de pedidos (cadastre em Marcas)'}
                    </span>
                  ))}
                  <button type="button" onClick={sendToBrand} disabled={sending || !p.brandEmails.some((b) => b.email)} className="mt-1 h-10 rounded-full border-none bg-ink text-[13px] font-medium text-white disabled:opacity-50">
                    {sending ? 'Enviando…' : 'Enviar PDF para a marca'}
                  </button>
                  <span className="px-1 text-[11px] leading-[1.4] text-muted">Os pedidos enviados aparecem como “Enviado à marca” na linha do tempo do comprador.</span>
                </div>
              )}
            </div>
          </>
        )}
      </PageHeader>

      <div className="grid shrink-0 grid-cols-2 gap-3 lg:h-[104px] lg:grid-cols-4 lg:gap-4">
        <Kpi label="Pedidos no filtro" value={formatInt(p.kpis.orders)} />
        <Kpi label="Unidades" value={formatInt(p.kpis.units)} />
        <Kpi label="Empresas" value={formatInt(p.kpis.companies)} />
        <div className="col-span-2 box-border flex h-[104px] flex-col gap-2 rounded-card bg-surface px-5 py-[18px] lg:col-span-1 lg:h-auto">
          <span className="text-[13px] text-muted">Pedidos por minuto da live</span>
          <MinuteBars data={p.perMinute} from={f.minFrom} to={f.minTo} />
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div role="group" aria-label="Status" className="flex max-w-full overflow-x-auto rounded-full bg-white p-1">
          {TABS.map(([t, label]) => (
            <button key={t} type="button" aria-pressed={f.tab === t} onClick={() => go({ tab: t })} className={`h-[34px] shrink-0 whitespace-nowrap rounded-full border-none px-4 text-[13px] font-medium ${f.tab === t ? 'bg-ink text-white' : 'bg-transparent text-ink-2'}`}>
              {label} · {formatInt(p.counts[t])}
            </button>
          ))}
        </div>
        <SelectChip label="Live" value={liveName} aria="Filtrar por live" current={f.liveId ?? ''} options={[{ id: '', name: 'Todas' }, ...p.lives]} onChange={(v) => go({ liveId: v || null, productId: null, minFrom: null, minTo: null })} />
        <SelectChip label="Produto" value={productName} aria="Filtrar por produto" current={f.productId ?? ''} options={[{ id: '', name: 'Todos' }, ...p.products]} onChange={(v) => go({ productId: v || null })} />
        <div className="relative">
          <button type="button" aria-expanded={minOpen} onClick={() => setMinOpen((o) => !o)} className="flex h-[42px] items-center gap-[6px] rounded-full border-none bg-white pl-4 pr-[14px] text-[13px] text-ink">
            <span className="text-muted">Minuto</span>
            <span className="font-medium">{minLabel}</span>
            <IconChevronDown />
          </button>
          {minOpen && <MinutePopover from={f.minFrom} to={f.minTo} max={endMin} onClose={() => setMinOpen(false)} onApply={(a, b) => { setMinOpen(false); go({ minFrom: a, minTo: b }); }} />}
        </div>
        {p.brandName && <FilterTag label="Marca" value={p.brandName} onClear={() => go({ brandId: null })} />}
        {p.companyName && <FilterTag label="Empresa" value={p.companyName} onClear={() => go({ companyId: null })} />}
        <div className="flex-grow" />
        <label className="box-border flex h-[42px] w-full items-center gap-2 rounded-full bg-white px-4 text-muted sm:w-[200px] sm:min-w-[150px] sm:shrink">
          <IconSearch />
          <input aria-label="Buscar empresa" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Empresa, e-mail, WhatsApp" className="min-w-0 flex-grow border-none bg-transparent text-[14px] text-ink outline-none focus-visible:shadow-none" />
        </label>
      </div>

      <div key={f.tab} className="anim-swap box-border flex min-h-[240px] flex-grow flex-col overflow-hidden rounded-card bg-surface px-4 py-1 lg:min-h-0 lg:px-[22px]">
        {(p.canStatus || p.canExport) && visible.length > 0 && (
          <label className="flex h-11 items-center gap-3 text-[13px] text-muted lg:hidden">
            <input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(visible.map((l) => l.itemId)))} className="m-0 h-4 w-4 accent-ink" />
            Selecionar todos
          </label>
        )}
        <div className={`${GRID} hidden h-[42px] shrink-0 items-center text-[12px] text-muted`}>
          {p.canStatus || p.canExport ? (
            <input type="checkbox" aria-label="Selecionar todos" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(visible.map((l) => l.itemId)))} className="m-0 h-4 w-4 accent-ink" />
          ) : (
            <span />
          )}
          <span>Empresa</span>
          <span>Contato</span>
          <span>Produto</span>
          <span>Qtd.</span>
          <span>Preço/un.</span>
          <span>Subtotal</span>
          <span>Minuto</span>
          <span>Status</span>
        </div>
        {visible.length === 0 ? (
          <div className="flex flex-grow flex-col items-center justify-center gap-[6px] text-[14px] text-muted">
            <span className="text-[16px] font-medium text-ink">Nada por aqui</span>
            Nenhum pedido com esse status no filtro atual.
          </div>
        ) : (
          <div className="-mx-4 min-h-0 flex-grow overflow-y-auto lg:-mx-[22px]">
            {visible.map((l) => {
              const on = sel.has(l.itemId);
              return (
                <div key={l.itemId} className={`${GRID} flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-solid border-line-2 px-4 py-3 text-[14px] lg:h-14 lg:px-[22px] lg:py-0 ${on ? 'bg-[#F7F9EC]' : 'bg-white'}`}>
                  {p.canStatus || p.canExport ? <input type="checkbox" checked={on} onChange={() => toggle(l.itemId)} aria-label={`Selecionar pedido de ${l.company}, ${l.product}`} className="m-0 h-4 w-4 accent-ink" /> : <span />}
                  <button type="button" onClick={() => setPanel(l.orderId)} className="flex min-w-0 flex-1 items-center gap-[10px] border-none bg-transparent p-0 text-left text-ink lg:flex-none" aria-label={`Abrir pedido ${l.code} de ${l.company}`}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-line-2 text-[11px] font-semibold">{initialsOf(l.company)}</span>
                    <span className="truncate font-medium">{l.company}</span>
                  </button>
                  <span className={`hidden min-w-0 flex-col text-[13px] lg:flex`}>
                    <span className="truncate">{l.email}</span>
                    <span className="text-muted">{l.whatsapp}</span>
                  </span>
                  <span className={`flex min-w-0 basis-full flex-col pl-[26px] lg:basis-auto lg:pl-0 ${M2}`}>
                    <span className="truncate">{l.product}</span>
                    {!f.liveId && <span className="truncate text-[12px] text-muted">{l.liveName}</span>}
                  </span>
                  <span className={`font-mono max-lg:pl-[26px] ${M2}`}>{formatInt(l.qty)}<span className="font-sans text-[12px] text-muted lg:hidden"> un.</span></span>
                  <span className={`tabular whitespace-nowrap text-[13px] text-ink-2 ${M2}`}><span className="lg:hidden">× </span>{formatBRL(l.unitPriceCents)}</span>
                  <span className={`tabular whitespace-nowrap text-[13px] font-medium ${M2}`}><span className="font-normal text-muted lg:hidden">= </span>{formatBRL(l.subtotalCents)}</span>
                  <span className={`font-mono text-muted max-lg:ml-auto max-lg:text-[12px] ${M2}`}>{offsetLabel(l.offsetS)}</span>
                  <span className="shrink-0">
                    <span className={`whitespace-nowrap rounded-full px-[10px] py-1 text-[12px] font-medium ${STATUS_PILL[l.status]}`}>{ADMIN_STATUS_LABEL[l.status]}</span>
                  </span>
                </div>
              );
            })}
            {p.kpis.orders > visible.length && (
              <p className="m-0 border-t border-solid border-line-2 px-[22px] py-4 text-center text-[13px] text-muted">
                Mostrando {formatInt(visible.length)} de {formatInt(p.kpis.orders)} pedidos. Refine os filtros ou exporte para ver todos.
              </p>
            )}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="on-dark anim-fade lg:anim-pop-c fixed inset-x-3 bottom-3 z-30 flex flex-wrap items-center gap-2 rounded-[22px] bg-dark p-3 lg:absolute lg:inset-x-auto lg:bottom-8 lg:left-1/2 lg:flex-nowrap lg:gap-[14px] lg:rounded-full lg:py-2 lg:pl-[22px] lg:pr-2 lg:-translate-x-1/2 text-white shadow-[0_16px_40px_rgba(17,18,20,0.25)]" role="region" aria-label="Pedidos selecionados">
          <span className="whitespace-nowrap text-[14px]">
            <strong className="font-medium">{selected.length === 1 ? '1 selecionado' : `${formatInt(selected.length)} selecionados`}</strong>
            <span className="text-dark-muted"> · {formatInt(selUnits)} un.</span>
          </span>
          <button type="button" onClick={() => setSel(new Set())} className="h-10 whitespace-nowrap rounded-full border border-solid border-dark-line bg-transparent px-4 text-[13px] text-white">Limpar seleção</button>
          {p.canExport && (
            <div ref={dlRef} className="relative">
              <button type="button" aria-expanded={dlOpen} onClick={() => setDlOpen((o) => !o)} className="h-10 whitespace-nowrap rounded-full border border-solid border-dark-line bg-transparent px-4 text-[13px] text-white">Baixar selecionados</button>
              {dlOpen && (
                <div className="anim-fade absolute bottom-12 left-0 flex w-[190px] flex-col gap-1 rounded-2xl bg-white p-2 text-ink shadow-[0_16px_40px_rgba(17,18,20,0.2)]">
                  {[
                    ['csv', 'CSV'],
                    ['xlsx', 'Excel'],
                    ['pdf', 'PDF para a marca'],
                  ].map(([ext, label]) => (
                    <a key={ext} href={`/api/admin/orders/export.${ext}?${selQs}`} download onClick={() => setDlOpen(false)} className="flex h-10 items-center rounded-xl px-3 text-[13px] text-ink no-underline hover:bg-surface-2">
                      {label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
          {f.tab === 'draft' && p.canStatus && (
            <button type="button" onClick={markInvoiced} disabled={busy} className="h-10 whitespace-nowrap rounded-full border-none bg-accent px-[18px] text-[13px] font-medium text-ink disabled:opacity-70">
              {busy ? 'Salvando…' : 'Marcar como faturado'}
            </button>
          )}
        </div>
      )}

      {panel && (
        <OrderPanel
          orderId={panel}
          canStatus={p.canStatus}
          onClose={() => setPanel(null)}
          onChanged={(msg) => {
            flash(msg);
            router.refresh();
          }}
        />
      )}
      {toast}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="box-border flex flex-col gap-1 rounded-card bg-surface px-5 py-[18px]">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-[32px] font-medium tracking-[-0.04em]">{value}</span>
    </div>
  );
}

/** Barras por minuto. Com filtro de minuto, destaca o intervalo; sem filtro, destaca o pico de 5 minutos. */
function MinuteBars({ data, from, to }: { data: number[]; from: number | null; to: number | null }) {
  const max = Math.max(1, ...data);
  let lo = from ?? -1;
  let hi = to ?? -1;
  if (from === null && to === null && data.length) {
    let best = -1;
    for (let i = 0; i < data.length; i++) {
      const sum = data.slice(i, i + 5).reduce((a, b) => a + b, 0);
      if (sum > best) {
        best = sum;
        lo = i;
      }
    }
    hi = lo + 4;
  } else {
    if (from === null) lo = 0;
    if (to === null) hi = data.length;
  }
  if (!data.length) return <div className="flex flex-grow items-end text-[12px] text-muted">Sem pedidos no filtro</div>;
  return (
    <div className="flex flex-grow items-end gap-[2px]" role="img" aria-label={`Pedidos por minuto: pico de ${formatInt(max)} no minuto ${data.indexOf(max)}`}>
      {data.map((v, i) => (
        <span key={i} className={`flex-grow rounded-[2px] ${i >= lo && i <= hi ? 'bg-ink' : 'bg-line'}`} style={{ height: `${Math.round((v / max) * 48) + 2}px` }} />
      ))}
    </div>
  );
}

function SelectChip({ label, value, aria, current, options, onChange }: { label: string; value: string; aria: string; current: string; options: { id: string; name: string }[]; onChange: (v: string) => void }) {
  return (
    <span className="relative flex h-[42px] max-w-[260px] items-center gap-[6px] rounded-full bg-white pl-4 pr-[14px] text-[13px] focus-within:shadow-[0_0_0_2px_var(--ink)]">
      <span className="text-muted">{label}</span>
      <span className="truncate font-medium">{value}</span>
      <IconChevronDown />
      <select aria-label={aria} value={current} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </span>
  );
}

function FilterTag({ label, value, onClear }: { label: string; value: string; onClear: () => void }) {
  return (
    <span className="flex h-[42px] items-center gap-[6px] rounded-full bg-white pl-4 pr-1 text-[13px]">
      <span className="text-muted">{label}</span>
      <span className="max-w-[160px] truncate font-medium">{value}</span>
      <button type="button" onClick={onClear} aria-label={`Remover filtro ${label.toLowerCase()}`} className="flex h-8 w-8 items-center justify-center rounded-full border-none bg-surface-2 text-ink">
        <IconClose size={12} />
      </button>
    </span>
  );
}

function MinutePopover({ from, to, max, onApply, onClose }: { from: number | null; to: number | null; max: number; onApply: (a: number | null, b: number | null) => void; onClose: () => void }) {
  const [a, setA] = useState(from === null ? '' : String(from));
  const [b, setB] = useState(to === null ? '' : String(to));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);
  const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.min(24 * 60, parseInt(v, 10) || 0)));
  return (
    <div ref={ref} role="dialog" aria-label="Filtrar por minuto da live" className="anim-fade absolute left-0 top-12 z-20 flex w-[260px] flex-col gap-3 rounded-[18px] bg-white p-4 shadow-[0_16px_40px_rgba(17,18,20,0.18)]">
      <span className="text-[13px] font-medium">Minuto da live</span>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[12px] text-muted">
          De (min)
          <input inputMode="numeric" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, ''))} placeholder="0" className="h-10 rounded-xl border-none bg-surface-2 px-3 text-[14px] text-ink" autoFocus />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-muted">
          Até (min)
          <input inputMode="numeric" value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, ''))} placeholder={String(max)} className="h-10 rounded-xl border-none bg-surface-2 px-3 text-[14px] text-ink" />
        </label>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => onApply(null, null)} className="h-10 flex-grow rounded-full border border-solid border-line bg-white text-[13px] text-ink">Limpar</button>
        <button type="button" onClick={() => onApply(num(a), num(b))} className="h-10 flex-grow rounded-full border-none bg-ink text-[13px] font-medium text-white">Aplicar</button>
      </div>
    </div>
  );
}
