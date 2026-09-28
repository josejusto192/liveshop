export function PageHeader({ eyebrow, title, children }: { eyebrow: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-[10px] lg:h-[60px] lg:flex-nowrap">
      <div className="flex min-w-0 flex-grow basis-full flex-col gap-[2px] sm:basis-auto">
        <span className="text-[13px] text-muted lg:text-[14px]">{eyebrow}</span>
        <h1 className="text-[24px] font-medium tracking-[-0.03em] lg:text-[30px]">{title}</h1>
      </div>
      {children}
    </header>
  );
}

/** Página ainda não construída (marco futuro). */
export function Upcoming({ eyebrow, title, milestone, text }: { eyebrow: string; title: string; milestone: string; text: string }) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} />
      <section className="flex flex-grow flex-col items-center justify-center gap-2 rounded-card bg-surface p-10 text-center">
        <span className="rounded-full bg-surface-2 px-3 py-1 text-[12px] font-medium text-ink-2">{milestone}</span>
        <p className="m-0 max-w-[420px] text-[14px] leading-[1.5] text-muted">{text}</p>
      </section>
    </>
  );
}
