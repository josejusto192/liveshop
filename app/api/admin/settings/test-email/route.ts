import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api';
import { requireAdminApi } from '@/lib/admin-api';
import { sendMail } from '@/lib/mail';
import { getSettings } from '@/lib/settings';

export async function POST() {
  const admin = await requireAdminApi('settings:write');
  if (admin instanceof Response) return admin;
  const s = await getSettings();
  const subject = (s.mailSubject || 'Seu código para entrar na live: {código}').replace('{código}', '123456');
  try {
    await sendMail({
      to: admin.email,
      from: s.mailFromEmail ? `${s.mailFromName || s.platformName} <${s.mailFromEmail}>` : undefined,
      subject,
      text: `E-mail de teste do ${s.platformName}. O código de exemplo é 123456 e vale por ${s.otpTtlMin} minutos.`,
    });
  } catch {
    return apiError('mail_failed', 'Não foi possível enviar o e-mail de teste. Confira a chave do Resend.', 502);
  }
  return NextResponse.json({ ok: true, to: admin.email });
}
