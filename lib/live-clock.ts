// Relógio da live: um único setInterval de 1 s no servidor (docs/04, "Tempo real").
// Faz a troca automática, reenvia o estado a cada 15 s, KPIs e assistindo a cada 5 s e o sinal a cada 2 s.
// Ao reiniciar, tudo é recalculado do banco (item_started_at, paused_at, extra_ms).
import { eq, inArray } from 'drizzle-orm';
import { db, schema } from './db';
import { publish, viewerCount } from './events';
import { autoAdvance } from './live-control';
import { broadcastItem, computeKpis, noNextMemo as noNext, recordKpis } from './live-state';
import { itemTiming } from './live-timing';
import { pollSignals } from './signal';

const g = globalThis as unknown as { __lsClock?: ReturnType<typeof setInterval> };

export function startLiveClock() {
  if (g.__lsClock) return;
  let n = 0;
  let busy = false;
  g.__lsClock = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await tick(new Date(), n++);
    } catch (e) {
      console.error('[relógio da live]', e);
    } finally {
      busy = false;
    }
  }, 1000);
  console.log('[relógio da live] iniciado');
}

export async function tick(now: Date, n: number) {
  const rows = await db
    .select({
      id: schema.lives.id,
      status: schema.lives.status,
      mode: schema.lives.mode,
      currentItemId: schema.lives.currentItemId,
      itemStartedAt: schema.lives.itemStartedAt,
      pausedAt: schema.lives.pausedAt,
      extraMs: schema.lives.extraMs,
      durationS: schema.liveItems.durationS,
      position: schema.liveItems.position,
    })
    .from(schema.lives)
    .leftJoin(schema.liveItems, eq(schema.liveItems.id, schema.lives.currentItemId))
    .where(inArray(schema.lives.status, ['scheduled', 'live']));

  const live = rows.filter((r) => r.status === 'live');
  for (const r of live) {
    if (r.mode !== 'auto' || r.pausedAt || !r.currentItemId || r.durationS === null) continue;
    const t = itemTiming(r, { id: r.currentItemId, position: r.position ?? 0, durationS: r.durationS }, now);
    const key = `${r.id}:${r.currentItemId}`;
    if (!t || t.remainingMs > 0 || noNext.has(key)) continue;
    const before = r.currentItemId;
    await autoAdvance(r.id, now);
    const [after] = await db.select({ cur: schema.lives.currentItemId }).from(schema.lives).where(eq(schema.lives.id, r.id));
    // Último item: fica no ar até o operador encerrar; não tenta de novo a cada segundo.
    if (after?.cur === before) noNext.add(key);
  }

  if (n % 5 === 0) {
    for (const r of live) {
      const k = await computeKpis(r.id);
      const history = recordKpis(r.id, k, now.getTime());
      publish(r.id, 'kpis', { ...k, history }, 'admin');
      publish(r.id, 'viewers', { count: viewerCount(r.id) }, 'all');
    }
    for (const r of rows.filter((x) => x.status === 'scheduled')) publish(r.id, 'viewers', { count: viewerCount(r.id) }, 'admin');
  }
  if (n % 15 === 0) {
    for (const r of live) await broadcastItem(r.id, { changed: false });
  }
  if (n % 2 === 0) {
    await pollSignals(rows.map((r) => r.id), now.getTime());
  }
}
