'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
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

  // Na sidebar recolhida (desktop) os textos somem e ficam só os ícones; `full` = gaveta do celular, sempre aberta.
  const fade = (full: boolean) => (full ? '' : 'opacity-0 transition-opacity duration-200 group-hover/nav:opacity-100 group-hover/nav:delay-100 group-focus-within/nav:opacity-100');
  const link = (it: NavItem, full = false) => {
    const Icon = ICONS[it.icon];
    const active = isActive(it.href);
    return (
      <Link
        key={it.href}
        href={it.href}
        aria-current={active ? 'page' : undefined}
        title={full ? undefined : it.label}
        className={`relative flex h-11 shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-[15px] text-[14px] font-medium no-underline ${active ? 'bg-dark-3 text-white' : 'text-dark-muted hover:bg-dark-2 hover:text-white'}`}
      >
        <span className="flex w-[18px] shrink-0 justify-center"><Icon /></span>
        {/* Ponto "ao vivo" no ícone quando recolhida */}
        {it.badge && !full && <span className="absolute left-[29px] top-[9px] h-2 w-2 rounded-full bg-live ring-2 ring-dark transition-opacity duration-200 group-hover/nav:opacity-0" aria-hidden />}
        <span className={`flex-grow ${fade(full)}`}>{it.label}</span>
        {it.badge && <span className={`rounded-full bg-live px-[7px] py-[2px] text-[10px] font-semibold text-white ${fade(full)}`}>AO VIVO</span>}
        {active && !it.badge && <span className={`h-[6px] w-[6px] shrink-0 rounded-full bg-accent ${fade(full)}`} />}
      </Link>
    );
  };

  const [open, setOpen] = useState(false);
  // Fecha a gaveta do celular ao trocar de tela e com Esc.
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const brand = (full: boolean) => (
    <div className="flex items-center gap-[10px] whitespace-nowrap px-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent text-ink"><IconPlay /></span>
      <span className={`text-[17px] font-semibold tracking-[-0.01em] text-white ${fade(full)}`}>{platformName}</span>
    </div>
  );
  const body = (full: boolean) => (
    <>
      <span className={`whitespace-nowrap px-3 pb-2 text-[11px] font-medium tracking-[0.08em] text-[#7C8088] ${fade(full)}`}>MENU</span>
      {items.map((it) => link(it, full))}
      <div className="flex-grow" />
      {settingsItem && link(settingsItem, full)}
      <div className={`mt-[10px] flex items-center gap-[10px] overflow-hidden whitespace-nowrap rounded-2xl bg-dark-2 transition-[padding] duration-300 ${full ? 'p-3' : 'p-[6px] group-hover/nav:p-3 group-focus-within/nav:p-3'}`}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-dark-line text-[13px] font-semibold text-white">{user.initials}</span>
        <span className={`flex min-w-0 flex-grow flex-col ${fade(full)}`}>
          <span className="truncate text-[13px] font-medium text-white">{user.name}</span>
          <span className="text-[12px] text-[#7C8088]">{user.title}</span>
        </span>
        <button type="button" onClick={logout} aria-label="Sair do painel" title="Sair" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-none bg-transparent text-dark-muted hover:bg-dark-3 hover:text-white ${fade(full)}`}>
          <IconLogout />
        </button>
      </div>
    </>
  );
  const live = items.some((i) => i.badge);

  return (
    <>
      {/* Desktop: sidebar escura flutuante, recolhida em ícones; expande no hover (ou foco do teclado) por cima do conteúdo */}
      <div className="sticky top-6 m-6 mr-0 hidden h-[calc(100vh-48px)] min-h-[600px] w-[76px] shrink-0 lg:block">
        <nav
          aria-label="Menu"
          className="group/nav on-dark absolute inset-y-0 left-0 z-40 box-border flex w-[76px] flex-col gap-1 overflow-hidden rounded-card-lg bg-dark px-[14px] py-[22px] transition-[width,box-shadow] duration-300 ease-[cubic-bezier(.2,.7,.2,1)] hover:w-[236px] hover:shadow-[0_24px_60px_rgba(17,18,20,0.35)] focus-within:w-[236px] motion-reduce:transition-none"
        >
          <div className="pb-[26px]">{brand(false)}</div>
          {body(false)}
        </nav>
      </div>

      {/* Celular e tablet: barra no topo com menu em gaveta */}
      <header className="on-dark sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 bg-dark px-3 lg:hidden">
        <div className="flex-grow">{brand(true)}</div>
        {live && <span className="rounded-full bg-live px-[7px] py-[2px] text-[10px] font-semibold text-white">AO VIVO</span>}
        <button type="button" onClick={() => setOpen(true)} aria-label="Abrir menu" aria-expanded={open} className="flex h-10 w-10 items-center justify-center rounded-full border-none bg-dark-2 text-white">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Fechar menu" onClick={() => setOpen(false)} className="anim-overlay absolute inset-0 cursor-default border-none bg-[rgba(17,18,20,0.45)] p-0" />
          <nav aria-label="Menu" className="on-dark anim-drawer absolute bottom-0 right-0 top-0 box-border flex w-[280px] max-w-[85vw] flex-col gap-1 overflow-y-auto bg-dark px-[14px] py-4">
            <div className="flex items-center pb-5">
              <div className="flex-grow">{brand(true)}</div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar menu" className="flex h-10 w-10 items-center justify-center rounded-full border-none bg-dark-2 text-white">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            {body(true)}
          </nav>
        </div>
      )}
    </>
  );
}
