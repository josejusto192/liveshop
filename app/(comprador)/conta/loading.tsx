// Carregando Minha conta.
export default function Loading() {
  return (
    <main className="box-border flex min-h-[100dvh] items-center justify-center p-4" aria-busy="true">
      <div role="status" className="flex flex-col items-center gap-3 text-[14px] text-muted">
        <span className="h-10 w-10 animate-[lsPulse_1.4s_ease-in-out_infinite] rounded-full bg-line" aria-hidden />
        Carregando sua conta…
      </div>
    </main>
  );
}
