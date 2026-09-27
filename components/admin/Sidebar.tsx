'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { IconBox, IconBroadcast, IconBuilding, IconClipboard, IconGear, IconGrid, IconLogout, IconPlay, IconTag } from '@/components/icons';

export type NavItem = { href: string; label: string; icon: 'grid' | 'live' | 'box' | 'orders' | 'companies' | 'brands' | 'settings'; badge?: boolean };

const ICONS = { grid: IconGrid, live: IconBroadcast, box: IconBox, orders: IconClipboard, companies: IconBuilding, brands: IconTag, settings: IconGear };

// Sidebar escura flutuante (236 px, margem 24 px) dos protótipos Admin*.
export function Sidebar({ items, settingsItem, platformName, user }: { items: NavItem[]; settingsItem: NavItem | null; platformName: string; user: { initials: string; name: string; title: string } }) {
  const path = usePathname();
  const router = useRouter();
  const isActive = (href: string) => (href === '/admin' ? path === '/admin' : path.startsWith(href));

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: 'admin' }) });
    router.replace('/admin/login');
    router.refresh();
  }

  const link = (it: NavItem) => {
    const Icon = ICONS[it.icon];
    const active = isActive(it.href);
    return (
      <Link
        key={it.href}
        href={it.href}
        aria-current={active ? 'page' : undefined}
        className={`flex h-11 items-center gap-3 rounded-xl px-3 text-[14px] font-medium no-underline ${active ? 'bg-dark-3 text-white' : 'text-dark-muted hover:text-white'}`}
      >
        <Icon />
        <span className="flex-grow">{it.label}</span>
        {it.badge && <span className="rounded-full bg-live px-[7px] py-[2px] text-[10px] font-semibold text-white">AO VIVO</span>}
        {active && !it.badge && <span className="h-[6px] w-[6px] rounded-full bg-accent" />}
      </Link>
    );
  };

  return (
    <nav aria-label="Menu" className="on-dark sticky top-6 m-6 mr-0 box-border flex h-[calc(100vh-48px)] min-h-[600px] w-[236px] shrink-0 flex-col gap-1 rounded-card-lg bg-dark px-[14px] py-[22px]">
      <div className="flex items-center gap-[10px] px-2 pb-[26px]">
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-ink"><IconPlay /></span>
        <span className="text-[17px] font-semibold tracking-[-0.01em] text-white">{platformName}</span>
      </div>
      <span className="px-3 pb-2 text-[11px] font-medium tracking-[0.08em] text-[#7C8088]">MENU</span>
      {items.map(link)}
      <div className="flex-grow" />
      {settingsItem && link(settingsItem)}
      <div className="mt-[10px] flex items-center gap-[10px] rounded-2xl bg-dark-2 p-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-dark-line text-[13px] font-semibold text-white">{user.initials}</span>
        <span className="flex min-w-0 flex-grow flex-col">
          <span className="truncate text-[13px] font-medium text-white">{user.name}</span>
          <span className="text-[12px] text-[#7C8088]">{user.title}</span>
        </span>
        <button type="button" onClick={logout} aria-label="Sair do painel" title="Sair" className="flex h-8 w-8 items-center justify-center rounded-full border-none bg-transparent text-dark-muted hover:bg-dark-3 hover:text-white">
          <IconLogout />
        </button>
      </div>
    </nav>
  );
}
