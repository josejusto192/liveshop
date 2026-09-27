'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Aviso flutuante no topo (padrão dos protótipos do admin). */
export function useToast(ms = 2400) {
  const [msg, setMsg] = useState('');
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = useCallback(
    (m: string) => {
      setMsg(m);
      clearTimeout(t.current);
      t.current = setTimeout(() => setMsg(''), ms);
    },
    [ms],
  );
  useEffect(() => () => clearTimeout(t.current), []);
  const node = (
    <div aria-live="polite" role="status" className="pointer-events-none">
      {msg && (
        <div className="anim-pop-top fixed left-1/2 top-7 z-50 flex items-center gap-[10px] rounded-full bg-ink px-[18px] py-3 text-[14px] text-white">
          <span className="h-2 w-2 rounded-full bg-accent" />
          {msg}
        </div>
      )}
    </div>
  );
  return { flash, toast: node };
}
