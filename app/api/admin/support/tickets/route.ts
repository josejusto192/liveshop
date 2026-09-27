import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-api';
import { adminTickets, type TicketStatus } from '@/lib/support';

// ?status=open|answered|closed (padrão: abertos)
export async function GET(req: Request) {
  const admin = await requireAdminApi('support:write');
  if (admin instanceof Response) return admin;
  const s = new URL(req.url).searchParams.get('status');
  const statuses: TicketStatus[] = s === 'answered' || s === 'closed' ? [s] : s === 'all' ? ['open', 'answered', 'closed'] : ['open'];
  return NextResponse.json({ tickets: await adminTickets(statuses) });
}
