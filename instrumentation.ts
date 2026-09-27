// Roda uma vez quando o servidor Node sobe: liga o relógio das lives.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NODE_ENV !== 'test') {
    const { startLiveClock } = await import('./lib/live-clock');
    startLiveClock();
  }
}
