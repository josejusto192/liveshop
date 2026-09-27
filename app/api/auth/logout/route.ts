import { NextResponse } from 'next/server';
import { readJson } from '@/lib/api';
import { destroySession } from '@/lib/auth';

export async function POST(req: Request) {
  const body = await readJson(req);
  await destroySession(body.subject === 'admin' ? 'admin' : 'company');
  return NextResponse.json({ ok: true });
}
