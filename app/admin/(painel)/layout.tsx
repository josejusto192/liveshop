import { eq } from 'drizzle-orm';
import { Sidebar, type NavItem } from '@/components/admin/Sidebar';
import { requireAdminPage } from '@/lib/auth';
import { initials } from '@/lib/brands';
import { db, schema } from '@/lib/db';
import { can, ROLE_TITLE } from '@/lib/permissions';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  const [settings, [onAir]] = await Promise.all([
    getSettings(),
    db.select({ id: schema.lives.id }).from(schema.lives).where(eq(schema.lives.status, 'live')).limit(1),
  ]);

  // Cada papel só vê o que pode usar.
  const items: NavItem[] = [
    { href: '/admin', label: 'Visão geral', icon: 'grid' as const },
    can(admin.role, 'lives:write') && { href: '/admin/central', label: 'Central da live', icon: 'live' as const, badge: !!onAir },
    can(admin.role, 'products:write') && { href: '/admin/produtos', label: 'Produtos', icon: 'box' as const },
    can(admin.role, 'orders:read') && { href: '/admin/pedidos', label: 'Pedidos', icon: 'orders' as const },
    can(admin.role, 'companies:read') && { href: '/admin/empresas', label: 'Empresas', icon: 'companies' as const },
    can(admin.role, 'brands:read') && { href: '/admin/marcas', label: 'Marcas', icon: 'brands' as const },
  ].filter(Boolean) as NavItem[];
  const settingsItem: NavItem | null = can(admin.role, 'settings:write') ? { href: '/admin/configuracoes', label: 'Configurações', icon: 'settings' } : null;

  return (
    <div className="flex min-h-screen flex-col bg-bg lg:min-w-[1100px] lg:flex-row">
      <Sidebar items={items} settingsItem={settingsItem} platformName={settings.platformName} user={{ initials: initials(admin.name), name: admin.name, title: ROLE_TITLE[admin.role] }} />
      <main className="anim-in box-border flex min-w-0 flex-grow flex-col gap-4 p-3 sm:p-4 lg:m-6 lg:ml-4 lg:h-[calc(100vh-48px)] lg:min-h-[600px] lg:p-0">{children}</main>
    </div>
  );
}
