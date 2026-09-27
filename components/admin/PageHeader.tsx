export function PageHeader({ eyebrow, title, children }: { eyebrow: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <header className="flex h-[60px] shrink-0 items-center gap-[10px]">
      <div className="flex flex-grow flex-col gap-[2px]">
        <span className="text-[14px] text-muted">{eyebrow}</span>
        <h1 className="text-[30px] font-medium tracking-[-0.03em]">{title}</h1>
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
