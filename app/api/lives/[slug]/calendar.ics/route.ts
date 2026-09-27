import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { liveIdBySlug } from '@/lib/buyer-live';
import { getPublicLive } from '@/lib/lives';

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

// "Adicionar à agenda": arquivo .ics com o horário da live e o link.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const l = await liveIdBySlug(slug);
  const live = l ? await getPublicLive(slug) : null;
  if (!l || !live) return new Response('Live não encontrada', { status: 404 });
  const [settings] = await db.select({ name: schema.settings.platformName }).from(schema.settings).where(eq(schema.settings.id, 1));
  const url = `${(process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')}/l/${slug}`;
  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${esc(settings?.name ?? 'Live Shop')}//Lives//PT-BR`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${l.id}@liveshop`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(live.startsAt)}`,
    `DTEND:${icsDate(live.endsAt)}`,
    `SUMMARY:${esc(`${live.name} · ${live.brandName}`)}`,
    `DESCRIPTION:${esc(`Live de ${live.brandName}. Entre pelo link: ${url}`)}`,
    `URL:${url}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(live.name)} começa em 15 minutos`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
  return new Response(body, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="${slug}.ics"` },
  });
}
