import { Upcoming } from '@/components/admin/PageHeader';
import { requireAdminPage } from '@/lib/auth';

export default async function Central() {
  await requireAdminPage('lives:write');
  return <Upcoming eyebrow="Ao vivo" title="Central da live" milestone="Marco M2" text="A Central com prévia do vídeo, controles do roteiro e pedidos em tempo real entra no M2." />;
}
