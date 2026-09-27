'use client';
import Link from 'next/link';
import { useState } from 'react';
import { TransmitQrModal } from '@/components/admin/TransmitQr';
import { IconQr } from '@/components/admin/icons-extra';

export type LiveRowView = {
  id: string;
  name: string;
  brandName: string;
  date: string;
  status: 'draft' | 'scheduled' | 'live' | 'ended';
  companies: string;
  units: string;
};

const STATUS: Record<LiveRowView['status'], [string, string]> = {
  live: ['Ao vivo', 'bg-danger-bg text-danger'],
  scheduled: ['Agendada', 'bg-line-2 text-ink'],
  draft: ['Rascunho', 'bg-surface-2 text-muted'],
  ended: ['Encerrada', 'bg-ok-bg text-ok'],
};

export function LivesTable({ rows, canWrite, canOrders }: { rows: LiveRowView[]; canWrite: boolean; canOrders: boolean }) {
  const [qr, setQr] = useState<LiveRowView | null>(null);
  const grid = 'grid grid-cols-[2.4fr_1.3fr_1fr_1fr_1fr_1.4fr] items-center gap-3';
  return (
    <div className="box-border flex min-h-0 flex-grow flex-col rounded-card bg-surface px-[22px] py-[6px]">
      <div className={`${grid} h-[42px] shrink-0 text-[12px] text-muted`}>
        <span>Live</span><span>Data</span><span>Status</span><span>Empresas</span><span>Unidades</span><span />
      </div>
      <div className="min-h-0 flex-grow overflow-y-auto">
        {rows.length === 0 && <p className="m-0 border-t border-solid border-line-2 py-8 text-center text-[14px] text-muted">Nenhuma live encontrada.</p>}
        {rows.map((l) => {
          const [label, cls] = STATUS[l.status];
          const action =
            l.status === 'live'
              ? canWrite && { href: `/admin/lives/${l.id}/central`, label: 'Abrir central' }
              : l.status === 'ended'
                ? canOrders && { href: `/admin/pedidos?liveId=${l.id}`, label: 'Ver pedidos' }
                : canWrite && { href: `/admin/lives/${l.id}/editar`, label: 'Configurar' };
          return (
            <div key={l.id} className={`${grid} h-[54px] border-t border-solid border-line-2 text-[14px]`}>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{l.name}</span>
                <span className="text-[12px] text-muted">{l.brandName}</span>
              </span>
              <span className="text-ink-2">{l.date}</span>
              <span><span className={`rounded-full px-[10px] py-1 text-[12px] font-medium ${cls}`}>{label}</span></span>
              <span className="font-mono">{l.companies}</span>
              <span className="font-mono">{l.units}</span>
              <span className="flex justify-end gap-[6px]">
                {canWrite && (l.status === 'scheduled' || l.status === 'live') && (
                  <button type="button" onClick={() => setQr(l)} aria-label={`Transmitir pelo celular: ${l.name}`} title="Transmitir pelo celular" className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-solid border-line bg-white text-ink">
                    <IconQr />
                  </button>
                )}
                {action && (
                  <Link href={action.href} className="flex h-[34px] items-center rounded-full border border-solid border-line px-[14px] text-[13px] text-ink no-underline">
                    {action.label}
                  </Link>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {qr && <TransmitQrModal liveId={qr.id} liveName={qr.name} onClose={() => setQr(null)} />}
    </div>
  );
}
