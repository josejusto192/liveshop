import { NextResponse } from 'next/server';
import { apiError, readJson } from '@/lib/api';
import { getCompany } from '@/lib/auth';
import { companyTickets, createTicket } from '@/lib/support';

export async function GET() {
  const company = await getCompany();
  if (!company) return apiError('unauthorized', 'Entre com o código.', 401);
  return NextResponse.json({ tickets: await companyTickets(company.id) });
}

// { subject, orderId?, message }
export async function POST(req: Request) {
  const company = await getCompany();
  if (!company) return apiError('unauthorized', 'Entre com o código.', 401);
  const r = await createTicket(company, await readJson(req));
  if (!r.ok) return apiError(r.code, r.message, 400, { fields: r.fields });
  return NextResponse.json({ ticket: r.ticket }, { status: 201 });
}
