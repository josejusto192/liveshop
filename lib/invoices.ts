// Faturas em PDF: guardadas como upload privado (a rota pública de uploads não serve PDF).
import { apiError } from './api';
import { readUpload } from './uploads';

export async function invoiceResponse(code: string, invoiceUrl: string | null, disposition: 'inline' | 'attachment') {
  const name = invoiceUrl?.match(/\/api\/uploads\/([0-9a-f-]{36}\.pdf)$/)?.[1];
  const data = name ? await readUpload(name) : null;
  if (!data) return apiError('no_invoice', 'Fatura ainda não emitida.', 403);
  const file = `fatura-${code.replace('#', '')}.pdf`;
  return new Response(new Uint8Array(data), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `${disposition}; filename="${file}"`, 'Cache-Control': 'private, no-store' },
  });
}
