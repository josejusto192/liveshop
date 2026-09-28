import { Logo } from './Logo';
import { IconMail } from './icons';

/** Moldura da tela do código (Codigo / CodigoMobile), usada pelo comprador e pelo login do admin. */
export function CodeScreen({ platformName, title, lead, children }: { platformName: string; title: string; lead: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="box-border flex min-h-[100dvh] flex-col p-3 lg:items-center lg:p-8">
      <div className="hidden self-stretch lg:block"><Logo name={platformName} /></div>
      <div className="hidden flex-grow lg:block" />
      <section className="anim-in box-border flex flex-grow flex-col gap-[18px] rounded-[26px] bg-surface px-[22px] py-6 lg:w-[500px] lg:flex-grow-0 lg:gap-[22px] lg:rounded-panel lg:p-10">
        <span className="hidden h-14 w-14 items-center justify-center rounded-[18px] bg-ink text-accent lg:flex"><IconMail /></span>
        <div className="flex flex-col gap-2">
          <h1 className="text-[26px] font-medium tracking-[-0.035em] lg:text-[30px]">{title}</h1>
          <p className="m-0 text-[14px] leading-[1.5] text-muted lg:text-[15px]">{lead}</p>
        </div>
        {children}
      </section>
      <div className="hidden flex-grow lg:block" />
      <p className="m-0 hidden text-center text-[13px] text-ink-2 lg:block">Não recebeu? Olhe a caixa de spam ou promoções.</p>
    </main>
  );
}
