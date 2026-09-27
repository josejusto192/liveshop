import { Upcoming } from '@/components/admin/PageHeader';
import { requireAdminPage } from '@/lib/auth';

export default async function Empresas() {
  await requireAdminPage('companies:read');
  return <Upcoming eyebrow="Compradores" title="Empresas compradoras" milestone="Marco M4" text="A base de empresas com histórico nas lives entra no M4." />;
}
