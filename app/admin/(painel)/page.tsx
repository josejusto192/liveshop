import { Upcoming } from '@/components/admin/PageHeader';
import { requireAdminPage } from '@/lib/auth';

export default async function VisaoGeral({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const admin = await requireAdminPage();
  const sp = await searchParams;
  return (
    <>
      {sp['sem-permissao'] && (
        <p role="alert" className="m-0 rounded-2xl bg-warn-bg px-4 py-3 text-[14px] text-warn">Seu papel não tem acesso a essa página.</p>
      )}
      <Upcoming eyebrow={`Olá, ${admin.name.split(' ')[0]}`} title="Visão geral" milestone="Marco M2" text="Lives, números do mês e a tabela de lives chegam junto com a criação de lives e a Central." />
    </>
  );
}
