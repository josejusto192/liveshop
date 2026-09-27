import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { apiError, readJson } from '@/lib/api';
import { getCompany } from '@/lib/auth';
import { liveIdBySlug } from '@/lib/buyer-live';
import { db, schema } from '@/lib/db';
import { setStockAlert } from '@/lib/orders';

// "Avisar se voltar ao estoque": { productId } liga; DELETE com { productId } desliga.
async function handle(req: Request, slug: string, on: boolean) {
  const company = await getCompany();
  if (!company) return apiError('unauthorized', 'Entre com o código.', 401);
  const l = await liveIdBySlug(slug);
  if (!l) return apiError('not_found', 'Live não encontrada.', 404);
  const b = await readJson(req);
  if (typeof b.productId !== 'string') return apiError('invalid', 'Produto inválido.');
  const [inLive] = await db
    .select({ id: schema.liveItems.id })
    .from(schema.liveItems)
    .where(and(eq(schema.liveItems.liveId, l.id), eq(schema.liveItems.productId, b.productId)));
  if (!inLive) return apiError('invalid', 'Produto não está nesta live.');
  await setStockAlert(b.productId, company.id, on);
  return NextResponse.json({ ok: true, on });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(req, (await params).slug, true);
}
export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(req, (await params).slug, false);
}
