'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Field } from '@/components/Field';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { PageHeader } from '@/components/admin/PageHeader';
import type { BrandCard } from '@/lib/brands';

const fmt = (n: number) => n.toLocaleString('pt-BR');
const ini = (name: string) => {
  const w = name.trim().split(/\s+/);
  return ((w[0]?.[0] ?? '') + (w[1]?.[0] ?? '')).toUpperCase();
};

export function BrandsView({ brands, canWrite, canCreateLive }: { brands: BrandCard[]; canWrite: boolean; canCreateLive: boolean }) {
  const router = useRouter();
  const { flash, toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', segment: '', ordersEmail: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const max = Math.max(1, ...brands.map((b) => b.units));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return setErrors({ name: 'Informe o nome da marca.' });
    setSaving(true);
    const res = await fetch('/api/admin/brands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return setErrors({ [data.error?.field ?? 'name']: data.error?.message ?? 'Não foi possível salvar.' });
    setOpen(false);
    flash('Marca salva');
    router.refresh();
  }

  return (
    <>
      <PageHeader eyebrow="Clientes da agência" title="Marcas">
        {canWrite && (
          <button type="button" onClick={() => { setForm({ name: '', segment: '', ordersEmail: '' }); setErrors({}); setOpen(true); }} className="flex h-11 items-center gap-[10px] rounded-full border-none bg-ink pl-2 pr-5 text-[14px] font-medium text-white">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-accent text-[18px] leading-none text-ink">+</span>Nova marca
          </button>
        )}
      </PageHeader>

      {brands.length === 0 ? (
        <section className="flex flex-grow items-center justify-center rounded-card bg-surface text-[14px] text-muted">Nenhuma marca cadastrada ainda.</section>
      ) : (
        <div className="grid min-h-0 flex-grow auto-rows-[360px] grid-cols-3 content-start gap-4 overflow-y-auto">
          {brands.map((b, i) => {
            const dark = b.live;
            const tile = dark ? 'bg-dark-2' : 'bg-surface-2';
            return (
              <article key={b.id} style={{ animationDelay: `${i * 40}ms` }} className={`anim-in box-border flex flex-col gap-4 rounded-card p-[22px] ${dark ? 'on-dark bg-dark text-white' : 'bg-surface text-ink'}`}>
                <div className="flex items-center gap-3">
                  <span className={`flex h-[52px] w-[52px] items-center justify-center rounded-2xl text-[16px] font-semibold ${dark ? 'bg-accent text-ink' : 'bg-ink text-white'}`}>{ini(b.name)}</span>
                  <span className="flex min-w-0 flex-grow flex-col gap-[2px]">
                    <span className="truncate text-[18px] font-medium tracking-[-0.02em]">{b.name}</span>
                    <span className="text-[12px] opacity-65">{b.segment || 'Segmento a definir'}</span>
                  </span>
                  {b.live && <span className="rounded-full bg-live px-[9px] py-1 text-[10px] font-semibold tracking-[0.06em] text-white">AO VIVO</span>}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[['Lives', b.lives], ['Produtos', b.products], ['Empresas', b.companies]].map(([l, v]) => (
                    <div key={l} className={`flex flex-col gap-[2px] rounded-[14px] p-3 ${tile}`}>
                      <span className="text-[11px] opacity-65">{l}</span>
                      <span className="text-[20px] font-medium tabular">{fmt(v as number)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-[13px]"><span className="opacity-65">Unidades registradas</span><span className="font-medium tabular">{fmt(b.units)} un.</span></div>
                  <div className={`h-2 overflow-hidden rounded-full ${tile}`}>
                    <div className={`h-2 rounded-full ${dark ? 'bg-accent' : 'bg-ink'}`} style={{ width: `${Math.max(2, Math.round((b.units / max) * 100))}%` }} />
                  </div>
                  <div className="flex justify-between text-[13px]"><span className="opacity-65">Pedidos a faturar</span><span className="font-medium">{b.draftOrders ? `${fmt(b.draftOrders)} ${b.draftOrders === 1 ? 'pedido' : 'pedidos'}` : 'Nenhum'}</span></div>
                </div>
                <div className="flex-grow" />
                <div className="flex gap-2">
                  <Link href={`/admin/pedidos?marca=${b.id}`} className={`flex h-[42px] flex-grow items-center justify-center rounded-full text-[13px] font-medium no-underline ${dark ? 'bg-accent text-ink' : 'bg-ink text-white'}`}>Ver pedidos</Link>
                  {canCreateLive && (
                    <Link href={`/admin/lives/nova?marca=${b.id}`} className={`flex h-[42px] items-center rounded-full border border-solid px-4 text-[13px] no-underline ${dark ? 'border-dark-line text-white' : 'border-line text-ink'}`}>Nova live</Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {open && (
        <Modal labelledBy="nm" onClose={() => setOpen(false)}>
          <form onSubmit={save} noValidate className="flex flex-col gap-[14px]">
            <h2 id="nm" className="text-[22px] font-medium tracking-[-0.02em]">Nova marca</h2>
            <Field id="bn" label="Nome da marca" placeholder="Ex.: Cliente D" value={form.name} error={errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Field id="bs" label="Segmento" placeholder="Ex.: Cosméticos" value={form.segment} error={errors.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} />
            <Field id="be" type="email" label="E-mail para receber os pedidos" placeholder="comercial@marca.com.br" value={form.ordersEmail} error={errors.ordersEmail} onChange={(e) => setForm({ ...form, ordersEmail: e.target.value })} />
            <div className="flex justify-end gap-2 pt-[6px]">
              <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-full border border-solid border-line bg-white px-[18px] text-[14px]">Cancelar</button>
              <button type="submit" disabled={saving} className="h-11 rounded-full border-none bg-ink px-5 text-[14px] font-medium text-white disabled:opacity-70">{saving ? 'Salvando…' : 'Salvar marca'}</button>
            </div>
          </form>
        </Modal>
      )}
      {toast}
    </>
  );
}
