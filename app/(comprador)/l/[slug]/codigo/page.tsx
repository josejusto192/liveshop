import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { CodeForm } from '@/components/CodeForm';
import { CodeScreen } from '@/components/CodeScreen';
import { PENDING_EMAIL_COOKIE } from '@/lib/auth';
import { getPublicLive } from '@/lib/lives';
import { resendWaitS } from '@/lib/otp';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function CodigoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const live = await getPublicLive(slug);
  if (!live) notFound();
  const email = (await cookies()).get(PENDING_EMAIL_COOKIE.company)?.value;
  if (!email) redirect(`/l/${slug}`);
  const [settings, wait] = await Promise.all([getSettings(), resendWaitS(email, 'company')]);

  return (
    <CodeScreen
      platformName={settings.platformName}
      title="Confira seu e-mail"
      lead={<>Enviamos um código de 6 dígitos para <span className="font-medium text-ink">{email}</span></>}
    >
      <CodeForm
        email={email}
        subject="company"
        ttlMin={settings.otpTtlMin}
        initialResendIn={wait}
        nextHref={`/l/${slug}`}
        changeEmailHref={`/l/${slug}`}
        submitLabel="Entrar na live"
        successText="Você já pode entrar na live."
      />
    </CodeScreen>
  );
}
