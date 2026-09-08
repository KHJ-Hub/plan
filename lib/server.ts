import { getRuntimeEnv } from '@/db';

const encoder = new TextEncoder();

function base64url(value: Uint8Array | string) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return atob(padded);
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

function secret() {
  const env = getRuntimeEnv();
  return env.SESSION_SECRET || env.ADMIN_PASSWORD || 'local-development-session-only';
}

export type Session = { role: 'admin' | 'student'; actor: string; studentId?: string; exp: number };

export async function createSession(payload: Omit<Session, 'exp'>) {
  const body = base64url(JSON.stringify({ ...payload, exp: Date.now() + 8 * 60 * 60 * 1000 }));
  return `${body}.${await sign(body, secret())}`;
}

export async function readSession(request: Request): Promise<Session | null> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  const [body, signature] = token.split('.');
  if (!body || !signature || await sign(body, secret()) !== signature) return null;
  try {
    const session = JSON.parse(decodeBase64url(body)) as Session;
    return session.exp > Date.now() ? session : null;
  } catch { return null; }
}

export async function requireSession(request: Request, role?: Session['role']) {
  const session = await readSession(request);
  if (!session || (role && session.role !== role)) throw new Response('로그인이 필요합니다.', { status: 401 });
  return session;
}

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { 'Cache-Control': 'no-store', ...init?.headers } });
}

export function now() { return new Date().toISOString(); }
export function id(prefix: string) { return `${prefix}_${crypto.randomUUID()}`; }
