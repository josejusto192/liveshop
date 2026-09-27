import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { IconMail } from '@/components/icons';
import { getAdmin, PENDING_EMAIL_COOKIE } from '@/lib/auth';
import { resendWaitS } from '@/lib/otp';
import { getSettings } from '@/lib/settings';
import { AdminLogin } from './AdminLogin';

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  if (await getAdmin()) redirect('/admin');
  const settings = await getSettings();
  const pending = (await cookies()).get(PENDING_EMAIL_COOKIE.admin)?.value ?? null;
  const wait = pending ? await resendWaitS(pending, 'admin') : 0;

  return (
    <main className="box-border flex min-h-[100dvh] flex-col p-3 lg:items-center lg:p-8">
      <div className="hidden self-stretch lg:block"><Logo name={settings.platformName} /></div>
      <div className="hidden flex-grow lg:block" />
      <section className="anim-in box-border flex flex-grow flex-col gap-[18px] rounded-[26px] bg-surface px-[22px] py-6 lg:w-[500px] lg:flex-grow-0 lg:gap-[22px] lg:rounded-panel lg:p-10">
        <span className="hidden h-14 w-14 items-center justify-center rounded-[18px] bg-ink text-accent lg:flex"><IconMail /></span>
        <h1 className="text-[26px] font-medium tracking-[-0.035em] lg:text-[30px]">Entrar no painel</h1>
        <AdminLogin ttlMin={settings.otpTtlMin} initialEmail={pending} initialWait={wait} />
      </section>
      <div className="hidden flex-grow lg:block" />
    </main>
  );
}
