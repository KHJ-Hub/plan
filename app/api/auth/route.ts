import { getDatabase } from '@/db';
import { checkAuthRateLimit, clearAuthIdentityFailure, createAuthRateLimitKeys, recordAuthFailure } from '@/lib/auth-rate-limit.mjs';
import { createSession, json } from '@/lib/server';
import { verifyTeacherPassword } from '@/lib/teacher-auth';

const limitedResponse = (retryAfterSeconds: number) => json(
  { error: '로그인 시도가 여러 번 실패했습니다. 잠시 후 다시 시도해주세요.' },
  { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
);

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: '로그인 입력을 확인한 뒤 다시 시도해주세요.' }, { status: 400 }); }

  const db = getDatabase();
  if (body.role === 'admin') {
    const keys = await createAuthRateLimitKeys(request, 'admin', 'teacher');
    const state = await checkAuthRateLimit(db, keys);
    if (state.limited) return limitedResponse(state.retryAfterSeconds);
    const verified = await verifyTeacherPassword(String(body.password || ''));
    if (!verified.valid) {
      await recordAuthFailure(db, keys);
      return json({ error: '선생님 로그인 설정이 아직 완료되지 않았거나 비밀번호가 맞지 않습니다.' }, { status: 403 });
    }
    await clearAuthIdentityFailure(db, keys);
    return json({ token: await createSession({ role: 'admin', actor: '선생님', authVersion: verified.sessionVersion }), role: 'admin' });
  }

  if (body.role !== 'student') return json({ error: '지원하지 않는 로그인 요청입니다.' }, { status: 400 });
  const entranceYear = Number(body.entranceYear);
  const currentClass = Number(body.currentClass);
  const currentNumber = Number(body.currentNumber);
  const name = String(body.name || '').trim();
  const keys = await createAuthRateLimitKeys(request, 'student', `${entranceYear}:${currentClass}:${currentNumber}:${name}`);
  const state = await checkAuthRateLimit(db, keys);
  if (state.limited) return limitedResponse(state.retryAfterSeconds);
  if (!Number.isInteger(entranceYear) || entranceYear < 2000 || entranceYear > 2200 || !Number.isInteger(currentClass) || currentClass < 1 || currentClass > 30 || !Number.isInteger(currentNumber) || currentNumber < 1 || currentNumber > 100 || !name || name.length > 50) {
    await recordAuthFailure(db, keys);
    return json({ error: '입학년도, 반, 번호, 이름을 모두 정확히 입력해주세요.' }, { status: 400 });
  }
  const row = await db.prepare(`SELECT id, name FROM students WHERE entrance_year=? AND current_class=? AND current_number=? AND name=? AND active=1 LIMIT 1`).bind(entranceYear, currentClass, currentNumber, name).first<{ id: string; name: string }>();
  if (!row) {
    await recordAuthFailure(db, keys);
    return json({ error: '등록된 학생 정보를 찾지 못했습니다. 이름과 반·번호를 확인해주세요.' }, { status: 404 });
  }
  await clearAuthIdentityFailure(db, keys);
  return json({ token: await createSession({ role: 'student', actor: row.name, studentId: row.id }), role: 'student' });
}
