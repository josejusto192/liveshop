import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api';
import { getCompany } from '@/lib/auth';
import { liveIdBySlug } from '@/lib/buyer-live';
import { buyerSnapshot, loadLive } from '@/lib/live-state';
import { hlsUrlsFor } from '@/lib/video';

// Live pública: nome, marca, data, status, formato e roteiro. hlsUrl só com sessão.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const l = await liveIdBySlug((await params).slug);
  if (!l) return apiError('not_found', 'Live não encontrada.', 404);
  const full = await loadLive(l.id);
  if (!full) return apiError('not_found', 'Live não encontrada.', 404);
  const company = await getCompany();
  const snap = buyerSnapshot(full);
  return NextResponse.json({ ...snap, hlsUrl: company ? hlsUrlsFor(l.id).primary : null, hlsFallbackUrl: company ? hlsUrlsFor(l.id).fallback : null });
}
