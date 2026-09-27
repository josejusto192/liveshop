'use client';
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/Switch';
import { useToast } from '@/components/Toast';
import { IconClose } from '@/components/icons';
import { IconBack, IconCheckSmall, IconGrip } from '@/components/admin/icons-extra';
import { formatInt } from '@/lib/money';

type Product = { id: string; name: string; available: number; imageUrl: string | null };
type Line = { productId: string; min: number };

export type LiveFormProps = {
  liveId: string | null;
  status: 'draft' | 'scheduled' | 'live' | 'ended' | null;
  slug: string | null;
  appUrl: string;
  brands: { id: string; name: string }[];
  productsByBrand: Record<string, Product[]>;
  initial: {
    name: string;
    brandId: string;
    date: string;
    time: string;
    format: 'horizontal' | 'vertical';
    mode: 'auto' | 'manual';
    videoDelayS: number;
    showTimer: boolean;
    showActivity: boolean;
    lineup: Line[];
  };
};

const mmss = (min: number) => `${String(min).padStart(2, '0')}:00`;

export function LiveForm(p: LiveFormProps) {
  const router = useRouter();
  const { flash, toast } = useToast();
  const [f, setF] = useState(p.initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<null | 'draft' | 'open'>(null);
  const [copied, setCopied] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);

  const running = p.status === 'live';
  const ended = p.status === 'ended';
  const lockedLineup = running || ended;
  const products = useMemo(() => p.productsByBrand[f.brandId] ?? [], [p.productsByBrand, f.brandId]);
  const byId = useMemo(() => new Map(products.map((x) => [x.id, x])), [products]);
  const pool = products.filter((x) => !f.lineup.some((l) => l.productId === x.id));
  const totalMin = f.lineup.reduce((a, l) => a + l.min, 0);
  const inviteUrl = p.slug ? `${p.appUrl.replace(/\/$/, '')}/l/${p.slug}` : null;
  const inviteLabel = inviteUrl ? inviteUrl.replace(/^https?:\/\//, '') : 'O link fica pronto ao salvar';

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((cur) => ({ ...cur, [k]: v }));
  const updLine = (fn: (l: Line[]) => Line[]) => setF((cur) => ({ ...cur, lineup: fn(cur.lineup.map((x) => ({ ...x }))) }));

  function move(from: number, to: number) {
    if (to < 0 || to >= f.lineup.length || from === to) return;
    updLine((l) => {
      const [x] = l.splice(from, 1);
      l.splice(to, 0, x);
      return l;
    });
  }

  function changeBrand(brandId: string) {
    if (brandId === f.brandId) return;
    if (f.lineup.length && !window.confirm('Trocar a marca tira os produtos atuais do roteiro. Continuar?')) return;
    setF((cur) => ({ ...cur, brandId, lineup: [] }));
  }

  async function save(kind: 'draft' | 'open') {
    const errs: Record<string, string> = {};
    if (!f.name.trim()) errs.name = 'Informe o nome da live.';
    if (!f.brandId) errs.brandId = 'Escolha a marca.';
    if (!f.date || !f.time) errs.date = 'Informe data e horário.';
    if (kind === 'open' && !f.lineup.length) errs.items = 'Adicione pelo menos um produto ao roteiro.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(kind);
    const status = kind === 'open' ? 'scheduled' : p.status === 'scheduled' ? 'scheduled' : 'draft';
    const body: Record<string, unknown> = {
      name: f.name,
      brandId: f.brandId,
      date: f.date,
      time: f.time,
      format: f.format,
      mode: f.mode,
      videoDelayS: f.videoDelayS,
      showTimer: f.showTimer,
      showActivity: f.showActivity,
      status,
    };
    if (!lockedLineup) body.items = f.lineup.map((l) => ({ productId: l.productId, durationS: l.min * 60 }));
    const res = await fetch(p.liveId ? `/api/admin/lives/${p.liveId}` : '/api/admin/lives', {
      method: p.liveId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSaving(null);
    if (!res.ok) {
      setErrors(data.error?.fields ?? { form: data.error?.message ?? 'Não foi possível salvar.' });
      flash(data.error?.message ?? 'Não foi possível salvar.');
      return;
    }
    if (kind === 'open') {
      router.push(`/admin/lives/${data.live.id}/central`);
      return;
    }
    flash(p.liveId ? 'Live salva' : 'Rascunho salvo');
    if (!p.liveId) router.replace(`/admin/lives/${data.live.id}/editar`);
    else router.refresh();
  }

  async function copy() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      flash('Não foi possível copiar. Selecione o link e copie manualmente.');
    }
  }

  const fieldCls = (err?: string) =>
    `box-border h-[46px] w-full rounded-xl border-none px-[14px] text-[14px] ${err ? 'bg-danger-bg shadow-[inset_0_0_0_2px_var(--live)]' : 'bg-surface-2'}`;
  const seg = (on: boolean) => `h-9 flex-grow rounded-full border-none text-[13px] font-medium ${on ? 'bg-ink text-white' : 'bg-transparent text-ink-2'}`;

  return (
    <>
      <header className="flex h-[60px] shrink-0 items-center gap-[10px]">
        <Link href="/admin" aria-label="Voltar para a visão geral" className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink">
          <IconBack />
        </Link>
        <div className="flex flex-grow flex-col gap-[2px] pl-[6px]">
          <span className="text-[14px] text-muted">Lives</span>
          <h1 className="text-[30px] font-medium tracking-[-0.03em]">{p.liveId ? 'Editar live' : 'Nova live'}</h1>
        </div>
        {!ended && (
          <button type="button" onClick={() => save('draft')} disabled={!!saving} className="h-11 rounded-full border-none bg-white px-[18px] text-[14px] disabled:opacity-60">
            {saving === 'draft' ? 'Salvando…' : p.status && p.status !== 'draft' ? 'Salvar' : 'Salvar rascunho'}
          </button>
        )}
        {!ended && (
          <button type="button" onClick={() => save('open')} disabled={!!saving} className="flex h-11 items-center gap-[10px] rounded-full border-none bg-ink pl-2 pr-5 text-[14px] font-medium text-white disabled:opacity-70">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-accent text-ink"><IconCheckSmall /></span>
            {saving === 'open' ? 'Salvando…' : 'Salvar e abrir central'}
          </button>
        )}
      </header>

      {errors.form && <p role="alert" className="m-0 rounded-2xl bg-danger-bg px-4 py-3 text-[14px] text-danger">{errors.form}</p>}

      <div className="flex min-h-0 flex-grow gap-4">
        <div className="flex min-w-0 flex-grow flex-col gap-4">
          <section className="box-border flex flex-col gap-[14px] rounded-card bg-surface p-[22px]">
            <h2 className="text-[16px] font-medium">Informações da live</h2>
            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-2 flex flex-col gap-[6px]">
                <label htmlFor="ln" className="text-[12px] text-muted">Nome da live</label>
                <input id="ln" value={f.name} onChange={(e) => set('name', e.target.value)} disabled={ended} aria-invalid={!!errors.name} className={fieldCls(errors.name)} placeholder="Ex.: Lançamento Coleção Verão" />
                {errors.name && <span className="text-[12px] text-danger">{errors.name}</span>}
              </div>
              <div className="col-span-2 flex flex-col gap-[6px]">
                <label htmlFor="lm" className="text-[12px] text-muted">Marca (cliente)</label>
                <select id="lm" value={f.brandId} onChange={(e) => changeBrand(e.target.value)} disabled={running || ended} aria-invalid={!!errors.brandId} className={`${fieldCls(errors.brandId)} px-3`}>
                  {!f.brandId && <option value="">Escolha a marca</option>}
                  {p.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                {errors.brandId && <span className="text-[12px] text-danger">{errors.brandId}</span>}
              </div>
              <div className="flex flex-col gap-[6px]">
                <label htmlFor="ld" className="text-[12px] text-muted">Data</label>
                <input id="ld" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} disabled={running || ended} aria-invalid={!!errors.date} className={`${fieldCls(errors.date)} px-3`} />
              </div>
              <div className="flex flex-col gap-[6px]">
                <label htmlFor="lh" className="text-[12px] text-muted">Início</label>
                <input id="lh" type="time" value={f.time} onChange={(e) => set('time', e.target.value)} disabled={running || ended} aria-invalid={!!errors.date} className={`${fieldCls(errors.date)} px-3`} />
              </div>
              <div className="col-span-2 flex flex-col gap-[6px]">
                <span className="text-[12px] text-muted" id="fmt-label">Formato do vídeo</span>
                <div role="group" aria-labelledby="fmt-label" className="flex gap-2">
                  {(['horizontal', 'vertical'] as const).map((v) => {
                    const on = f.format === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={on}
                        disabled={running || ended}
                        onClick={() => set('format', v)}
                        className={`flex h-[46px] flex-grow items-center justify-center gap-[10px] rounded-xl border-2 border-solid text-[13px] font-medium disabled:opacity-60 ${on ? 'border-ink bg-white' : 'border-transparent bg-surface-2'}`}
                      >
                        {v === 'horizontal' ? (
                          <span className="h-[14px] w-6 rounded-[3px] border-[1.5px] border-solid border-current" />
                        ) : (
                          <span className="h-5 w-3 rounded-[3px] border-[1.5px] border-solid border-current" />
                        )}
                        {v === 'horizontal' ? 'Horizontal 16:9' : 'Vertical 9:16'}
                      </button>
                    );
                  })}
                </div>
              </div>
              {errors.date && <span className="col-span-4 -mt-1 text-[12px] text-danger">{errors.date}</span>}
            </div>
          </section>

          <section className="box-border flex min-h-0 flex-grow flex-col gap-[6px] overflow-hidden rounded-card bg-surface p-[22px]">
            <div className="flex items-center gap-[10px] pb-2">
              <h2 className="flex-grow text-[16px] font-medium">Roteiro de produtos</h2>
              <span className="text-[13px] text-muted">
                {f.lineup.length} {f.lineup.length === 1 ? 'produto' : 'produtos'} · duração total{' '}
                <span className="font-mono text-ink">{Math.floor(totalMin / 60)}h{String(totalMin % 60).padStart(2, '0')}</span>
              </span>
            </div>
            {lockedLineup && (
              <p className="m-0 rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
                {running ? 'A live está no ar: ajuste o roteiro pela Central.' : 'Live encerrada: o roteiro não muda mais.'}
              </p>
            )}
            {errors.items && <p role="alert" className="m-0 text-[13px] text-danger">{errors.items}</p>}
            <ol className="m-0 min-h-0 flex-grow list-none overflow-y-auto p-0" aria-label="Roteiro">
              {f.lineup.length === 0 && (
                <li className="border-t border-solid border-line-2 py-8 text-center text-[14px] text-muted">
                  {f.brandId ? 'Nenhum produto no roteiro. Adicione abaixo.' : 'Escolha a marca para montar o roteiro.'}
                </li>
              )}
              {f.lineup.map((l, i) => {
                const prod = byId.get(l.productId);
                return (
                  <li
                    key={l.productId}
                    draggable={!lockedLineup}
                    onDragStart={(e) => {
                      setDragIdx(i);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(i));
                    }}
                    onDragOver={(e) => {
                      if (dragIdx === null) return;
                      e.preventDefault();
                      setOverIdx(i);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIdx !== null) move(dragIdx, i);
                      setDragIdx(null);
                      setOverIdx(null);
                    }}
                    onDragEnd={() => {
                      setDragIdx(null);
                      setOverIdx(null);
                    }}
                    className={`flex h-[54px] items-center gap-3 border-t border-solid ${overIdx === i && dragIdx !== null && dragIdx !== i ? 'border-ink' : 'border-line-2'} ${dragIdx === i ? 'opacity-50' : ''}`}
                  >
                    {!lockedLineup && (
                      <button
                        ref={(el) => {
                          rows.current[i] = el;
                        }}
                        type="button"
                        aria-label={`Mover ${prod?.name ?? 'produto'} (use as setas para cima e para baixo)`}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                            e.preventDefault();
                            const to = e.key === 'ArrowUp' ? i - 1 : i + 1;
                            move(i, to);
                            requestAnimationFrame(() => rows.current[Math.max(0, Math.min(f.lineup.length - 1, to))]?.focus());
                          }
                        }}
                        className="flex h-8 w-6 cursor-grab items-center justify-center rounded-md border-none bg-transparent text-muted active:cursor-grabbing"
                      >
                        <IconGrip />
                      </button>
                    )}
                    <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-line-2 text-[12px] font-medium">{i + 1}</span>
                    {prod?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={prod.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded-[10px] object-cover" />
                    ) : (
                      <span className="h-9 w-9 shrink-0 rounded-[10px] bg-line-2" />
                    )}
                    <span className="flex min-w-0 flex-grow flex-col">
                      <span className="truncate text-[14px] font-medium">{prod?.name ?? 'Produto'}</span>
                      <span className="text-[12px] text-muted">Estoque {formatInt(Math.max(0, prod?.available ?? 0))} un.</span>
                    </span>
                    <div className="flex items-center gap-1 rounded-full bg-surface-2 p-1">
                      <button type="button" disabled={lockedLineup || l.min <= 5} onClick={() => updLine((x) => ((x[i].min = Math.max(5, x[i].min - 5)), x))} aria-label="Diminuir 5 minutos" className="h-[30px] w-[30px] rounded-full border-none bg-white text-[16px] disabled:opacity-40">−</button>
                      <span className="w-16 text-center font-mono text-[13px]" aria-label={`${l.min} minutos`}>{mmss(l.min)}</span>
                      <button type="button" disabled={lockedLineup || l.min >= 60} onClick={() => updLine((x) => ((x[i].min = Math.min(60, x[i].min + 5)), x))} aria-label="Aumentar 5 minutos" className="h-[30px] w-[30px] rounded-full border-none bg-white text-[16px] disabled:opacity-40">+</button>
                    </div>
                    {!lockedLineup && (
                      <button type="button" onClick={() => updLine((x) => x.filter((_, k) => k !== i))} aria-label={`Remover ${prod?.name ?? 'produto'} do roteiro`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-solid border-line bg-white text-ink">
                        <IconClose size={12} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
            {!lockedLineup && (
              <div className="flex flex-wrap gap-2 border-t border-solid border-line-2 pt-3">
                <span className="mr-1 self-center text-[12px] text-muted">Adicionar:</span>
                {pool.length === 0 && <span className="self-center text-[12px] text-muted">{products.length ? 'Todos os produtos da marca já estão no roteiro.' : 'Esta marca ainda não tem produtos.'}</span>}
                {pool.map((o) => (
                  <button key={o.id} type="button" onClick={() => updLine((x) => [...x, { productId: o.id, min: 15 }])} className="h-[34px] rounded-full border border-dashed border-[#C9CCD2] bg-white px-[14px] text-[13px]">
                    + {o.name}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="flex w-[360px] shrink-0 flex-col gap-4">
          <section className="box-border flex flex-col gap-4 rounded-card bg-surface p-[22px]">
            <h2 className="text-[16px] font-medium">Troca de produtos</h2>
            <div role="group" aria-label="Modo padrão" className="flex rounded-full bg-surface-2 p-1">
              <button type="button" aria-pressed={f.mode === 'auto'} disabled={ended} onClick={() => set('mode', 'auto')} className={seg(f.mode === 'auto')}>Automática pelo tempo</button>
              <button type="button" aria-pressed={f.mode === 'manual'} disabled={ended} onClick={() => set('mode', 'manual')} className={seg(f.mode === 'manual')}>Manual</button>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-[13px]">
                <label htmlFor="delay">Atraso do vídeo</label>
                <span className="font-mono">{f.videoDelayS} s</span>
              </div>
              <input id="delay" type="range" min={0} max={15} value={f.videoDelayS} disabled={ended} onChange={(e) => set('videoDelayS', Number(e.target.value))} className="w-full accent-ink" />
              <span className="text-[12px] leading-[1.4] text-muted">O produto troca na tela do comprador junto com o vídeo, compensando o atraso da transmissão.</span>
            </div>
            {[
              ['showTimer', 'Mostrar timer para o comprador', 'Cria senso de urgência em cada produto'],
              ['showActivity', 'Mostrar atividade de pedidos', 'Ex.: "Uma empresa de Sorocaba pediu 500 un.", sem nome'],
            ].map(([k, label, hint]) => (
              <div key={k} className="flex items-center gap-3">
                <span className="flex flex-grow flex-col gap-[2px]">
                  <span className="text-[14px]">{label}</span>
                  <span className="text-[12px] text-muted">{hint}</span>
                </span>
                <Switch label={label} disabled={ended} checked={f[k as 'showTimer' | 'showActivity']} onChange={(v) => set(k as 'showTimer' | 'showActivity', v)} />
              </div>
            ))}
          </section>

          <section className="on-dark box-border flex flex-grow flex-col gap-3 rounded-card bg-dark p-[22px] text-white">
            <h2 className="text-[16px] font-medium">Acesso dos compradores</h2>
            <span className="text-[13px] leading-[1.45] text-dark-muted">Envie este link para as empresas. Elas se cadastram e confirmam o código por e-mail.</span>
            <div className="flex h-[46px] items-center gap-[6px] rounded-xl bg-dark-3 pl-[14px] pr-[6px]">
              <code className="min-w-0 flex-grow truncate font-mono text-[12px] text-[#D5D8DE]">{inviteLabel}</code>
              <button type="button" onClick={copy} disabled={!inviteUrl} className="h-[34px] rounded-full border-none bg-accent px-[14px] text-[12px] font-medium text-ink disabled:opacity-50">
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            {p.status === 'draft' && inviteUrl && <span className="text-[12px] text-dark-muted">O link passa a funcionar quando a live for agendada (Salvar e abrir central).</span>}
            <div className="flex-grow" />
            {inviteUrl && (
              <a href={inviteUrl} target="_blank" rel="noreferrer" className="text-[13px] text-accent">
                Ver a tela que o comprador recebe
              </a>
            )}
          </section>
        </aside>
      </div>
      {toast}
    </>
  );
}
