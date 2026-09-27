'use client';
import { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/Modal';

type Link = { url: string; qrSvg: string; expiresAt: number };

/** Modal com o QR code que abre a tela Transmitir no celular já logado. */
export function TransmitQrModal({ liveId, liveName, onClose }: { liveId: string; liveName: string; onClose: () => void }) {
  const [link, setLink] = useState<Link | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const generate = useCallback(async () => {
    setError('');
    setLink(null);
    const res = await fetch(`/api/admin/lives/${liveId}/broadcast-link`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error?.message ?? 'Não foi possível gerar o código.');
    setLink(data);
  }, [liveId]);

  useEffect(() => {
    generate();
  }, [generate]);
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const left = link ? Math.max(0, link.expiresAt - now) : 0;
  const expired = !!link && left === 0;
  const mm = Math.floor(left / 60000);
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');

  return (
    <Modal labelledBy="qr-title" onClose={onClose} width={420}>
      <h2 id="qr-title" className="text-[22px] font-medium tracking-[-0.02em]">Transmitir pelo celular</h2>
      <p className="m-0 text-[14px] leading-[1.5] text-muted">
        Aponte a câmera do celular para o código. A tela Transmitir de <strong className="font-medium text-ink">{liveName}</strong> abre já com o seu acesso.
      </p>
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface-2 p-5">
        <div className={`relative flex h-[220px] w-[220px] items-center justify-center rounded-xl bg-white p-3 ${expired ? 'opacity-30' : ''}`}>
          {link ? (
            <div className="h-full w-full [&_svg]:h-full [&_svg]:w-full" role="img" aria-label="QR code para abrir a tela Transmitir no celular" dangerouslySetInnerHTML={{ __html: link.qrSvg }} />
          ) : (
            <span className="text-[13px] text-muted">{error || 'Gerando código…'}</span>
          )}
        </div>
        <span className="text-[13px] text-muted" aria-live="polite">
          {expired ? 'Este código expirou.' : link ? (
            <>Vale por mais <span className="font-mono text-ink">{mm}:{ss}</span> e funciona uma vez.</>
          ) : ' '}
        </span>
      </div>
      <div className="flex justify-between gap-2 pt-[6px]">
        <a href={`/admin/lives/${liveId}/transmitir`} target="_blank" rel="noreferrer" className="flex h-11 items-center rounded-full border border-solid border-line bg-white px-[18px] text-[14px] text-ink no-underline">
          Abrir neste computador
        </a>
        <div className="flex gap-2">
          <button type="button" onClick={generate} className="h-11 rounded-full border border-solid border-line bg-white px-[18px] text-[14px]">Gerar novo</button>
          <button type="button" onClick={onClose} className="h-11 rounded-full border-none bg-ink px-5 text-[14px] font-medium text-white">Fechar</button>
        </div>
      </div>
    </Modal>
  );
}
