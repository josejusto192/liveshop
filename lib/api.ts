import { NextResponse } from 'next/server';

// Respostas de erro: { error: { code, message } } com a mensagem pronta em pt-BR.
export function apiError(code: string, message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

export function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  const ip = fwd?.split(',')[0]?.trim() || req.headers.get('x-real-ip');
  return ip && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : null;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}
