'use client';
import { useState } from 'react';
import { CodeForm } from '@/components/CodeForm';
import { IconArrow } from '@/components/icons';

// Login do admin (não desenhado): e-mail + código, no visual da tela de Código.
export function AdminLogin({ ttlMin, initialEmail, initialWait }: { ttlMin: number; initialEmail: string | null; initialWait: number }) {
  const [email, setEmail] = useState(initialEmail ?? '');
  const [step, setStep] = useState<'email' | 'code'>(initialEmail ? 'code' : 'email');
  const [wait, setWait] = useState(initialWait);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Digite um e-mail válido.');
      return;
    }
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/request-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, subject: 'admin' }) });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok || data.error?.code === 'resend_too_soon') {
      setWait(data.resendInS ?? data.error?.retryInS ?? 30);
      setEmail(email.trim().toLowerCase());
      setStep('code');
    } else setError(data.error?.message ?? 'Algo deu errado. Tente de novo.');
  }

  if (step === 'code') {
    return (
      <>
        <p className="m-0 -mt-2 text-[14px] leading-[1.5] text-muted lg:text-[15px]">
          Enviamos um código de 6 dígitos para <span className="font-medium text-ink">{email}</span>
        </p>
        <CodeForm
          email={email}
          subject="admin"
          ttlMin={ttlMin}
          initialResendIn={wait}
          nextHref="/admin"
          onChangeEmail={() => setStep('email')}
          submitLabel="Entrar no painel"
          successText="Você já pode entrar no painel."
          skipSuccess
        />
      </>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-grow flex-col gap-[18px] lg:gap-[22px]">
      <p className="m-0 -mt-2 text-[14px] leading-[1.5] text-muted lg:text-[15px]">Digite o seu e-mail da agência. Vamos enviar um código de acesso.</p>
      <div className="flex flex-col gap-[6px]">
        <label htmlFor="admin-email" className="text-[12px] text-muted lg:text-[13px]">E-mail</label>
        <input
          id="admin-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@agencia.com.br"
          aria-invalid={!!error}
          aria-describedby="admin-email-msg"
          className={`box-border h-[52px] w-full rounded-input border-none px-4 text-[15px] ${error ? 'bg-danger-bg shadow-[inset_0_0_0_2px_var(--live)]' : 'bg-surface-2'}`}
        />
        <span id="admin-email-msg" role="status" aria-live="polite" className="min-h-[18px] text-[13px] text-danger">{error}</span>
      </div>
      <div className="flex-grow lg:hidden" />
      <button type="submit" disabled={loading} aria-busy={loading} className="flex h-14 items-center justify-between rounded-full border-none bg-ink pl-6 pr-2 text-[15px] font-medium text-white disabled:opacity-80">
        {loading ? 'Enviando código…' : 'Receber código por e-mail'}
        <span className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-accent text-ink"><IconArrow size={16} /></span>
      </button>
    </form>
  );
}
