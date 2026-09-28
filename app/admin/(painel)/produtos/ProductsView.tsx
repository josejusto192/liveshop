'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fieldCls } from '@/components/Field';
import { IconClose, IconSearch } from '@/components/icons';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { PageHeader } from '@/components/admin/PageHeader';
import { formatBRL, formatInt, parseBRL, parseIntBR } from '@/lib/money';
import type { ImportReport, ProductRow } from '@/lib/products';

type Kind = 'all' | 'in' | 'low' | 'out';
const FILTERS: [Kind, string][] = [['all', 'Todos'], ['in', 'Em estoque'], ['low', 'Estoque baixo'], ['out', 'Esgotados']];

function kindOf(p: ProductRow): Exclude<Kind, 'all'> {
  if (p.available <= 0) return 'out';
  return p.available / p.stockTotal < 0.1 ? 'low' : 'in';
}

type Form = { id: string | null; name: string; sku: string; price: string; stock: string; min: string; description: string; imageUrl: string | null; blockOverStock: boolean };
const EMPTY: Form = { id: null, name: '', sku: '', price: '', stock: '', min: '10', description: '', imageUrl: null, blockOverStock: true };

export function ProductsView({ brands, brand, products, inToday }: { brands: { id: string; name: string }[]; brand: { id: string; name: string } | null; products: ProductRow[]; inToday: number }) {
  const router = useRouter();
  const { flash, toast } = useToast();
  const [filter, setFilter] = useState<Kind>('all');
  const [q, setQ] = useState('');
  const [panel, setPanel] = useState(true);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const sheetInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  // No celular o painel do produto abre em tela cheia só quando pedido.
  useEffect(() => {
    if (window.matchMedia('(max-width: 1023px)').matches) setPanel(false);
  }, []);

  const kpi = useMemo(() => {
    const available = products.reduce((s, p) => s + Math.max(0, p.available), 0);
    const total = products.reduce((s, p) => s + p.stockTotal, 0);
    const out = products.filter((p) => kindOf(p) === 'out').length;
    const low = products.filter((p) => kindOf(p) === 'low').length;
    return { available, reservedPct: total ? Math.round(((total - available) / total) * 100) : 0, out, low };
  }, [products]);

  const rows = products.filter((p) => {
    if (filter !== 'all' && kindOf(p) !== filter) return false;
    const s = q.trim().toLowerCase();
    return !s || p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s);
  });

  function openNew() {
    setForm(EMPTY);
    setErrors({});
    setPanel(true);
  }
  function openEdit(p: ProductRow) {
    setForm({ id: p.id, name: p.name, sku: p.sku, price: formatBRL(p.priceCents), stock: formatInt(p.stockTotal), min: String(p.minQty), description: p.description ?? '', imageUrl: p.imageUrl, blockOverStock: p.blockOverStock });
    setErrors({});
    setPanel(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!brand) return;
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Informe o nome.';
    if (!form.sku.trim()) errs.sku = 'Informe o SKU.';
    if (parseBRL(form.price) === null) errs.priceCents = 'Preço inválido.';
    if (parseIntBR(form.stock) === null) errs.stockTotal = 'Número inteiro.';
    const min = parseIntBR(form.min);
    if (min === null || min < 1) errs.minQty = 'Mínimo 1.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    const body = { brandId: brand.id, name: form.name, sku: form.sku, price: form.price, stockTotal: form.stock, minQty: form.min, description: form.description, imageUrl: form.imageUrl ?? '', blockOverStock: form.blockOverStock };
    const res = await fetch(form.id ? `/api/admin/products/${form.id}` : '/api/admin/products', { method: form.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setErrors(data.error?.fields ?? { form: data.error?.message ?? 'Não foi possível salvar.' });
      return;
    }
    setPanel(false);
    flash(form.id ? 'Produto atualizado' : 'Produto salvo e disponível para as lives');
    router.refresh();
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/admin/uploads', { method: 'POST', body: fd });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) return flash(data.error?.message ?? 'Não foi possível enviar a foto.');
    setForm((f) => ({ ...f, imageUrl: data.url }));
  }

  async function importSheet(file: File) {
    if (!brand) return;
    setImporting(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('brandId', brand.id);
    const res = await fetch('/api/admin/products/import', { method: 'POST', body: fd });
    const data = await res.json();
    setImporting(false);
    if (!res.ok) return flash(data.error?.message ?? 'Não foi possível importar.');
    setReport(data.report);
    router.refresh();
  }

  const label = (id: string, text: string) => <label htmlFor={id} className="text-[12px] text-muted">{text}</label>;
  const err = (k: string) => errors[k] && <span id={`${k}-err`} className="text-[12px] text-danger">{errors[k]}</span>;

  return (
    <div className="flex min-h-0 flex-grow flex-col gap-4 lg:flex-row">
      <div className="flex min-w-0 flex-grow flex-col gap-4">
        <PageHeader
          title="Produtos e estoque"
          eyebrow={
            brands.length > 1 ? (
              <label className="inline-flex items-center gap-1">
                Catálogo ·
                <select aria-label="Marca do catálogo" value={brand?.id} onChange={(e) => router.push(`/admin/produtos?marca=${e.target.value}`)} className="cursor-pointer rounded-md border-none bg-transparent p-0 text-[14px] text-muted hover:text-ink">
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
            ) : (
              `Catálogo · ${brand?.name ?? 'sem marca'}`
            )
          }
        >
          <input ref={sheetInput} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importSheet(f); }} />
          <button type="button" disabled={!brand || importing} onClick={() => sheetInput.current?.click()} title="Planilha .xlsx ou .csv com nome, SKU, preço e estoque" className="h-11 rounded-full border-none bg-white px-[18px] text-[14px] disabled:opacity-60">
            {importing ? 'Importando…' : 'Importar planilha'}
          </button>
          {!panel && brand && (
            <button type="button" onClick={openNew} className="flex h-11 items-center gap-[10px] rounded-full border-none bg-ink pl-2 pr-5 text-[14px] font-medium text-white">
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-accent text-[18px] leading-none text-ink">+</span>Novo produto
            </button>
          )}
        </PageHeader>

        <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4 lg:h-[118px]">
          <div className="box-border flex flex-col gap-[6px] rounded-card bg-surface px-5 py-[18px]">
            <span className="text-[13px] text-muted">Produtos cadastrados</span>
            <span className="text-[32px] font-medium tracking-[-0.04em] tabular">{formatInt(products.length)}</span>
            <span className="text-[12px] text-muted">{inToday ? `${inToday} no roteiro da live de hoje` : 'Nenhum no roteiro de hoje'}</span>
          </div>
          <div className="box-border flex flex-col gap-[6px] rounded-card bg-surface px-5 py-[18px]">
            <span className="text-[13px] text-muted">Estoque disponível</span>
            <span className="text-[32px] font-medium tracking-[-0.04em] tabular">{formatInt(kpi.available)} <span className="text-[15px] tracking-normal text-muted">un.</span></span>
            <div className="flex h-[6px] gap-[3px]" aria-hidden>
              <span className="rounded-full bg-ink" style={{ width: `${kpi.reservedPct}%` }} />
              <span className="flex-grow rounded-full bg-accent" />
            </div>
          </div>
          <div className="on-dark box-border flex flex-col gap-[6px] rounded-card bg-dark px-5 py-[18px] text-white">
            <span className="text-[13px] text-dark-muted">Atenção no estoque</span>
            <span className="text-[32px] font-medium tracking-[-0.04em] tabular">{kpi.out + kpi.low} <span className="text-[15px] tracking-normal text-dark-muted">{kpi.out + kpi.low === 1 ? 'produto' : 'produtos'}</span></span>
            <span className="text-[12px] text-accent">{kpi.out} {kpi.out === 1 ? 'esgotado' : 'esgotados'} · {kpi.low} abaixo de 10%</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-[10px]">
          <div role="group" aria-label="Filtro de estoque" className="flex max-w-full overflow-x-auto rounded-full bg-white p-1">
            {FILTERS.map(([k, l]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`h-[34px] shrink-0 whitespace-nowrap rounded-full border-none px-4 text-[13px] font-medium ${filter === k ? 'bg-ink text-white' : 'bg-transparent text-ink-2'}`}>{l}</button>
            ))}
          </div>
          <div className="flex-grow" />
          <label className="box-border flex h-[42px] w-full items-center gap-2 rounded-full bg-white px-4 sm:w-[240px] text-muted focus-within:shadow-[0_0_0_2px_var(--ink)]">
            <IconSearch />
            <input aria-label="Buscar produto" placeholder="Nome ou SKU" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-0 flex-grow border-none bg-transparent text-[14px] text-ink outline-none focus-visible:shadow-none" />
          </label>
        </div>

        <div key={filter} className="anim-swap box-border flex min-h-[200px] flex-grow flex-col rounded-card bg-surface px-4 py-1 lg:min-h-0 lg:px-[22px]">
          <div className="hidden h-[42px] shrink-0 lg:grid grid-cols-[2.6fr_1fr_1.8fr_1fr] items-center gap-[14px] text-[12px] text-muted" role="row">
            <span>Produto</span><span>Preço atacado</span><span>Estoque (pedido / disponível)</span><span className="text-right">Disponível</span>
          </div>
          <div className="min-h-0 flex-grow overflow-y-auto">
            {rows.length === 0 && (
              <p className="m-0 border-t border-solid border-line-2 py-10 text-center text-[14px] text-muted">
                {products.length === 0 ? 'Nenhum produto cadastrado nesta marca. Cadastre ou importe uma planilha.' : 'Nenhum produto neste filtro.'}
              </p>
            )}
            {rows.map((p) => {
              const k = kindOf(p);
              const pct = p.stockTotal ? p.reserved / p.stockTotal : 1;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openEdit(p)}
                  aria-label={`Editar ${p.name}`}
                  className={`flex w-full flex-wrap items-center gap-x-[14px] gap-y-2 border-x-0 border-b-0 border-t border-solid border-line-2 bg-transparent px-0 py-3 first:border-t-0 lg:grid lg:h-16 lg:grid-cols-[2.6fr_1fr_1.8fr_1fr] lg:py-0 lg:first:border-t text-left text-[14px] text-ink hover:bg-[#FAFAFB] ${form.id === p.id && panel ? 'bg-[#FAFAFB]' : ''}`}
                >
                  <span className="flex min-w-0 basis-full items-center gap-3 lg:basis-auto">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="h-[42px] w-[42px] shrink-0 rounded-xl object-cover" />
                    ) : (
                      <span className="h-[42px] w-[42px] shrink-0 rounded-xl bg-line-2" />
                    )}
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{p.name}</span>
                      <span className="font-mono text-[12px] text-muted">{p.sku}</span>
                    </span>
                  </span>
                  <span className="font-medium tabular">{formatBRL(p.priceCents)}</span>
                  <span className="flex min-w-[120px] flex-grow flex-col gap-[6px] pr-2 lg:flex-grow-0">
                    <span className="flex h-2 gap-[3px]" aria-hidden>
                      <span className="rounded-full bg-ink" style={{ width: `${Math.max(Math.round(pct * 100), 1)}%` }} />
                      <span className={`flex-grow rounded-full ${k === 'out' ? 'bg-line-2' : k === 'low' ? 'bg-[#F5B97A]' : 'bg-accent'}`} />
                    </span>
                    <span className="font-mono text-[12px] text-muted">{formatInt(p.reserved)} / {formatInt(p.stockTotal)}</span>
                  </span>
                  <span className="flex justify-end">
                    <span className={`rounded-full px-[10px] py-1 text-[12px] font-medium ${k === 'out' ? 'bg-danger-bg text-danger' : k === 'low' ? 'bg-warn-bg text-warn' : 'bg-ok-bg text-ok'}`}>
                      {k === 'out' ? 'Esgotado' : `${formatInt(p.available)} un.`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {panel && brand && (
        <aside key={form.id ?? 'novo'} aria-label={form.id ? 'Editar produto' : 'Novo produto'} className="anim-panel box-border flex flex-col overflow-y-auto bg-surface p-[22px] max-lg:fixed max-lg:inset-0 max-lg:z-50 lg:w-[340px] lg:shrink-0 lg:rounded-card">
          <form onSubmit={save} noValidate className="flex flex-grow flex-col gap-[14px]">
            <div className="flex items-center justify-between">
              <h2 className="text-[20px] font-medium tracking-[-0.02em]">{form.id ? 'Editar produto' : 'Novo produto'}</h2>
              <button type="button" onClick={() => setPanel(false)} aria-label="Fechar" className="flex h-9 w-9 items-center justify-center rounded-full border border-solid border-line bg-white text-ink"><IconClose /></button>
            </div>
            <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadPhoto(f); }} />
            <button
              type="button"
              onClick={() => photoInput.current?.click()}
              className={`relative flex h-[110px] shrink-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-none text-[13px] text-muted ${form.imageUrl ? 'bg-surface-2' : 'stripes'}`}
            >
              {form.imageUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.imageUrl} alt="Foto do produto" className="absolute inset-0 h-full w-full object-cover" />
                  <span className="relative rounded-full bg-white/90 px-3 py-1 text-[12px] text-ink">Trocar foto</span>
                </>
              ) : (
                <>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[18px] text-ink">+</span>
                  {uploading ? 'Enviando…' : 'Enviar foto do produto'}
                </>
              )}
            </button>
            <div className="flex flex-col gap-[6px]">
              {label('pn', 'Nome')}
              <input id="pn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'name-err' : undefined} className={fieldCls(errors.name, 'h-11 rounded-xl')} />
              {err('name')}
            </div>
            <div className="grid grid-cols-2 gap-[10px]">
              <div className="flex flex-col gap-[6px]">
                {label('ps', 'SKU')}
                <input id="ps" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })} aria-invalid={!!errors.sku} aria-describedby={errors.sku ? 'sku-err' : undefined} className={fieldCls(errors.sku, 'h-11 font-mono')} />
                {err('sku')}
              </div>
              <div className="flex flex-col gap-[6px]">
                {label('pp', 'Preço atacado')}
                <input id="pp" inputMode="decimal" placeholder="R$ 0,00" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} onBlur={() => { const c = parseBRL(form.price); if (c !== null) setForm((f) => ({ ...f, price: formatBRL(c) })); }} aria-invalid={!!errors.priceCents} aria-describedby={errors.priceCents ? 'priceCents-err' : undefined} className={fieldCls(errors.priceCents, 'h-11')} />
                {err('priceCents')}
              </div>
              <div className="flex flex-col gap-[6px]">
                {label('pe', 'Estoque (un.)')}
                <input id="pe" inputMode="numeric" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} onBlur={() => { const n = parseIntBR(form.stock); if (n !== null) setForm((f) => ({ ...f, stock: formatInt(n) })); }} aria-invalid={!!errors.stockTotal} aria-describedby={errors.stockTotal ? 'stockTotal-err' : undefined} className={fieldCls(errors.stockTotal, 'h-11')} />
                {err('stockTotal')}
              </div>
              <div className="flex flex-col gap-[6px]">
                {label('pmin', 'Pedido mínimo')}
                <input id="pmin" inputMode="numeric" value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} aria-invalid={!!errors.minQty} aria-describedby={errors.minQty ? 'minQty-err' : undefined} className={fieldCls(errors.minQty, 'h-11')} />
                {err('minQty')}
              </div>
            </div>
            <div className="flex flex-col gap-[6px]">
              {label('pd', 'Descrição curta')}
              <textarea id="pd" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="resize-none rounded-xl border-none bg-surface-2 px-[14px] py-3 text-[14px]" />
            </div>
            <label className="flex items-center justify-between gap-3 text-[14px]">
              Bloquear pedidos acima do estoque
              <input type="checkbox" role="switch" checked={form.blockOverStock} onChange={(e) => setForm({ ...form, blockOverStock: e.target.checked })} className="peer sr-only" />
              <span aria-hidden className={`relative h-6 w-[42px] shrink-0 rounded-full peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink ${form.blockOverStock ? 'bg-ink' : 'bg-line'}`}>
                <span className={`absolute top-[3px] h-[18px] w-[18px] rounded-full transition-all ${form.blockOverStock ? 'right-[3px] bg-accent' : 'left-[3px] bg-white'}`} />
              </span>
            </label>
            {errors.form && <p role="alert" className="m-0 text-[13px] text-danger">{errors.form}</p>}
            <div className="flex-grow" />
            <button type="submit" disabled={saving} className="h-[50px] shrink-0 rounded-full border-none bg-ink text-[15px] font-medium text-white disabled:opacity-70">{saving ? 'Salvando…' : 'Salvar produto'}</button>
          </form>
        </aside>
      )}

      {report && (
        <Modal labelledBy="imp" onClose={() => setReport(null)} width={520}>
          <h2 id="imp" className="text-[22px] font-medium tracking-[-0.02em]">Importação concluída</h2>
          <p className="m-0 text-[14px] text-ink-2">
            {formatInt(report.created)} {report.created === 1 ? 'produto criado' : 'produtos criados'} · {formatInt(report.updated)} {report.updated === 1 ? 'atualizado' : 'atualizados'}
            {report.errors.length > 0 && <> · <span className="text-danger">{formatInt(report.errors.length)} {report.errors.length === 1 ? 'linha com erro' : 'linhas com erro'}</span></>}
          </p>
          {report.errors.length > 0 && (
            <ul className="m-0 max-h-[280px] list-none overflow-y-auto rounded-2xl bg-surface-2 p-0">
              {report.errors.map((e) => (
                <li key={`${e.line}-${e.message}`} className="flex gap-3 border-b border-solid border-line px-4 py-[10px] text-[13px] last:border-b-0">
                  <span className="shrink-0 font-mono text-muted">Linha {e.line}</span>
                  <span>{e.message}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="m-0 text-[12px] text-muted">Colunas aceitas: nome, SKU, preço, estoque, pedido mínimo, múltiplo, descrição. SKU já cadastrado atualiza o produto.</p>
          <div className="flex justify-end">
            <button type="button" onClick={() => setReport(null)} className="h-11 rounded-full border-none bg-ink px-5 text-[14px] font-medium text-white">Fechar</button>
          </div>
        </Modal>
      )}
      {toast}
    </div>
  );
}
