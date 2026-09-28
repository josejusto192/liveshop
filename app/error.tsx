'use client';
import { useEffect } from 'react';

// Erro inesperado nas telas do comprador.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main className="box-border flex min-h-[100dvh] items-center justify-center p-4">
      <section role="alert" className="flex w-full max-w-[440px] flex-col items-center gap-3 rounded-[26px] bg-surface p-8 text-center">
        <span className="text-[20px] font-medium tracking-[-0.02em]">Algo deu errado</span>
        <p className="m-0 text-[14px] leading-[1.5] text-muted">Confira sua conexão e tente de novo. Seus pedidos já registrados continuam salvos.</p>
        <button type="button" onClick={reset} className="mt-2 h-12 rounded-full border-none bg-ink px-6 text-[15px] font-medium text-white">Tentar de novo</button>
      </section>
    </main>
  );
}
