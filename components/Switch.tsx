'use client';

/** Liga/desliga com trilho escuro e bolinha lime (AdminNovaLive). */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[26px] w-11 shrink-0 rounded-full border-none p-0 disabled:opacity-50 ${checked ? 'bg-ink' : 'bg-line'}`}
    >
      <span
        className={`absolute top-[3px] h-5 w-5 rounded-full transition-[left,background-color] duration-200 ${checked ? 'left-[21px] bg-accent' : 'left-[3px] bg-white'}`}
      />
    </button>
  );
}
