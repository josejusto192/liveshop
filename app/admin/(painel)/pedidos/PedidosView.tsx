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
};

const TABS: [OrderTab, string][] = [['draft', 'Rascunho'], ['invoiced', 'Faturados'], ['canceled', 'Cancelados']];
const TITLE: Record<OrderTab, string> = { draft: 'Pedidos em rascunho', invoiced: 'Pedidos faturados', canceled: 'Pedidos cancelados' };
const GRID = 'grid grid-cols-[24px_2fr_1.9fr_1.7fr_0.7fr_0.8fr_0.9fr_0.7fr_0.9fr] gap-[14px]';
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
            <a href={`/api/admin/orders/export.pdf?${exportQs}`} download onClick={() => flash(pdfToast)} className="flex h-11 items-center gap-[10px] rounded-full bg-ink pl-2 pr-5 text-[14px] font-medium text-white no-underline">
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-accent text-ink"><IconDownload /></span>PDF para a marca
            </a>
          </>
        )}
      </PageHeader>

      <div className="grid h-[104px] shrink-0 grid-cols-4 gap-4">
        <Kpi label="Pedidos no filtro" value={formatInt(p.kpis.orders)} />
        <Kpi label="Unidades" value={formatInt(p.kpis.units)} />
        <Kpi label="Empresas" value={formatInt(p.kpis.companies)} />
        <div className="box-border flex flex-col gap-2 rounded-card bg-surface px-5 py-[18px]">
          <span className="text-[13px] text-muted">Pedidos por minuto da live</span>
          <MinuteBars data={p.perMinute} from={f.minFrom} to={f.minTo} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div role="group" aria-label="Status" className="flex rounded-full bg-white p-1">
          {TABS.map(([t, label]) => (
            <button key={t} type="button" aria-pressed={f.tab === t} onClick={() => go({ tab: t })} className={`h-[34px] rounded-full border-none px-4 text-[13px] font-medium ${f.tab === t ? 'bg-ink text-white' : 'bg-transparent text-ink-2'}`}>
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
        <label className="box-border flex h-[42px] w-[200px] min-w-[150px] shrink items-center gap-2 rounded-full bg-white px-4 text-muted">
          <IconSearch />
          <input aria-label="Buscar empresa" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Empresa, e-mail, WhatsApp" className="min-w-0 flex-grow border-none bg-transparent text-[14px] text-ink outline-none focus-visible:shadow-none" />
        </label>
      </div>

      <div key={f.tab} className="anim-swap box-border flex min-h-0 flex-grow flex-col overflow-hidden rounded-card bg-surface px-[22px] py-1">
        <div className={`${GRID} h-[42px] shrink-0 items-center text-[12px] text-muted`}>
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
          <div className="-mx-[22px] min-h-0 flex-grow overflow-y-auto">
            {visible.map((l) => {
              const on = sel.has(l.itemId);
              return (
                <div key={l.itemId} className={`${GRID} h-14 items-center border-t border-solid border-line-2 px-[22px] text-[14px] ${on ? 'bg-[#F7F9EC]' : 'bg-white'}`}>
                  {p.canStatus || p.canExport ? <input type="checkbox" checked={on} onChange={() => toggle(l.itemId)} aria-label={`Selecionar pedido de ${l.company}, ${l.product}`} className="m-0 h-4 w-4 accent-ink" /> : <span />}
                  <button type="button" onClick={() => setPanel(l.orderId)} className="flex min-w-0 items-center gap-[10px] border-none bg-transparent p-0 text-left text-ink" aria-label={`Abrir pedido ${l.code} de ${l.company}`}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-line-2 text-[11px] font-semibold">{initialsOf(l.company)}</span>
                    <span className="truncate font-medium">{l.company}</span>
                  </button>
                  <span className="flex min-w-0 flex-col text-[13px]">
                    <span className="truncate">{l.email}</span>
                    <span className="text-muted">{l.whatsapp}</span>
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{l.product}</span>
                    {!f.liveId && <span className="truncate text-[12px] text-muted">{l.liveName}</span>}
                  </span>
                  <span className="font-mono">{formatInt(l.qty)}</span>
                  <span className="tabular whitespace-nowrap text-[13px] text-ink-2">{formatBRL(l.unitPriceCents)}</span>
                  <span className="tabular whitespace-nowrap text-[13px] font-medium">{formatBRL(l.subtotalCents)}</span>
                  <span className="font-mono text-muted">{offsetLabel(l.offsetS)}</span>
                  <span>
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
        <div className="on-dark anim-pop-c absolute bottom-8 left-1/2 z-30 flex -translate-x-1/2 items-center gap-[14px] rounded-full bg-dark py-2 pl-[22px] pr-2 text-white shadow-[0_16px_40px_rgba(17,18,20,0.25)]" role="region" aria-label="Pedidos selecionados">
          <span className="whitespace-nowrap text-[14px]">
            <strong className="font-medium">{selected.length === 1 ? '1 selecionado' : `${formatInt(selected.length)} selecionados`}</strong>
            <span className="text-dark-muted"> · {formatInt(selUnits)} un.</span>
          </span>
          <button type="button" onClick={() => setSel(new Set())} className="h-10 whitespace-nowrap rounded-full border border-solid border-dark-line bg-transparent px-4 text-[13px] text-white">Limpar seleção</button>
          {p.canExport && (
            <div className="relative">
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
