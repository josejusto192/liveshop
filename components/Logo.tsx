import { IconPlay } from './icons';

export function Logo({ name = 'Live Shop', dark = false, small = false }: { name?: string; dark?: boolean; small?: boolean }) {
  return (
    <div className="flex items-center gap-[10px]">
      <span className={`flex items-center justify-center bg-accent text-ink ${small ? 'h-7 w-7 rounded-[9px]' : 'h-8 w-8 rounded-[10px]'}`}>
        <IconPlay size={small ? 12 : 14} />
      </span>
      <span className={`font-semibold tracking-[-0.01em] ${small ? 'text-[15px]' : 'text-[17px]'} ${dark ? 'text-white' : ''}`}>{name}</span>
    </div>
  );
}
