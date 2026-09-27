import { IconBell } from './icons-extra';

// Sininho da Visão geral. A lista de chamados de suporte entra no M4.
export function NotificationsBell() {
  return (
    <button type="button" aria-label="Notificações" className="relative flex h-11 w-11 items-center justify-center rounded-full border-none bg-white text-ink">
      <IconBell />
    </button>
  );
}
