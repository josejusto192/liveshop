'use client';
import { useEffect, useRef } from 'react';

/** Modal de confirmação/formulário: fecha no Esc e clicando fora, devolve o foco ao sair. */
export function Modal({ labelledBy, onClose, children, width = 460 }: { labelledBy: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="anim-overlay fixed inset-0 z-40 flex items-center justify-center bg-[rgba(17,18,20,0.45)]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={labelledBy} style={{ width }} className="anim-modal box-border flex flex-col gap-[14px] rounded-card-lg bg-surface p-7">
        {children}
      </div>
    </div>
  );
}
