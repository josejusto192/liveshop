import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { LiveEnded } from '@/components/buyer/LiveEnded';
import { LiveRoom } from '@/components/buyer/LiveRoom';
import { SignupForm } from '@/components/buyer/SignupForm';
import { WaitingRoom } from '@/components/buyer/WaitingRoom';
import { getCompany } from '@/lib/auth';
import { recordAttendance } from '@/lib/buyer-live';
import { orderForCompany, orderIdFor } from '@/lib/buyer-orders';
import { TZ, timeRange, weekdayDate } from '@/lib/dates';
import { buyerSnapshot, loadLive } from '@/lib/live-state';
import { getPublicLive } from '@/lib/lives';
import { getMyOrder, myStockAlerts } from '@/lib/orders';
import { getSettings } from '@/lib/settings';
import { hlsUrlsFor } from '@/lib/video';

export const dynamic = 'force-dynamic';

function whenLabel(d: Date) {
  const key = (x: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(x);
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  if (key(d) === key(new Date())) return `Hoje, ${time}`;
  if (key(d) === key(new Date(Date.now() + 86400_000))) return `Amanhã, ${time}`;
  return `${weekdayDate(d)}, ${time}`;
}

// Decide: cadastro, sala de espera, live ou encerrada.
export default async function LivePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const live = await getPublicLive(slug);
  if (!live) notFound();
  const [company, settings] = await Promise.all([getCompany(), getSettings()]);

  if (company) {
    const full = await loadLive(live.id);
    if (!full) notFound();
    if (full.live.status === 'scheduled') {
      return <WaitingRoom slug={slug} snapshot={buyerSnapshot(full)} company={{ name: company.name }} whenLabel={whenLabel(full.live.startsAt)} notifyWhatsapp={company.notifyWhatsapp} />;
    }
    if (full.live.status === 'live') {
      await recordAttendance(live.id, company.id);
      const [myOrder, alerts] = await Promise.all([getMyOrder(live.id, company.id), myStockAlerts(company.id, full.items.map((i) => i.productId))]);
      const ua = (await headers()).get('user-agent') ?? '';
      return (
        <LiveRoom
          slug={slug}
          snapshot={buyerSnapshot(full)}
          myOrder={myOrder}
          alerts={alerts}
          company={{ name: company.name }}
          hlsUrl={hlsUrlsFor(live.id).primary}
          hlsFallback={hlsUrlsFor(live.id).fallback}
          isMobileUA={/Android|iPhone|iPad|iPod|Mobile/i.test(ua)}
        />
      );
    }
    // Encerrada
    const orderId = await orderIdFor(live.id, company.id);
    const order = orderId ? await orderForCompany(orderId, company.id) : null;
    const started = full.live.startedAt;
    const ended = full.live.endedAt;
    return (
      <LiveEnded
        platformName={settings.platformName}
        liveName={full.live.name}
        brandName={full.live.brandName}
        durationMin={started && ended ? Math.max(1, Math.round((ended.getTime() - started.getTime()) / 60000)) : null}
        deadline={settings.invoiceDeadline}
        order={order}
        summarySentTo={order && order.lines.length && company.notifyEmail ? company.email : null}
      />
    );
  }

  const steps = ['Cadastre sua empresa', 'Confirme o código no e-mail', 'Entre e registre pedidos'];
  return (
    <main className="box-border flex min-h-[100dvh] flex-col gap-3 p-3 lg:h-screen lg:min-h-[800px] lg:flex-row lg:gap-4 lg:p-4">
      <section className="anim-fade box-border flex flex-col gap-[14px] rounded-[26px] bg-dark p-[22px] text-white lg:w-[540px] lg:shrink-0 lg:gap-6 lg:rounded-panel lg:p-10">
        <div className="lg:hidden"><Logo name={settings.platformName} dark small /></div>
        <div className="hidden lg:block"><Logo name={settings.platformName} dark /></div>
        <div className="hidden flex-grow lg:block" />
        <div className="flex gap-[6px] lg:gap-2">
          <span className="rounded-full bg-accent px-[10px] py-[5px] text-[12px] font-medium text-ink lg:px-3 lg:py-[6px] lg:text-[13px]">{weekdayDate(live.startsAt)}</span>
          <span className="rounded-full border border-solid border-dark-line px-[10px] py-[5px] text-[12px] text-[#D5D8DE] lg:px-3 lg:py-[6px] lg:text-[13px]">{timeRange(live.startsAt, live.endsAt)}</span>
        </div>
        <h1 className="text-[32px] font-medium leading-[1.05] tracking-[-0.04em] lg:text-[52px] lg:leading-[1.02] lg:tracking-[-0.045em]">{live.name}</h1>
        <p className="m-0 text-[14px] leading-[1.5] text-dark-muted lg:hidden">
          {live.status === 'ended' ? 'Esta live já terminou. Entre para ver o resumo dos seus pedidos.' : 'Assista e registre os pedidos da sua loja na hora, sem pagar agora.'}
        </p>
        <p className="m-0 hidden max-w-[420px] text-[16px] leading-[1.55] text-dark-muted lg:block">
          {live.status === 'ended'
            ? `Esta live da ${live.brandName} já terminou. Entre com o seu e-mail para ver o resumo dos seus pedidos.`
            : `Assista à apresentação da ${live.brandName} e registre os pedidos de estoque da sua loja na hora, sem pagar agora.`}
        </p>
        <ol className="m-0 hidden list-none grid-cols-3 gap-[10px] p-0 pt-2 lg:grid">
          {steps.map((s, i) => (
            <li key={s} className="flex flex-col gap-[10px] rounded-[18px] bg-dark-2 p-4">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold ${i === 0 ? 'bg-accent text-ink' : 'bg-dark-3'}`}>{i + 1}</span>
              <span className="text-[13px] leading-[1.4] text-[#D5D8DE]">{s}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="anim-in-late box-border flex flex-grow flex-col rounded-[26px] bg-surface p-[22px] lg:items-center lg:justify-center lg:rounded-panel lg:p-0">
        <SignupForm slug={live.slug} />
      </section>
    </main>
  );
}
