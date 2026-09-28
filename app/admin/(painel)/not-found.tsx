import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="flex flex-grow flex-col items-center justify-center gap-3 rounded-card bg-surface p-10 text-center">
      <span className="text-[18px] font-medium">Não encontramos o que você procura</span>
      <p className="m-0 max-w-[420px] text-[14px] leading-[1.5] text-muted">O item pode ter sido removido ou o link está incompleto.</p>
      <Link href="/admin" className="mt-2 flex h-11 items-center rounded-full bg-ink px-5 text-[14px] font-medium text-white no-underline">Voltar para a Visão geral</Link>
    </section>
  );
}
