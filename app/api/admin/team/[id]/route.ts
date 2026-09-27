import { NextResponse } from 'next/server';
import { and, count, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { apiError } from '@/lib/api';
import { requireAdminApi } from '@/lib/admin-api';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi('team:write');
  if (admin instanceof Response) return admin;
  const { id } = await params;
  if (id === admin.id) return apiError('self', 'Você não pode remover a si mesma.', 400);
  const [member] = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.id, id));
  if (!member) return apiError('not_found', 'Pessoa não encontrada.', 404);
  if (member.role === 'owner') {
    const [{ n }] = await db.select({ n: count() }).from(schema.adminUsers).where(eq(schema.adminUsers.role, 'owner'));
    if (n <= 1) return apiError('last_owner', 'A equipe precisa de pelo menos uma dona.', 400);
  }
  await db.transaction(async (tx) => {
    await tx.delete(schema.sessions).where(and(eq(schema.sessions.adminUserId, id)));
    await tx.delete(schema.loginLinks).where(eq(schema.loginLinks.adminUserId, id));
    await tx.delete(schema.adminUsers).where(eq(schema.adminUsers.id, id));
  });
  return NextResponse.json({ ok: true });
}
