// Cria (ou promove) uma pessoa da agência como dona do painel. Uso em produção, depois do primeiro deploy:
//   pnpm admin:create dona@agencia.com.br "Nome da pessoa"
import 'dotenv/config';

async function main() {
  const [email, ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(' ').trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Uso: pnpm admin:create email@agencia.com.br "Nome"');
  const { db, schema, sqlClient } = await import('../lib/db');
  const { getSettings } = await import('../lib/settings');
  await getSettings(); // garante a linha de configurações
  const [u] = await db
    .insert(schema.adminUsers)
    .values({ email: email.trim().toLowerCase(), name: name || email.split('@')[0], role: 'owner' })
    .onConflictDoUpdate({ target: schema.adminUsers.email, set: { role: 'owner', ...(name ? { name } : {}) } })
    .returning();
  console.log(`Pronto: ${u.email} é dona do painel. Entre em ${process.env.APP_URL || 'http://localhost:3000'}/admin com esse e-mail.`);
  await sqlClient.end();
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
