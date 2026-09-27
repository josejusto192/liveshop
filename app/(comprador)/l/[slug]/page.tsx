import { notFound } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { SignupForm } from '@/components/buyer/SignupForm';
import { getCompany } from '@/lib/auth';
import { getPublicLive } from '@/lib/lives';
import { timeRange, weekdayDate } from '@/lib/dates';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

// Decide: cadastro, sala de espera, live ou encerrada (as três últimas entram no M2/M3).
export default async function LivePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const live = await getPublicLive(slug);
  if (!live) notFound();
  const [company, settings] = await Promise.all([getCompany(), getSettings()]);

  if (company) {
    // Temporário do M1: Sala de espera / Live / Live encerrada chegam no M2 e M3.
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <Logo name={settings.platformName} />
        <h1 className="text-[26px] font-medium tracking-[-0.03em]">{live.name}</h1>
        <p className="text-[15px] text-muted">
          Você entrou como <strong className="font-medium text-ink">{company.name}</strong>. A sala de espera e a live chegam no próximo marco.
        </p>
      </main>
    );
  }

  const steps = ['Cadastre sua empresa', 'Confirme o código no e-mail', 'Entre e registre pedidos'];
  return (
    <main className="box-border flex min-h-[100dvh] flex-col gap-3 p-3 lg:h-screen lg:min-h-[800px] lg:flex-row lg:gap-4 lg:p-4">
      <section className="anim-fade box-border flex flex-col gap-[14px] rounded-[26px] bg-dark p-[22px] text-white lg:w-[540px] lg:shrink-0 lg:gap-6 lg:rounded-panel lg:p-10">
        <div className="lg:hidden"><Logo name={settings.platformName} dark small /></div>
        <div className="hidden lg:block"><Logo name={settings.platformName} dark /></div>
        <div className="hidden flex-grow lg:block" />
        <div className="flex gap-[6px] lg:gap-2">
          <span className="rounded-full bg-accent px-[10px] py-[5px] text-[12px] font-medium text-ink lg:px-3 lg:py-[6px] lg:text-[13px]">{weekdayDate(live.startsAt)}</span>
          <span className="rounded-full border border-solid border-dark-line px-[10px] py-[5px] text-[12px] text-[#D5D8DE] lg:px-3 lg:py-[6px] lg:text-[13px]">{timeRange(live.startsAt, live.endsAt)}</span>
        </div>
        <h1 className="text-[32px] font-medium leading-[1.05] tracking-[-0.04em] lg:text-[52px] lg:leading-[1.02] lg:tracking-[-0.045em]">{live.name}</h1>
        <p className="m-0 text-[14px] leading-[1.5] text-dark-muted lg:hidden">Assista e registre os pedidos da sua loja na hora, sem pagar agora.</p>
        <p className="m-0 hidden max-w-[420px] text-[16px] leading-[1.55] text-dark-muted lg:block">
          Assista à apresentação da {live.brandName} e registre os pedidos de estoque da sua loja na hora, sem pagar agora.
        </p>
        <ol className="m-0 hidden list-none grid-cols-3 gap-[10px] p-0 pt-2 lg:grid">
          {steps.map((s, i) => (
            <li key={s} className="flex flex-col gap-[10px] rounded-[18px] bg-dark-2 p-4">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold ${i === 0 ? 'bg-accent text-ink' : 'bg-dark-3'}`}>{i + 1}</span>
              <span className="text-[13px] leading-[1.4] text-[#D5D8DE]">{s}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="anim-in-late box-border flex flex-grow flex-col rounded-[26px] bg-surface p-[22px] lg:items-center lg:justify-center lg:rounded-panel lg:p-0">
        <SignupForm slug={live.slug} />
      </section>
    </main>
  );
}
