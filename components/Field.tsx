// Campo com label do painel: fundo surface-2, raio 12, erro inline.
type Base = { id: string; label: string; error?: string; className?: string };

export const fieldCls = (error?: string, extra = '') =>
  `box-border h-[46px] w-full rounded-xl border-none px-[14px] text-[14px] ${error ? 'bg-danger-bg shadow-[inset_0_0_0_2px_var(--live)]' : 'bg-surface-2'} ${extra}`;

export function Field({ id, label, error, className = '', ...input }: Base & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`flex flex-col gap-[6px] ${className}`}>
      <label htmlFor={id} className="text-[12px] text-muted">{label}</label>
      <input id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} className={fieldCls(error, input.readOnly ? 'text-muted' : '')} {...input} />
      {error && <span id={`${id}-err`} className="text-[12px] text-danger">{error}</span>}
    </div>
  );
}
