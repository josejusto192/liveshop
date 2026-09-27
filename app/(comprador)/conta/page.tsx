import { cookies } from 'next/headers';
import { sql } from 'drizzle-orm';
import { Logo } from '@/components/Logo';
import { IconMail } from '@/components/icons';
import { Account, type AccountTab } from '@/components/buyer/Account';
import { AccountLogin } from '@/components/buyer/AccountLogin';
import { getCompany, PENDING_EMAIL_COOKIE } from '@/lib/auth';
import { accountOrders } from '@/lib/buyer-orders';
import { TZ } from '@/lib/dates';
import { db } from '@/lib/db';
import { resendWaitS } from '@/lib/otp';
import { getSettings } from '@/lib/settings';
import { companyTickets } from '@/lib/support';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Minha conta' };

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export default async function ContaPage({ searchParams }: { searchParams: Promise<{ aba?: string; pedido?: string }> }) {
  const [company, settings, sp] = await Promise.all([getCompany(), getSettings(), searchParams]);

  if (!company) {
    const pending = (await cookies()).get(PENDING_EMAIL_COOKIE.company)?.value ?? null;
    const wait = pending ? await resendWaitS(pending, 'company') : 0;
    return (
      <main className="box-border flex min-h-[100dvh] flex-col p-3 lg:items-center lg:p-8">
        <div className="hidden self-stretch lg:block">
          <Logo name={settings.platformName} />
        </div>
        <div className="hidden flex-grow lg:block" />
        <section className="anim-in box-border flex flex-grow flex-col gap-[18px] rounded-[26px] bg-surface px-[22px] py-6 lg:w-[500px] lg:flex-grow-0 lg:gap-[22px] lg:rounded-panel lg:p-10">
          <span className="hidden h-14 w-14 items-center justify-center rounded-[18px] bg-ink text-accent lg:flex">
            <IconMail />
          </span>
          <h1 className="text-[26px] font-medium tracking-[-0.035em] lg:text-[30px]">Minha conta</h1>
          <AccountLogin ttlMin={settings.otpTtlMin} initialEmail={pending} initialWait={wait} />
        </section>
        <div className="hidden flex-grow lg:block" />
      </main>
    );
  }

  const [orders, tickets, back] = await Promise.all([
    accountOrders(company.id),
    companyTickets(company.id),
    // "Voltar para a live": a live no ar agora; senão a próxima agendada em que a empresa já entrou.
    db.execute<{ slug: string; status: string }>(sql`
      select slug, status from lives
      where status = 'live'
         or (status = 'scheduled' and id in (select live_id from live_attendance where company_id = ${company.id}))
      order by (status = 'live') desc, starts_at asc limit 1`),
  ]);
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(company.createdAt).split('-');
  const tab: AccountTab = sp.aba === 'perfil' || sp.aba === 'suporte' ? sp.aba : 'pedidos';

  return (
    <Account
      platformName={settings.platformName}
      company={{
        name: company.name,
        email: company.email,
        cnpj: company.cnpj,
        whatsapp: company.whatsapp,
        contactName: company.contactName,
        cep: company.cep,
        address: company.address,
        city: company.city,
        notifyEmail: company.notifyEmail,
        notifyWhatsapp: company.notifyWhatsapp,
        since: `${MONTHS[Number(m) - 1]} de ${y}`,
      }}
      orders={orders}
      tickets={tickets}
      support={{ whatsapp: process.env.SUPPORT_WHATSAPP || null, email: process.env.SUPPORT_EMAIL || null }}
      backLive={back[0] ? { slug: back[0].slug, onAir: back[0].status === 'live' } : null}
      initialTab={tab}
      initialOrderId={orders.some((o) => o.id === sp.pedido) ? sp.pedido! : null}
    />
  );
}
