import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { apiError } from '@/lib/api';
import { requireAdminApi } from '@/lib/admin-api';
import { importProducts, readSheet } from '@/lib/products';

// multipart: file (.xlsx ou .csv), brandId
export async function POST(req: Request) {
  const admin = await requireAdminApi('products:write');
  if (admin instanceof Response) return admin;
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const brandId = String(form?.get('brandId') ?? '');
  if (!(file instanceof File)) return apiError('required', 'Envie uma planilha .xlsx ou .csv.');
  if (!/\.(xlsx|csv)$/i.test(file.name)) return apiError('invalid_file', 'Formato não aceito. Envie .xlsx ou .csv.');
  if (file.size > 10 * 1024 * 1024) return apiError('too_large', 'Planilha maior que 10 MB.');
  const [brand] = await db.select({ id: schema.brands.id }).from(schema.brands).where(eq(schema.brands.id, brandId));
  if (!brand) return apiError('invalid', 'Marca não encontrada.');

  let rows;
  try {
    rows = await readSheet({ name: file.name, data: Buffer.from(await file.arrayBuffer()) });
  } catch {
    return apiError('invalid_file', 'Não foi possível ler a planilha. Confira o arquivo.');
  }
  const report = await importProducts(brandId, rows);
  return NextResponse.json({ report });
}
