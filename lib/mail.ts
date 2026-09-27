// Envio de e-mail via API HTTP do Resend (sem dependência extra).
// Sem RESEND_API_KEY o e-mail é impresso no terminal (desenvolvimento).
export type Mail = { to: string; subject: string; text: string; html?: string; from?: string };

// Caixa de saída em memória usada pelos testes.
export const testOutbox: Mail[] = [];

export async function sendMail(mail: Mail): Promise<void> {
  const from = mail.from || process.env.MAIL_FROM || 'Live Shop <acesso@localhost>';
  if (process.env.NODE_ENV === 'test') {
    testOutbox.push({ ...mail, from });
    return;
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`\n[e-mail] para: ${mail.to}\n[e-mail] assunto: ${mail.subject}\n${mail.text}\n`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (!res.ok) throw new Error(`Falha ao enviar e-mail (${res.status}): ${await res.text()}`);
}
