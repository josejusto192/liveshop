// pnpm stream:test [--live <slug ou id>] [--format vertical|horizontal] [--file video.mp4] [--seconds 0]
// Publica um vídeo de teste em loop no MediaMTX local (sem câmera), com o mesmo token que a tela Transmitir usa.
// Usa o FFmpeg instalado na máquina; se não houver, usa o FFmpeg do container do MediaMTX (docker compose).
import 'dotenv/config';
import { spawn, spawnSync } from 'node:child_process';
import { and, eq, inArray, or } from 'drizzle-orm';

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const { db, schema, sqlClient } = await import('../lib/db');
  const { signPublishToken } = await import('../lib/publish-token');
  const which = arg('live');
  const isUuid = which && /^[0-9a-f-]{36}$/.test(which);
  const [live] = await db
    .select()
    .from(schema.lives)
    .where(
      which
        ? isUuid
          ? or(eq(schema.lives.id, which), eq(schema.lives.slug, which))
          : eq(schema.lives.slug, which)
        : inArray(schema.lives.status, ['live', 'scheduled']),
    )
    .orderBy(schema.lives.startsAt)
    .limit(1);
  if (!live) throw new Error('Nenhuma live agendada ou no ar. Crie uma live (ou rode pnpm db:seed).');
  if (live.status !== 'scheduled' && live.status !== 'live') throw new Error(`A live "${live.name}" está ${live.status}: só dá para transmitir em live agendada ou no ar.`);
  const [owner] = await db
    .select()
    .from(schema.adminUsers)
    .where(and(inArray(schema.adminUsers.role, ['owner', 'operator'])))
    .limit(1);
  if (!owner) throw new Error('Nenhuma pessoa dona/operadora cadastrada.');
  await sqlClient.end();

  const format = (arg('format') as 'vertical' | 'horizontal' | undefined) ?? live.format;
  const size = format === 'vertical' ? '720x1280' : '1280x720';
  const { token } = signPublishToken(live, owner.id, Date.now(), 12 * 3600);
  const rtspBase = (process.env.MEDIAMTX_RTSP_URL || 'rtsp://localhost:8554').replace(/\/$/, '');
  const target = `${rtspBase.replace('rtsp://', `rtsp://publisher:${token}@`)}/live/${live.id}`;
  const file = arg('file');
  const seconds = Number(arg('seconds') ?? 0);

  const input = file
    ? ['-re', '-stream_loop', '-1', '-i', file]
    : ['-re', '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30`, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:beep_factor=4'];
  const scale = file ? ['-vf', `scale=${size.replace('x', ':')}:force_original_aspect_ratio=increase,crop=${size.replace('x', ':')}`] : [];
  const args = [
    '-hide_banner', '-loglevel', 'warning',
    ...input,
    ...scale,
    ...(seconds > 0 ? ['-t', String(seconds)] : []),
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-profile:v', 'baseline', '-pix_fmt', 'yuv420p',
    '-g', '60', '-b:v', '2500k', '-maxrate', '2500k', '-bufsize', '5000k',
    '-c:a', 'libopus', '-b:a', '96k', '-ar', '48000', '-ac', '2',
    '-f', 'rtsp', '-rtsp_transport', 'tcp', target,
  ];

  const hasLocal = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
  console.log(`Transmitindo teste ${format} (${size}) para "${live.name}" · live/${live.id}`);
  console.log(`Assista: ${(process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')}/l/${live.slug}   (Ctrl+C para parar)`);
  const child = hasLocal
    ? spawn('ffmpeg', args, { stdio: 'inherit' })
    : spawn('docker', ['compose', 'exec', '-T', 'mediamtx', 'ffmpeg', ...args.map((a) => a.replace('localhost', 'localhost'))], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
  process.on('SIGINT', () => child.kill('SIGINT'));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
