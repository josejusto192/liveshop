import { Upcoming } from '@/components/admin/PageHeader';
import { requireAdminPage } from '@/lib/auth';

export default async function Pedidos() {
  await requireAdminPage('orders:read');
  return <Upcoming eyebrow="Depois da live" title="Pedidos" milestone="Marco M4" text="Filtros, mudança de status e exportações para a marca entram no M4." />;
}
