import Link from 'next/link';
import { Logo } from '@/components/Logo';
import type { BuyerOrderDetail } from '@/lib/buyer-orders';
import { formatBRL, formatInt } from '@/lib/money';
import { CheckIcon, ProductImage } from './parts';

type Props = {
  platformName: string;
  liveName: string;
  brandName: string;
  durationMin: number | null;
  deadline: string;
  order: BuyerOrderDetail | null;
  summarySentTo: string | null;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Live encerrada (LiveEncerrada / LiveEncerradaMobile): resumo dos pedidos e próximos passos. */
export function LiveEnded(p: Props) {
  const has = !!p.order && p.order.lines.length > 0;
  const o = p.order;
  const count = o ? `${o.lines.length} ${o.lines.length === 1 ? 'produto' : 'produtos'}` : '';
  const pdfHref = o ? `/api/me/orders/${o.order.id}/summary.pdf` : '#';
  const accountHref = has ? `/conta?pedido=${o!.order.id}` : '/conta';
  const lead = has
    ? `Seus pedidos foram enviados para a ${p.brandName}. Você recebe a fatura por e-mail, sem precisar fazer mais nada agora.`
    : `Você não registrou pedidos nesta live. Fique de olho nas próximas lives da ${p.brandName}.`;

  return (
    <>
      {/* Desktop */}
      <main className="box-border hidden h-screen min-h-[720px] gap-4 bg-bg p-4 lg:flex">
        <section className="anim-in on-dark box-border flex flex-grow flex-col gap-[22px] rounded-panel bg-dark p-12 text-white">
          <Logo name={p.platformName} dark />
          <div className="flex-grow" />
          <span className="self-start rounded-full bg-dark-3 px-3 py-[5px] text-[12px] font-medium text-dark-muted">
            Encerrada{p.durationMin ? ` · durou ${formatInt(p.durationMin)} min` : ''}
          </span>
          <h1 className="text-[60px] font-medium leading-[1.02] tracking-[-0.045em]">
            A live terminou.
            <br />
            Obrigado por participar.
          </h1>
          <p className="m-0 max-w-[520px] text-[17px] leading-[1.55] text-dark-muted">{lead}</p>
          {has && (
            <ol className="m-0 grid max-w-[720px] list-none grid-cols-3 gap-3 p-0 pt-[10px]">
              <li className="flex flex-col gap-[10px] rounded-[20px] bg-dark-2 p-[18px]">
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-accent"><CheckIcon size={14} width={2.6} /></span>
                <span className="text-[14px] font-medium">Pedidos enviados</span>
                <span className="text-[12px] text-dark-muted">Agora mesmo</span>
              </li>
              <li className="flex flex-col gap-[10px] rounded-[20px] bg-dark-2 p-[18px]">
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-dark-3 text-[13px] font-semibold">2</span>
                <span className="text-[14px] font-medium">Fatura por e-mail</span>
                <span className="text-[12px] text-dark-muted">{cap(p.deadline)}</span>
              </li>
              <li className="flex flex-col gap-[10px] rounded-[20px] bg-dark-2 p-[18px]">
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-dark-3 text-[13px] font-semibold">3</span>
                <span className="text-[14px] font-medium">Pagamento e entrega</span>
                <span className="text-[12px] text-dark-muted">Combinados com a marca</span>
              </li>
            </ol>
          )}
        </section>
        <aside className="anim-in-late box-border flex w-[460px] shrink-0 flex-col gap-4 rounded-panel bg-white p-[26px]">
          <h2 className="text-[20px] font-medium tracking-[-0.02em]">Resumo dos seus pedidos</h2>
          {has && o ? (
            <>
              <div className="flex items-center justify-between rounded-[20px] bg-surface-2 px-5 py-[18px]">
                <span className="flex flex-col gap-[2px]">
                  <span className="text-[12px] text-muted">Valor estimado · {count}</span>
                  <span className="text-[32px] font-medium tracking-[-0.04em] tabular">{formatBRL(o.totalCents)}</span>
                </span>
                <span className="rounded-full bg-ink px-3 py-[6px] text-[13px] text-accent">{formatInt(o.totalUnits)} un.</span>
              </div>
              <ul className="m-0 min-h-0 list-none overflow-y-auto p-0">
                {o.lines.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 border-t border-solid border-line-2 py-3">
                    <ProductImage item={l} className="h-11 w-11 shrink-0" rounded="rounded-xl" label={false} />
                    <span className="flex min-w-0 flex-grow flex-col gap-[2px]">
                      <span className="truncate text-[14px] font-medium">{l.name}</span>
                      <span className="text-[12px] text-muted">{formatInt(l.qty)} un. × {formatBRL(l.unitPriceCents)}</span>
                    </span>
                    <span className="text-[14px] font-medium tabular">{formatBRL(l.subtotalCents)}</span>
                  </li>
                ))}
              </ul>
              <span className="text-[12px] leading-[1.5] text-muted">
                Valores de atacado. Frete e impostos vêm na fatura.{p.summarySentTo ? ` Enviamos este resumo para ${p.summarySentTo}.` : ''}
              </span>
            </>
          ) : (
            <p className="m-0 text-[14px] text-muted">Nenhum pedido registrado nesta live.</p>
          )}
          <div className="flex-grow" />
          {has && (
            <a href={pdfHref} className="flex h-[54px] items-center justify-center rounded-full bg-ink text-[15px] font-medium text-white no-underline">Baixar resumo em PDF</a>
          )}
          <Link href={accountHref} className="flex h-[50px] items-center justify-center rounded-full border border-solid border-line text-[14px] text-ink no-underline">Acompanhar meus pedidos</Link>
        </aside>
      </main>

      {/* Celular */}
      <main className="on-dark relative box-border flex min-h-[100dvh] flex-col gap-4 bg-dark px-4 pb-4 pt-6 text-white lg:hidden">
        <div className="anim-in flex flex-col gap-3 px-[6px]">
          <span className="self-start rounded-full bg-dark-3 px-[10px] py-1 text-[11px] font-medium text-dark-muted">Live encerrada</span>
          <h1 className="text-[34px] font-medium leading-[1.05] tracking-[-0.04em]">Obrigado por participar.</h1>
          <p className="m-0 text-[14px] leading-[1.5] text-dark-muted">{has ? `Seus pedidos foram enviados para a ${p.brandName}. A fatura chega por e-mail.` : lead}</p>
        </div>
        <div className="anim-in-late box-border flex min-h-0 flex-grow flex-col gap-[10px] rounded-card-lg bg-white p-4 text-ink">
          {has && o ? (
            <>
              <div className="flex items-center justify-between rounded-[18px] bg-dark px-4 py-[14px] text-white">
                <span className="flex flex-col gap-[2px]">
                  <span className="text-[12px] text-dark-muted">Valor estimado</span>
                  <span className="text-[12px]">{formatInt(o.totalUnits)} un.</span>
                </span>
                <span className="text-[24px] font-medium tracking-[-0.03em] text-accent tabular">{formatBRL(o.totalCents)}</span>
              </div>
              {o.lines.map((l) => (
                <div key={l.id} className="flex items-center gap-[10px] border-t border-solid border-line-2 py-2">
                  <ProductImage item={l} className="h-[38px] w-[38px] shrink-0" rounded="rounded-[10px]" label={false} />
                  <span className="flex min-w-0 flex-grow flex-col gap-px">
                    <span className="truncate text-[13px] font-medium">{l.name}</span>
                    <span className="text-[11px] text-muted">{formatInt(l.qty)} un. × {formatBRL(l.unitPriceCents)}</span>
                  </span>
                  <span className="text-[13px] font-medium tabular">{formatBRL(l.subtotalCents)}</span>
                </div>
              ))}
              <div className="flex flex-col gap-2 pt-[6px]">
                <span className="flex items-center gap-2 text-[12px]">
                  <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent"><CheckIcon size={9} width={3} /></span>
                  Pedidos enviados para a marca
                </span>
                <span className="flex items-center gap-2 text-[12px] text-muted">
                  <span className="h-[18px] w-[18px] rounded-full bg-line-2" />
                  Fatura por e-mail {p.deadline}
                </span>
              </div>
              <div className="flex-grow" />
              <a href={pdfHref} className="flex h-[52px] items-center justify-center rounded-full bg-ink text-[14px] font-medium text-white no-underline">Baixar resumo em PDF</a>
            </>
          ) : (
            <p className="m-0 text-[14px] text-muted">Nenhum pedido registrado nesta live.</p>
          )}
        </div>
        <Link href={accountHref} className="flex h-12 items-center justify-center rounded-full border border-solid border-dark-line text-[14px] text-white no-underline">Acompanhar meus pedidos</Link>
      </main>
    </>
  );
}
