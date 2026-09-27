'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconArrow } from '@/components/icons';

type Errors = Partial<Record<'company' | 'email' | 'whatsapp' | 'acceptTerms' | 'form', string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Máscara (11) 90000-0000 */
function maskWhatsapp(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const inputCls = (err?: string) =>
  `h-[50px] lg:h-[52px] w-full box-border rounded-input border-none px-4 text-[16px] lg:text-[15px] placeholder:text-[#8A8F99] ${
    err ? 'bg-danger-bg shadow-[inset_0_0_0_2px_var(--live)]' : 'bg-surface-2'
  }`;

export function SignupForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [accept, setAccept] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);

  function validate(): Errors {
    const e: Errors = {};
    if (!EMAIL_RE.test(email.trim())) e.email = email.trim() ? 'Digite um e-mail válido.' : 'Informe o e-mail.';
    if (mode === 'signup') {
      if (!company.trim()) e.company = 'Informe o nome da empresa.';
      const d = whatsapp.replace(/\D/g, '');
      if (d.length < 10) e.whatsapp = d ? 'Digite o WhatsApp com DDD.' : 'Informe o WhatsApp.';
      if (!accept) e.acceptTerms = 'Aceite os termos para continuar.';
    }
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    try {
      const body = mode === 'signup' ? { email, company, whatsapp, acceptTerms: accept, liveSlug: slug } : { email, liveSlug: slug };
      const res = await fetch('/api/auth/request-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      // Já pediu um código há menos de 30 s: segue para a tela do código, que mostra o tempo de reenvio.
      if (res.ok || data.error?.code === 'resend_too_soon') {
        router.push(`/l/${slug}/codigo`);
        return;
      }
      if (data.error?.code === 'not_registered') {
        setMode('signup');
        setErrors({ email: data.error.message });
      } else {
        const field = data.error?.field as keyof Errors | undefined;
        setErrors({ [field && field in { company: 1, email: 1, whatsapp: 1, acceptTerms: 1 } ? field : 'form']: data.error?.message ?? 'Algo deu errado. Tente de novo.' });
      }
    } catch {
      setErrors({ form: 'Sem conexão. Confira sua internet e tente de novo.' });
    }
    setLoading(false);
  }

  const err = (k: keyof Errors) =>
    errors[k] ? (
      <span id={`${k}-err`} className="text-[13px] text-danger">
        {errors[k]}
      </span>
    ) : null;

  return (
    <form onSubmit={submit} noValidate className="flex w-full flex-grow flex-col gap-[14px] lg:w-[420px] lg:flex-grow-0 lg:gap-[18px]">
      <div className="flex flex-col gap-2 lg:pb-[6px]">
        <h2 className="text-[22px] font-medium tracking-[-0.03em] lg:text-[32px] lg:tracking-[-0.035em]">Acesse a live</h2>
        <p className="m-0 hidden text-[15px] leading-[1.5] text-muted lg:block">
          {mode === 'signup'
            ? 'Preencha os dados da sua empresa. Vamos enviar um código de acesso para o seu e-mail.'
            : 'Digite o e-mail da sua empresa. Vamos enviar um código de acesso.'}
        </p>
      </div>

      {mode === 'signup' && (
        <div className="flex flex-col gap-[6px]">
          <label htmlFor="empresa" className="text-[12px] text-muted lg:text-[13px]">Nome da empresa</label>
          <input id="empresa" autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Ex.: Papelaria Central Ltda" aria-invalid={!!errors.company} aria-describedby={errors.company ? 'company-err' : undefined} className={inputCls(errors.company)} />
          {err('company')}
        </div>
      )}
      <div className="flex flex-col gap-[6px]">
        <label htmlFor="email" className="text-[12px] text-muted lg:text-[13px]">E-mail</label>
        <input id="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="compras@suaempresa.com.br" aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-err' : undefined} className={inputCls(errors.email)} />
        {err('email')}
      </div>
      {mode === 'signup' && (
        <>
          <div className="flex flex-col gap-[6px]">
            <label htmlFor="whats" className="text-[12px] text-muted lg:text-[13px]">WhatsApp</label>
            <input id="whats" type="tel" inputMode="tel" autoComplete="tel-national" value={whatsapp} onChange={(e) => setWhatsapp(maskWhatsapp(e.target.value))} placeholder="(11) 90000-0000" aria-invalid={!!errors.whatsapp} aria-describedby={errors.whatsapp ? 'whatsapp-err' : undefined} className={inputCls(errors.whatsapp)} />
            {err('whatsapp')}
          </div>
          <div className="flex flex-col gap-[6px]">
            <label className="flex items-start gap-[10px] text-[12px] leading-[1.45] text-muted lg:text-[13px]">
              <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} aria-invalid={!!errors.acceptTerms} aria-describedby={errors.acceptTerms ? 'acceptTerms-err' : undefined} className="m-0 h-[18px] w-[18px] shrink-0 accent-ink lg:mt-px" />
              <span className="lg:hidden">Concordo com os termos e com o contato sobre meus pedidos.</span>
              <span className="hidden lg:inline">Concordo com os termos de uso e com o contato sobre os meus pedidos.</span>
            </label>
            {err('acceptTerms')}
          </div>
        </>
      )}

      <div aria-live="polite">{err('form')}</div>
      <div className="flex-grow lg:hidden" />

      <button type="submit" disabled={loading} aria-busy={loading} className="flex h-14 items-center justify-between rounded-full border-none bg-ink pl-[22px] pr-[7px] text-[15px] font-medium text-white disabled:opacity-80 lg:pl-6 lg:pr-2">
        {loading ? 'Enviando código…' : 'Receber código por e-mail'}
        <span className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-accent text-ink">
          {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink border-t-transparent" aria-hidden /> : <IconArrow size={16} />}
        </span>
      </button>
      <p className="m-0 text-center text-[13px] text-muted lg:text-[14px]">
        {mode === 'signup' ? (
          <>
            Já tem cadastro?{' '}
            <button type="button" onClick={() => { setMode('login'); setErrors({}); }} className="border-none bg-transparent p-0 font-medium text-ink underline">
              Entrar só com o e-mail
            </button>
          </>
        ) : (
          <>
            Primeira vez?{' '}
            <button type="button" onClick={() => { setMode('signup'); setErrors({}); }} className="border-none bg-transparent p-0 font-medium text-ink underline">
              Cadastrar minha empresa
            </button>
          </>
        )}
      </p>
    </form>
  );
}
