import { getDatabase, getRuntimeEnv } from '@/db';

const encoder = new TextEncoder();
// Cloudflare Workers WebCrypto는 PBKDF2 반복 횟수를 100,000 이하로 제한합니다.
const PBKDF2_ITERATIONS = 100_000;
const DEFAULT_STATE_ID = 'teacher-login';

type TeacherAuthRow = {
  password_hash: string | null;
  password_salt: string | null;
  password_iterations: number | null;
  session_version: number;
};

function toBase64(value: Uint8Array) {
  let binary = '';
  value.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function hashPassword(password: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as unknown as BufferSource, iterations }, key, 256);
  return toBase64(new Uint8Array(bits));
}

async function currentState() {
  return getDatabase().prepare(`SELECT password_hash,password_salt,password_iterations,session_version FROM teacher_auth_state WHERE id=?`).bind(DEFAULT_STATE_ID).first<TeacherAuthRow>();
}

function environmentPassword() {
  return getRuntimeEnv().ADMIN_PASSWORD || '';
}

export async function verifyTeacherPassword(password: string) {
  const state = await currentState();
  if (state?.password_hash && state.password_salt && state.password_iterations) {
    const candidate = await hashPassword(password, fromBase64(state.password_salt), state.password_iterations);
    return { valid: secureEqual(candidate, state.password_hash), sessionVersion: state.session_version };
  }
  const configured = environmentPassword();
  return { valid: Boolean(configured) && secureEqual(password, configured), sessionVersion: state?.session_version || 0 };
}

export async function getTeacherSessionVersion() {
  return (await currentState())?.session_version || 0;
}

export async function changeTeacherPassword(currentPassword: string, nextPassword: string, actor: string) {
  if (!nextPassword) return { ok: false as const, error: '새 비밀번호를 입력해주세요.' };
  const verified = await verifyTeacherPassword(currentPassword);
  if (!verified.valid) return { ok: false as const, error: '현재 비밀번호가 맞지 않습니다.' };
  const salt = crypto.getRandomValues(new Uint8Array(24));
  const passwordHash = await hashPassword(nextPassword, salt);
  const nextVersion = verified.sessionVersion + 1;
  const time = new Date().toISOString();
  await getDatabase().prepare(`INSERT INTO teacher_auth_state(id,password_hash,password_salt,password_iterations,session_version,updated_by,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash,password_salt=excluded.password_salt,password_iterations=excluded.password_iterations,session_version=excluded.session_version,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(DEFAULT_STATE_ID, passwordHash, toBase64(salt), PBKDF2_ITERATIONS, nextVersion, actor, time).run();
  return { ok: true as const, sessionVersion: nextVersion };
}
