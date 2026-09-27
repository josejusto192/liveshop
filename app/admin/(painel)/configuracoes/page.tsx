import { sql } from 'drizzle-orm';
import { requireAdminPage } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { TZ } from '@/lib/dates';
import { ConfigView, type Tab } from './ConfigView';

const TABS: Tab[] = ['geral', 'transmissao', 'email', 'equipe'];

export default async function ConfiguracoesPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const admin = await requireAdminPage('settings:write');
  const { aba } = await searchParams;
  const [settings, team, [usage]] = await Promise.all([
    getSettings(),
    db.select().from(schema.adminUsers).orderBy(schema.adminUsers.createdAt),
    db.execute<{ emails: number; live_s: number }>(sql`
      select
        (select count(*)::int from otp_codes where date_trunc('month', created_at at time zone ${TZ}) = date_trunc('month', now() at time zone ${TZ})) as emails,
        (select coalesce(sum(extract(epoch from (coalesce(ended_at, now()) - started_at))), 0)::int from lives
          where started_at is not null and date_trunc('month', started_at at time zone ${TZ}) = date_trunc('month', now() at time zone ${TZ})) as live_s
    `),
  ]);
  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  return (
    <ConfigView
      initialTab={TABS.includes(aba as Tab) ? (aba as Tab) : 'geral'}
      settings={settings}
      env={{ domain: new URL(appUrl).host, whip: process.env.WHIP_BASE_URL || '', hls: process.env.HLS_BASE_URL || '' }}
      team={team.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role }))}
      meId={admin.id}
      usage={{ emails: usage?.emails ?? 0, liveHours: Math.round((usage?.live_s ?? 0) / 3600) }}
    />
  );
}
