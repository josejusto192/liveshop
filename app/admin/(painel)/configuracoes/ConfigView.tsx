'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Field, fieldCls } from '@/components/Field';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { PageHeader } from '@/components/admin/PageHeader';
import { CameraTest } from '@/components/admin/CameraTest';
import { formatInt } from '@/lib/money';
import { ROLE_LABEL } from '@/lib/permissions';
import type { AdminRole, Settings } from '@/lib/db/schema';

export type Tab = 'geral' | 'transmissao' | 'email' | 'equipe';
const TABS: [Tab, string][] = [['geral', 'Geral'], ['transmissao', 'Transmissão'], ['email', 'E-mail'], ['equipe', 'Equipe']];
type Member = { id: string; name: string; email: string; role: AdminRole };

const ini = (name: string) => {
  const w = name.trim().split(/\s+/);
  return ((w[0]?.[0] ?? '') + (w[1]?.[0] ?? '')).toUpperCase();
};

const selectCls = 'h-[46px] rounded-xl border-none bg-surface-2 px-3 text-[14px]';

export function ConfigView(p: { initialTab: Tab; settings: Settings; env: { domain: string; whip: string; hls: string }; team: Member[]; meId: string; usage: { emails: number; liveHours: number } }) {
  const router = useRouter();
  const { flash, toast } = useToast();
  const [tab, setTab] = useState<Tab>(p.initialTab);
  const [s, setS] = useState({
    platformName: p.settings.platformName,
    accentColor: p.settings.accentColor,
    logoUrl: p.settings.logoUrl ?? '',
    defaultVideoDelayS: p.settings.defaultVideoDelayS,
    otpTtlMin: p.settings.otpTtlMin,
    mailFromName: p.settings.mailFromName ?? '',
    mailFromEmail: p.settings.mailFromEmail ?? '',
    mailSubject: p.settings.mailSubject ?? 'Seu código para entrar na live: {código}',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [camTest, setCamTest] = useState(false);
  const [invite, setInvite] = useState<{ name: string; email: string; role: AdminRole } | null>(null);
  const [inviteErr, setInviteErr] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<Member | null>(null);

  function pick(t: Tab) {
    setTab(t);
    window.history.replaceState(null, '', `?aba=${t}`);
  }

  async function save() {
    setSaving(true);
    const res = await fetch('/api/admin/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setErrors(data.error?.fields ?? {});
      flash(data.error?.message ?? 'Não foi possível salvar.');
      return;
    }
    setErrors({});
    flash('Configurações salvas');
    router.refresh();
  }

  async function uploadLogo(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/admin/uploads', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) return flash(data.error?.message ?? 'Não foi possível enviar a imagem.');
    setS((v) => ({ ...v, logoUrl: data.url }));
  }

  async function sendTest() {
    const res = await fetch('/api/admin/settings/test-email', { method: 'POST' });
    const data = await res.json();
    flash(res.ok ? `E-mail de teste enviado para ${data.to}` : data.error?.message);
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!invite) return;
    const res = await fetch('/api/admin/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(invite) });
    const data = await res.json();
    if (!res.ok) return setInviteErr(data.error?.fields ?? { name: data.error?.message });
    setInvite(null);
    flash('Convite enviado por e-mail');
    router.refresh();
  }

  async function remove(m: Member) {
    const res = await fetch(`/api/admin/team/${m.id}`, { method: 'DELETE' });
    const data = await res.json();
    setRemoving(null);
    flash(res.ok ? `${m.name} saiu da equipe` : data.error?.message);
    if (res.ok) router.refresh();
  }

  const accentOk = /^#[0-9A-Fa-f]{6}$/.test(s.accentColor);

  return (
    <>
      <PageHeader eyebrow="Conta da agência" title="Configurações">
        {tab !== 'equipe' && (
          <button type="button" onClick={save} disabled={saving} className="h-11 rounded-full border-none bg-ink px-5 text-[14px] font-medium text-white disabled:opacity-70">{saving ? 'Salvando…' : 'Salvar alterações'}</button>
        )}
      </PageHeader>

      <div role="tablist" aria-label="Seções" className="flex max-w-full shrink-0 self-start overflow-x-auto rounded-full bg-white p-1">
        {TABS.map(([k, l]) => (
          <button key={k} id={`tab-${k}`} role="tab" type="button" aria-selected={tab === k} aria-controls="tab-panel" onClick={() => pick(k)} className={`h-9 shrink-0 whitespace-nowrap rounded-full border-none px-[18px] text-[13px] font-medium ${tab === k ? 'bg-ink text-white' : 'bg-transparent text-ink-2'}`}>{l}</button>
        ))}
      </div>

      <div className="flex min-h-0 flex-grow flex-col gap-4 lg:flex-row">
        <section key={tab} id="tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="anim-swap box-border flex min-w-0 flex-grow flex-col gap-[18px] overflow-y-auto rounded-card bg-surface p-4 sm:p-[26px]">
          {tab === 'geral' && (
            <>
              <h2 className="text-[18px] font-medium tracking-[-0.02em]">Identidade da plataforma</h2>
              <div className="flex items-center gap-4">
                {s.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.logoUrl} alt="Logo" className="h-[72px] w-[72px] rounded-[20px] object-cover" />
                ) : (
                  <span className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px]" style={{ background: accentOk ? s.accentColor : undefined }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="#111214" aria-hidden><path d="M7 4l13 8-13 8z" /></svg>
                  </span>
                )}
                <div className="flex flex-col gap-[6px]">
                  <span className="text-[14px] font-medium">Logo</span>
                  <label className="h-9 cursor-pointer self-start rounded-full border border-solid border-line bg-white px-[14px] text-[13px] leading-[34px] focus-within:shadow-[0_0_0_2px_var(--ink)]">
                    Trocar imagem
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadLogo(f); }} />
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
                <Field id="g1" label="Nome da plataforma" value={s.platformName} error={errors.platformName} onChange={(e) => setS({ ...s, platformName: e.target.value })} />
                <Field id="g2" label="Domínio" value={p.env.domain} readOnly title="Definido na variável APP_URL do servidor" className="[&_input]:font-mono" />
                <div className="flex flex-col gap-[6px]">
                  <label htmlFor="g3" className="text-[12px] text-muted">Cor de destaque</label>
                  <div className={`flex h-[46px] items-center gap-2 rounded-xl px-[14px] focus-within:shadow-[0_0_0_2px_var(--ink)] ${errors.accentColor ? 'bg-danger-bg' : 'bg-surface-2'}`}>
                    <span className="h-[22px] w-[22px] shrink-0 rounded-full border border-solid border-line" style={{ background: accentOk ? s.accentColor : 'transparent' }} />
                    <input id="g3" value={s.accentColor} onChange={(e) => setS({ ...s, accentColor: e.target.value })} aria-invalid={!!errors.accentColor} className="min-w-0 flex-grow border-none bg-transparent font-mono text-[14px] outline-none focus-visible:shadow-none" />
                  </div>
                  {errors.accentColor && <span className="text-[12px] text-danger">{errors.accentColor}</span>}
                </div>
                <div className="flex flex-col gap-[6px]">
                  <label htmlFor="g4" className="text-[12px] text-muted">Fuso horário</label>
                  <select id="g4" className={selectCls} defaultValue="America/Sao_Paulo">
                    <option value="America/Sao_Paulo">Brasília (GMT-3)</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {tab === 'transmissao' && (
            <>
              <h2 className="text-[18px] font-medium tracking-[-0.02em]">Transmissão</h2>
              <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
                <Field id="t1" label="Servidor de vídeo (WebRTC)" value={p.env.whip} readOnly title="Definido na variável WHIP_BASE_URL do servidor" className="[&_input]:font-mono [&_input]:text-[13px]" />
                <Field id="t2" label="URL de entrega (CDN)" value={p.env.hls} readOnly title="Definido na variável HLS_BASE_URL do servidor" className="[&_input]:font-mono [&_input]:text-[13px]" />
                <div className="flex flex-col gap-[6px]">
                  <label htmlFor="t3" className="text-[12px] text-muted">Qualidade</label>
                  {/* simplificação: uma qualidade só, sem ABR, adicionar transcodificação quando houver público com internet ruim */}
                  <select id="t3" className={selectCls} defaultValue="720">
                    <option value="720">720p · 2,5 Mbps</option>
                  </select>
                </div>
                <div className="flex flex-col gap-[6px]">
                  <label htmlFor="t4" className="text-[12px] text-muted">Atraso padrão do vídeo</label>
                  <select id="t4" className={selectCls} value={s.defaultVideoDelayS} onChange={(e) => setS({ ...s, defaultVideoDelayS: Number(e.target.value) })}>
                    {Array.from({ length: 16 }, (_, i) => <option key={i} value={i}>{i} {i === 1 ? 'segundo' : 'segundos'}</option>)}
                  </select>
                </div>
              </div>
              <p className="m-0 text-[12px] text-muted">Servidor e URL de entrega vêm da configuração do servidor (variáveis de ambiente).</p>
              <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-[14px]">
                <span className="flex-grow text-[14px]">A transmissão sai do navegador (celular ou computador), na tela Transmitir da live.</span>
                <button type="button" onClick={() => setCamTest(true)} className="h-9 rounded-full border-none bg-ink px-[14px] text-[13px] text-white">Testar câmera</button>
              </div>
            </>
          )}

          {tab === 'email' && (
            <>
              <h2 className="text-[18px] font-medium tracking-[-0.02em]">E-mail do código de acesso</h2>
              <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
                <Field id="m1" label="Nome do remetente" value={s.mailFromName} placeholder={s.platformName} onChange={(e) => setS({ ...s, mailFromName: e.target.value })} />
                <Field id="m2" type="email" label="E-mail do remetente" value={s.mailFromEmail} placeholder="acesso@[dominio].com.br" error={errors.mailFromEmail} onChange={(e) => setS({ ...s, mailFromEmail: e.target.value })} />
              </div>
              <Field id="m3" label="Assunto" value={s.mailSubject} onChange={(e) => setS({ ...s, mailSubject: e.target.value })} />
              <div className="flex flex-col gap-[6px]">
                <label htmlFor="m4" className="text-[12px] text-muted">Validade do código</label>
                <select id="m4" className={`${selectCls} w-[240px]`} value={s.otpTtlMin} onChange={(e) => setS({ ...s, otpTtlMin: Number(e.target.value) })}>
                  <option value={10}>10 minutos</option>
                  <option value={30}>30 minutos</option>
                </select>
              </div>
              <button type="button" onClick={sendTest} className="h-10 self-start rounded-full border border-solid border-line bg-white px-4 text-[13px]">Enviar e-mail de teste</button>
            </>
          )}

          {tab === 'equipe' && (
            <>
              <div className="flex items-center">
                <h2 className="flex-grow text-[18px] font-medium tracking-[-0.02em]">Equipe</h2>
                <button type="button" onClick={() => { setInvite({ name: '', email: '', role: 'operator' }); setInviteErr({}); }} className="h-[38px] rounded-full border-none bg-ink px-4 text-[13px] text-white">+ Convidar pessoa</button>
              </div>
              <ul className="m-0 list-none p-0">
                {p.team.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 border-t border-solid border-line-2 py-3">
                    <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-line-2 text-[12px] font-semibold">{ini(m.name)}</span>
                    <span className="flex min-w-0 flex-grow flex-col">
                      <span className="text-[14px] font-medium">{m.name}{m.id === p.meId && <span className="font-normal text-muted"> (você)</span>}</span>
                      <span className="text-[12px] text-muted">{m.email}</span>
                    </span>
                    <span className={`rounded-full px-[10px] py-1 text-[12px] font-medium ${m.role === 'owner' ? 'bg-accent' : 'bg-line-2'}`}>{ROLE_LABEL[m.role]}</span>
                    {m.id !== p.meId && (
                      <button type="button" onClick={() => setRemoving(m)} aria-label={`Remover ${m.name}`} className="h-8 rounded-full border border-solid border-line bg-white px-3 text-[12px] text-ink-2">Remover</button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <aside className="box-border flex w-full flex-col gap-3 rounded-card bg-dark p-[22px] text-white lg:w-[340px] lg:shrink-0">
          <span className="text-[15px] font-medium">Plano e uso</span>
          <span className="text-[13px] text-dark-muted">Este mês</span>
          {[
            ['Tráfego de vídeo (CDN)', '—', 0, 'bg-accent'],
            ['Horas ao vivo', `${formatInt(p.usage.liveHours)} h`, Math.min(100, (p.usage.liveHours / 50) * 100), 'bg-white'],
            ['E-mails de código enviados', formatInt(p.usage.emails), Math.min(100, (p.usage.emails / 30000) * 100), 'bg-white'],
          ].map(([l, v, w, c]) => (
            <div key={l as string} className="flex flex-col gap-[6px]">
              <div className="flex justify-between text-[13px]"><span className="text-dark-muted">{l}</span><span className="tabular">{v}</span></div>
              <div className="h-2 rounded-full bg-dark-3"><div className={`h-2 rounded-full ${c}`} style={{ width: `${w}%` }} /></div>
            </div>
          ))}
          <div className="flex-grow" />
          <span className="text-[12px] leading-[1.5] text-[#7C8088]">Os custos de infraestrutura (servidor, CDN e envio de e-mail) são cobrados conforme o uso.</span>
        </aside>
      </div>

      {camTest && <CameraTest onClose={() => setCamTest(false)} />}
      {invite && (
        <Modal labelledBy="inv" onClose={() => setInvite(null)}>
          <form onSubmit={sendInvite} noValidate className="flex flex-col gap-[14px]">
            <h2 id="inv" className="text-[22px] font-medium tracking-[-0.02em]">Convidar pessoa</h2>
            <Field id="in" label="Nome" value={invite.name} error={inviteErr.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
            <Field id="ie" type="email" label="E-mail" placeholder="nome@agencia.com.br" value={invite.email} error={inviteErr.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            <div className="flex flex-col gap-[6px]">
              <label htmlFor="ir" className="text-[12px] text-muted">Papel</label>
              <select id="ir" className={fieldCls(inviteErr.role)} value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as AdminRole })}>
                <option value="owner">Dona (acesso total)</option>
                <option value="operator">Central da live (lives e produtos)</option>
                <option value="finance">Só pedidos (pedidos, empresas e exportações)</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-[6px]">
              <button type="button" onClick={() => setInvite(null)} className="h-11 rounded-full border border-solid border-line bg-white px-[18px] text-[14px]">Cancelar</button>
              <button type="submit" className="h-11 rounded-full border-none bg-ink px-5 text-[14px] font-medium text-white">Enviar convite</button>
            </div>
          </form>
        </Modal>
      )}
      {removing && (
        <Modal labelledBy="rm" onClose={() => setRemoving(null)}>
          <h2 id="rm" className="text-[22px] font-medium tracking-[-0.02em]">Remover {removing.name}?</h2>
          <p className="m-0 text-[14px] text-muted">A pessoa perde o acesso ao painel na hora.</p>
          <div className="flex justify-end gap-2 pt-[6px]">
            <button type="button" onClick={() => setRemoving(null)} className="h-11 rounded-full border border-solid border-line bg-white px-[18px] text-[14px]">Manter</button>
            <button type="button" onClick={() => remove(removing)} className="h-11 rounded-full border-none bg-danger px-5 text-[14px] font-medium text-white">Remover</button>
          </div>
        </Modal>
      )}
      {toast}
    </>
  );
}
