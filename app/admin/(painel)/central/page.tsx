import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/admin/PageHeader';
import { requireAdminPage } from '@/lib/auth';
import { currentLiveId } from '@/lib/lives-admin';

// Atalho da sidebar: abre a Central da live no ar (ou da próxima agendada).
export default async function CentralShortcut() {
  await requireAdminPage('lives:write');
  const id = await currentLiveId();
  if (id) redirect(`/admin/lives/${id}/central`);
  return (
    <>
      <PageHeader eyebrow="Ao vivo" title="Central da live" />
      <section className="flex flex-grow flex-col items-center justify-center gap-3 rounded-card bg-surface p-10 text-center">
        <p className="m-0 max-w-[420px] text-[14px] leading-[1.5] text-muted">Nenhuma live no ar ou agendada. Crie uma live e use “Salvar e abrir central”.</p>
        <Link href="/admin/lives/nova" className="flex h-11 items-center rounded-full bg-ink px-5 text-[14px] font-medium text-white no-underline">Nova live</Link>
      </section>
    </>
  );
}
