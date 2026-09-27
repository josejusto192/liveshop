import { and, eq, notInArray } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { adminSnapshot, loadLive } from '@/lib/live-state';
import { signalOf } from '@/lib/signal';
import { hlsUrlsFor } from '@/lib/video';
import { Central } from './Central';

export const dynamic = 'force-dynamic';

export default async function CentralPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage('lives:write');
  const { id } = await params;
  const full = await loadLive(id);
  if (!full) notFound();
  const snapshot = await adminSnapshot(full, { signal: signalOf(id) });
  const inLineup = full.items.map((i) => i.productId);
  const addable = await db
    .select({ id: schema.products.id, name: schema.products.name })
    .from(schema.products)
    .where(and(eq(schema.products.brandId, full.live.brandId), eq(schema.products.active, true), inLineup.length ? notInArray(schema.products.id, inLineup) : undefined))
    .orderBy(schema.products.name);
  const hls = hlsUrlsFor(id);
  return <Central initial={snapshot} hlsUrl={hls.primary} hlsFallback={hls.fallback} addable={addable} />;
}
