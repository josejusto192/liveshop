import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="box-border flex min-h-[100dvh] items-center justify-center p-4">
      <section className="flex w-full max-w-[440px] flex-col items-center gap-3 rounded-[26px] bg-surface p-8 text-center">
        <span className="text-[20px] font-medium tracking-[-0.02em]">Página não encontrada</span>
        <p className="m-0 text-[14px] leading-[1.5] text-muted">O link pode estar errado ou a live foi removida. Confira o convite que você recebeu.</p>
        <Link href="/conta" className="mt-2 flex h-12 items-center rounded-full bg-ink px-6 text-[15px] font-medium text-white no-underline">Ir para Minha conta</Link>
      </section>
    </main>
  );
}
