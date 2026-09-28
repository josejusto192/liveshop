'use client';
import { useEffect } from 'react';

// Erro inesperado numa tela do painel: mensagem clara e "Tentar de novo" sem perder o menu.
export default function PainelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <section role="alert" className="flex flex-grow flex-col items-center justify-center gap-3 rounded-card bg-surface p-10 text-center">
      <span className="text-[18px] font-medium">Algo deu errado ao carregar esta tela</span>
      <p className="m-0 max-w-[420px] text-[14px] leading-[1.5] text-muted">Confira sua conexão e tente de novo. Se continuar, avise o suporte técnico{error.digest ? ` com o código ${error.digest}` : ''}.</p>
      <button type="button" onClick={reset} className="mt-2 h-11 rounded-full border-none bg-ink px-5 text-[14px] font-medium text-white">Tentar de novo</button>
    </section>
  );
}
