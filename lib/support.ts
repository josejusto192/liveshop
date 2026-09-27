// Chamados de suporte (docs/03: assunto, pedido opcional, mensagem; aberto → respondido → fechado).
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from './db';
import { sendMail } from './mail';

export const TICKET_SUBJECTS = ['Dúvida sobre pedido', 'Fatura e pagamento', 'Entrega', 'Acesso à live'] as const;
export const TICKET_STATUS_LABEL: Record<string, string> = { open: 'Aberto', answered: 'Respondido', closed: 'Fechado' };
export type TicketStatus = 'open' | 'answered' | 'closed';

export async function companyTickets(companyId: string) {
  const rows = await db
    .select({ t: schema.supportTickets, orderCode: schema.orders.code })
    .from(schema.supportTickets)
    .leftJoin(schema.orders, eq(schema.orders.id, schema.supportTickets.orderId))
    .where(eq(schema.supportTickets.companyId, companyId))
    .orderBy(desc(schema.supportTickets.createdAt))
    .limit(50);
  return rows.map(({ t, orderCode }) => ({
    id: t.id,
    subject: t.subject,
    message: t.message,
    status: t.status as TicketStatus,
    orderCode,
    createdAt: t.createdAt.toISOString(),
    answeredAt: t.answeredAt?.toISOString() ?? null,
  }));
}
export type CompanyTicket = Awaited<ReturnType<typeof companyTickets>>[number];

type CreateInput = { subject?: unknown; orderId?: unknown; message?: unknown };
export type CreateResult = { ok: true; ticket: CompanyTicket } | { ok: false; code: string; message: string; fields?: Record<string, string> };

export async function createTicket(company: { id: string; name: string; email: string; whatsapp: string }, input: CreateInput): Promise<CreateResult> {
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const message = typeof input.message === 'string' ? input.message.trim() : '';
  const orderId = typeof input.orderId === 'string' && input.orderId ? input.orderId : null;
  const fields: Record<string, string> = {};
  if (!(TICKET_SUBJECTS as readonly string[]).includes(subject)) fields.subject = 'Escolha o assunto.';
  if (message.length < 5) fields.message = 'Conte o que aconteceu.';
  if (message.length > 2000) fields.message = 'Use no máximo 2.000 caracteres.';
  let orderCode: string | null = null;
  if (orderId) {
    const [o] = await db
      .select({ code: schema.orders.code })
      .from(schema.orders)
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.companyId, company.id)))
      .catch(() => []);
    if (!o) fields.orderId = 'Pedido não encontrado.';
    else orderCode = o.code;
  }
  if (Object.keys(fields).length) return { ok: false, code: 'invalid', message: Object.values(fields)[0], fields };

  const [t] = await db.insert(schema.supportTickets).values({ companyId: company.id, orderId, subject, message }).returning();
  const to = process.env.SUPPORT_EMAIL;
  if (to) {
    await sendMail({
      to,
      subject: `Novo chamado: ${subject}${orderCode ? ` · pedido ${orderCode}` : ''}`,
      text: `${company.name} abriu um chamado.\n\nAssunto: ${subject}\n${orderCode ? `Pedido: ${orderCode}\n` : ''}E-mail: ${company.email}\nWhatsApp: ${company.whatsapp}\n\n${message}\n\nResponda por e-mail ou WhatsApp e marque como respondido no painel.`,
    }).catch((e) => console.error('[suporte] aviso por e-mail falhou', e));
  }
  return {
    ok: true,
    ticket: { id: t.id, subject, message, status: 'open', orderCode, createdAt: t.createdAt.toISOString(), answeredAt: null },
  };
}

/** Chamados para a agência (sininho da Visão geral): abertos primeiro. */
export async function adminTickets(statuses: TicketStatus[] = ['open'], limit = 50) {
  const rows = await db
    .select({ t: schema.supportTickets, company: schema.companies.name, email: schema.companies.email, whatsapp: schema.companies.whatsapp, orderCode: schema.orders.code, orderId: schema.orders.id })
    .from(schema.supportTickets)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.supportTickets.companyId))
    .leftJoin(schema.orders, eq(schema.orders.id, schema.supportTickets.orderId))
    .where(inArray(schema.supportTickets.status, statuses))
    .orderBy(desc(schema.supportTickets.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.t.id,
    subject: r.t.subject,
    message: r.t.message,
    status: r.t.status as TicketStatus,
    createdAt: r.t.createdAt.toISOString(),
    company: r.company,
    email: r.email,
    whatsapp: r.whatsapp,
    orderCode: r.orderCode,
    orderId: r.orderId,
  }));
}
export type AdminTicket = Awaited<ReturnType<typeof adminTickets>>[number];

export async function setTicketStatus(id: string, status: TicketStatus, now = new Date()) {
  if (!['open', 'answered', 'closed'].includes(status)) return false;
  const res = await db
    .update(schema.supportTickets)
    .set({ status, answeredAt: status === 'open' ? null : now })
    .where(eq(schema.supportTickets.id, id))
    .returning({ id: schema.supportTickets.id })
    .catch(() => []);
  return res.length > 0;
}
