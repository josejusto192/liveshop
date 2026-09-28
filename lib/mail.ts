// Envio de e-mail via API HTTP do Resend (sem dependência extra).
// Sem RESEND_API_KEY o e-mail é impresso no terminal (desenvolvimento).
export type MailAttachment = { filename: string; content: Buffer };
export type Mail = { to: string; subject: string; text: string; html?: string; from?: string; attachments?: MailAttachment[] };

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
    const files = mail.attachments?.map((a) => `${a.filename} (${Math.ceil(a.content.length / 1024)} KB)`).join(', ');
    console.log(`\n[e-mail] para: ${mail.to}\n[e-mail] assunto: ${mail.subject}${files ? `\n[e-mail] anexo: ${files}` : ''}\n${mail.text}\n`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      attachments: mail.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })),
    }),
  });
  if (!res.ok) throw new Error(`Falha ao enviar e-mail (${res.status}): ${await res.text()}`);
}

/** Remetente configurado no painel (Configurações › E-mail), ou o MAIL_FROM do servidor. */
export function senderFrom(s: { mailFromEmail: string | null; mailFromName: string | null; platformName: string }) {
  return s.mailFromEmail ? `${s.mailFromName || s.platformName} <${s.mailFromEmail}>` : undefined;
}

export const appUrl = (path = '') => `${(process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')}${path}`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** HTML simples e legível em qualquer cliente de e-mail (parágrafos, tabela opcional e um botão). */
export function mailHtml(o: { title: string; paragraphs: string[]; table?: { head: string[]; rows: string[][]; foot?: string[] }; button?: { label: string; href: string }; footer?: string }) {
  const td = 'padding:8px 10px;border-bottom:1px solid #F1F2F4;font-size:14px;';
  const table = o.table
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr>${o.table.head.map((h, i) => `<th style="${td}color:#6B6F76;font-weight:500;text-align:${i ? 'right' : 'left'}">${esc(h)}</th>`).join('')}</tr>
        ${o.table.rows.map((r) => `<tr>${r.map((c, i) => `<td style="${td}text-align:${i ? 'right' : 'left'}">${esc(c)}</td>`).join('')}</tr>`).join('')}
        ${o.table.foot ? `<tr>${o.table.foot.map((c, i) => `<td style="${td}font-weight:600;text-align:${i ? 'right' : 'left'}">${esc(c)}</td>`).join('')}</tr>` : ''}
      </table>`
    : '';
  const button = o.button
    ? `<p style="margin:22px 0"><a href="${esc(o.button.href)}" style="display:inline-block;background:#111214;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:500">${esc(o.button.label)}</a></p>`
    : '';
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#EDEEF0;font-family:Arial,Helvetica,sans-serif;color:#111214">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:#ffffff;border-radius:20px;padding:28px">
      <h1 style="font-size:22px;font-weight:600;margin:0 0 12px">${esc(o.title)}</h1>
      ${o.paragraphs.map((p) => `<p style="font-size:15px;line-height:1.55;margin:0 0 10px;color:#44474D">${esc(p)}</p>`).join('')}
      ${table}${button}
    </div>
    ${o.footer ? `<p style="font-size:12px;color:#6B6F76;text-align:center;margin:16px 0 0">${esc(o.footer)}</p>` : ''}
  </div></body></html>`;
}
