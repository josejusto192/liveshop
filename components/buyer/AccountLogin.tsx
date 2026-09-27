'use client';
import { useState } from 'react';
import { CodeForm } from '@/components/CodeForm';
import { IconArrow } from '@/components/icons';

// Entrar em Minha conta sem passar por uma live: e-mail + código (mesmo fluxo do cadastro).
export function AccountLogin({ ttlMin, initialEmail, initialWait }: { ttlMin: number; initialEmail: string | null; initialWait: number }) {
  const [email, setEmail] = useState(initialEmail ?? '');
  const [step, setStep] = useState<'email' | 'code'>(initialEmail ? 'code' : 'email');
  const [wait, setWait] = useState(initialWait);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError(email.trim() ? 'Digite um e-mail válido.' : 'Informe o e-mail.');
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/request-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setLoading(false);
    if (res && (res.ok || data.error?.code === 'resend_too_soon')) {
      setWait(data.resendInS ?? data.error?.retryInS ?? 30);
      setEmail(email.trim().toLowerCase());
      setStep('code');
    } else if (data.error?.code === 'not_registered') {
      setError('Não encontramos cadastro com este e-mail. Para se cadastrar, entre pelo link de uma live.');
    } else setError(data.error?.message ?? 'Sem conexão. Confira sua internet e tente de novo.');
  }

  if (step === 'code') {
    return (
      <>
        <p className="m-0 -mt-2 text-[14px] leading-[1.5] text-muted lg:text-[15px]">
          Enviamos um código de 6 dígitos para <span className="font-medium text-ink">{email}</span>
        </p>
        <CodeForm
          email={email}
          subject="company"
          ttlMin={ttlMin}
          initialResendIn={wait}
          nextHref="/conta"
          onChangeEmail={() => setStep('email')}
          submitLabel="Entrar"
          successText="Você já pode ver seus pedidos."
          skipSuccess
        />
      </>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-grow flex-col gap-[18px] lg:gap-[22px]">
      <p className="m-0 -mt-2 text-[14px] leading-[1.5] text-muted lg:text-[15px]">Digite o e-mail de compras da sua empresa. Vamos enviar um código de acesso.</p>
      <div className="flex flex-col gap-[6px]">
        <label htmlFor="account-email" className="text-[12px] text-muted lg:text-[13px]">E-mail</label>
        <input
          id="account-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="compras@suaempresa.com.br"
          aria-invalid={!!error}
          aria-describedby="account-email-msg"
          className={`box-border h-[52px] w-full rounded-input border-none px-4 text-[16px] lg:text-[15px] ${error ? 'bg-danger-bg shadow-[inset_0_0_0_2px_var(--live)]' : 'bg-surface-2'}`}
        />
        <span id="account-email-msg" role="status" aria-live="polite" className="min-h-[18px] text-[13px] text-danger">{error}</span>
      </div>
      <div className="flex-grow lg:hidden" />
      <button type="submit" disabled={loading} aria-busy={loading} className="flex h-14 items-center justify-between rounded-full border-none bg-ink pl-6 pr-2 text-[15px] font-medium text-white disabled:opacity-80">
        {loading ? 'Enviando código…' : 'Receber código por e-mail'}
        <span className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-accent text-ink"><IconArrow size={16} /></span>
      </button>
    </form>
  );
}
