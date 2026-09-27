import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/lib/auth';
import { adminSnapshot, loadLive } from '@/lib/live-state';
import { signalOf } from '@/lib/signal';
import { Transmitir } from './Transmitir';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Transmitir · Live Shop' };

// Tela Transmitir: câmera do celular ou do computador enviando a live por WebRTC (WHIP).
export default async function TransmitirPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage('lives:write');
  const { id } = await params;
  const full = await loadLive(id);
  if (!full) notFound();
  const snapshot = await adminSnapshot(full, { signal: signalOf(id) });
  const ua = (await headers()).get('user-agent') ?? '';
  const isMobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  return <Transmitir initial={snapshot} isMobileUA={isMobileUA} />;
}
