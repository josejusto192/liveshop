'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconArrow, IconCheck } from '@/components/icons';

type Props = {
  email: string;
  subject: 'company' | 'admin';
  ttlMin: number;
  initialResendIn: number;
  /** Para onde vai depois do "Tudo certo". */
  nextHref: string;
  /** Link de "Trocar e-mail". */
  changeEmailHref?: string;
  onChangeEmail?: () => void;
  submitLabel: string;
  successText: string;
  /** Admin pula a tela "Tudo certo" e entra direto. */
  skipSuccess?: boolean;
};

type Msg = { text: string; tone: 'muted' | 'error' | 'ok' };

// Tela do código (Codigo / CodigoMobile): 6 caixas no desktop, campo único no celular.
export function CodeForm(p: Props) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<Msg>({ text: `O código vale por ${p.ttlMin} minutos.`, tone: 'muted' });
  const [locked, setLocked] = useState(false);
  const [shakeN, setShakeN] = useState(0);
  const [resendIn, setResendIn] = useState(p.initialResendIn);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const iv = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(iv);
  }, []);

  const hasError = msg.tone === 'error';
  const canSubmit = code.length === 6 && !locked && !loading;

  function update(v: string) {
    const clean = v.replace(/\D/g, '').slice(0, 6);
    setCode(clean);
    if (!locked && hasError) setMsg({ text: `O código vale por ${p.ttlMin} minutos.`, tone: 'muted' });
    if (msg.tone === 'ok') setMsg({ text: `O código vale por ${p.ttlMin} minutos.`, tone: 'muted' });
    return clean;
  }

  async function verify(value = code) {
    if (value.length !== 6 || locked || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: p.email, code: value, subject: p.subject }) });
      const data = await res.json();
      if (res.ok) {
        if (p.skipSuccess) {
          router.replace(p.nextHref);
          router.refresh();
          return;
        }
        setOk(true);
        setLoading(false);
        return;
      }
      const e = data.error ?? {};
      setShakeN((n) => n + 1);
      setCode('');
      if (e.code === 'blocked' || e.code === 'expired') setLocked(true);
      setMsg({ text: e.message ?? 'Algo deu errado. Tente de novo.', tone: 'error' });
      boxes.current[0]?.focus();
    } catch {
      setMsg({ text: 'Sem conexão. Confira sua internet e tente de novo.', tone: 'error' });
    }
    setLoading(false);
  }

  async function resend() {
    const res = await fetch('/api/auth/request-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: p.email, subject: p.subject }) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setLocked(false);
      setCode('');
      setResendIn(data.resendInS ?? 30);
      setMsg({ text: 'Enviamos um novo código. O anterior não vale mais.', tone: 'ok' });
      boxes.current[0]?.focus();
    } else {
      if (data.error?.retryInS) setResendIn(data.error.retryInS);
      setMsg({ text: data.error?.message ?? 'Não foi possível reenviar. Tente de novo.', tone: 'error' });
    }
  }

  // Caixas do desktop
  function onBox(i: number, v: string) {
    const digits = v.replace(/\D/g, '');
    if (!digits) return;
    const arr = code.padEnd(6, ' ').split('');
    if (digits.length > 1) {
      // Colou o código inteiro (ou parte) a partir desta caixa.
      digits.slice(0, 6 - i).split('').forEach((d, k) => (arr[i + k] = d));
    } else arr[i] = digits;
    const next = update(arr.join('').replace(/ /g, ''));
    const focusAt = Math.min(i + digits.length, 5);
    boxes.current[focusAt]?.focus();
    if (next.length === 6) verify(next);
  }
  function onBoxKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const idx = code[i] ? i : Math.max(0, i - 1);
      update(code.slice(0, idx) + code.slice(idx + 1));
      boxes.current[idx]?.focus();
    } else if (e.key === 'ArrowLeft') boxes.current[Math.max(0, i - 1)]?.focus();
    else if (e.key === 'ArrowRight') boxes.current[Math.min(5, i + 1)]?.focus();
    else if (e.key === 'Enter') verify();
  }

  const shake = hasError ? { animation: `${shakeN % 2 ? 'lsShakeA' : 'lsShakeB'} .4s ease` } : undefined;
  const msgColor = hasError ? 'text-danger' : msg.tone === 'ok' ? 'text-ok' : 'text-muted';
  const resendLabel = `0:${String(resendIn).padStart(2, '0')}`;

  if (ok) {
    return (
      <div className="flex flex-grow flex-col gap-[18px]">
        <div className="anim-in flex flex-grow flex-col items-center justify-center gap-4 py-6 text-center">
          <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-ink text-accent"><IconCheck /></span>
          <h1 className="text-[26px] font-medium tracking-[-0.035em]" tabIndex={-1} ref={(el) => el?.focus()}>Tudo certo</h1>
          <p className="m-0 text-[14px] text-muted">{p.successText}</p>
        </div>
        <a href={p.nextHref} className="flex h-14 items-center justify-between rounded-full bg-ink pl-[22px] pr-[7px] text-[15px] font-medium text-white no-underline">
          Continuar
          <span className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-accent text-ink"><IconArrow size={15} /></span>
        </a>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); verify(); }}
      className="flex flex-grow flex-col gap-[18px] lg:gap-[22px]"
    >
      <fieldset className="m-0 flex flex-col gap-2 border-none p-0 lg:gap-[10px]">
        <legend className="mb-2 p-0 text-[12px] text-muted lg:mb-[10px] lg:text-[13px]">Código de acesso</legend>
        {/* Celular: campo único com one-time-code */}
        <input
          aria-label="Código de acesso"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => {
            const v = update(e.target.value);
            if (v.length === 6) verify(v);
          }}
          disabled={locked}
          aria-invalid={hasError}
          aria-describedby="code-msg"
          placeholder="000000"
          style={shake}
          className={`box-border h-[72px] w-full rounded-[18px] border-none pl-[0.35em] text-center font-mono text-[34px] tracking-[0.35em] text-ink outline-none disabled:opacity-60 lg:hidden ${
            hasError ? 'bg-danger-bg shadow-[inset_0_0_0_2px_var(--live)]' : code.length ? 'bg-surface-2 shadow-[inset_0_0_0_2px_var(--ink)]' : 'bg-surface-2'
          }`}
        />
        {/* Desktop: 6 caixas */}
        <div className="hidden grid-cols-6 gap-[10px] lg:grid" style={shake}>
          {Array.from({ length: 6 }, (_, i) => {
            const filled = !!code[i];
            const active = i === Math.min(code.length, 5) && !locked;
            return (
              <input
                key={i}
                ref={(el) => { boxes.current[i] = el; }}
                aria-label={`Dígito ${i + 1}`}
                inputMode="numeric"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                value={code[i] ?? ''}
                onChange={(e) => onBox(i, e.target.value)}
                onKeyDown={(e) => onBoxKey(i, e)}
                onFocus={(e) => e.target.select()}
                disabled={locked}
                aria-invalid={hasError}
                aria-describedby="code-msg"
                className={`box-border h-16 w-full rounded-2xl text-center text-[28px] font-medium outline-none disabled:opacity-60 ${
                  hasError
                    ? 'border-none bg-danger-bg shadow-[inset_0_0_0_2px_var(--live)]'
                    : active && !filled
                      ? 'border-2 border-solid border-ink bg-white'
                      : 'border-none bg-surface-2 focus:shadow-[inset_0_0_0_2px_var(--ink)]'
                }`}
              />
            );
          })}
        </div>
        <span id="code-msg" role="status" aria-live="polite" className={`min-h-[36px] text-[13px] leading-[1.4] lg:min-h-0 ${msgColor}`}>
          {msg.text}
        </span>
      </fieldset>

      <div className="flex-grow lg:hidden" />

      {/* Celular: botão simples "Entrar" */}
      <button type="submit" disabled={!canSubmit} className={`h-14 rounded-full border-none text-[15px] font-medium lg:hidden ${canSubmit ? 'bg-ink text-white' : 'bg-bg text-[#8A8F99]'}`}>
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
      {/* Desktop: pill com círculo lime */}
      <button type="submit" disabled={!canSubmit} className={`hidden h-14 items-center justify-between rounded-full border-none pl-6 pr-2 text-[15px] font-medium lg:flex ${canSubmit ? 'bg-ink text-white' : 'bg-bg text-[#8A8F99]'}`}>
        {loading ? 'Entrando…' : p.submitLabel}
        <span className={`flex h-[42px] w-[42px] items-center justify-center rounded-full ${canSubmit ? 'bg-accent text-ink' : 'bg-[#E1E3E6] text-[#8A8F99]'}`}><IconArrow size={16} /></span>
      </button>

      <div className="flex items-center justify-between text-[13px] lg:text-[14px]">
        {p.onChangeEmail ? (
          <button type="button" onClick={p.onChangeEmail} className="border-none bg-transparent p-0 font-medium text-ink underline">Trocar e-mail</button>
        ) : (
          <a href={p.changeEmailHref} className="font-medium text-ink">Trocar e-mail</a>
        )}
        {resendIn > 0 && !locked ? (
          <span className="text-muted">
            Reenviar em <span className="font-mono text-ink tabular">{resendLabel}</span>
          </span>
        ) : resendIn > 0 ? (
          <span className="text-muted">
            Novo código em <span className="font-mono text-ink tabular">{resendLabel}</span>
          </span>
        ) : (
          <button type="button" onClick={resend} className="h-9 rounded-full border border-solid border-line bg-white px-[14px] text-[13px] font-medium">
            Reenviar código
          </button>
        )}
      </div>
    </form>
  );
}
