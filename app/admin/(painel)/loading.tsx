// Carregando uma tela do painel: esqueleto no mesmo desenho (cabeçalho, KPIs e tabela).
export default function Loading() {
  return (
    <div className="flex min-h-0 flex-grow flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <div className="flex h-[60px] shrink-0 flex-col justify-center gap-2">
        <span className="h-3 w-28 animate-[lsPulse_1.4s_ease-in-out_infinite] rounded-full bg-line" />
        <span className="h-7 w-64 animate-[lsPulse_1.4s_ease-in-out_infinite] rounded-full bg-line" />
      </div>
      <div className="grid h-[104px] shrink-0 grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="animate-[lsPulse_1.4s_ease-in-out_infinite] rounded-card bg-surface" style={{ animationDelay: `${i * 90}ms` }} />
        ))}
      </div>
      <div className="flex flex-grow flex-col gap-3 rounded-card bg-surface p-[22px]">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className="h-10 animate-[lsPulse_1.4s_ease-in-out_infinite] rounded-xl bg-surface-2" style={{ animationDelay: `${i * 70}ms` }} />
        ))}
      </div>
    </div>
  );
}
