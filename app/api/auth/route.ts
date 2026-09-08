import { getDatabase, getRuntimeEnv } from '@/db';
import { createSession, json } from '@/lib/server';

export async function POST(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  if (body.role === 'admin') {
    const configured = getRuntimeEnv().ADMIN_PASSWORD;
    const local = new URL(request.url).hostname === 'localhost' || new URL(request.url).hostname === '127.0.0.1';
    if ((!configured && !(local && body.password === '00000')) || (configured && body.password !== configured)) {
      return json({ error: configured ? '비밀번호가 맞지 않습니다.' : '관리자 비밀번호가 아직 설정되지 않았습니다.' }, { status: configured ? 403 : 503 });
    }
    return json({ token: await createSession({ role: 'admin', actor: '관리자' }), role: 'admin', setupWarning: !configured });
  }

  const entranceYear = Number(body.entranceYear);
  const currentClass = Number(body.currentClass);
  const currentNumber = Number(body.currentNumber);
  const name = String(body.name || '').trim();
  if (!entranceYear || !currentClass || !currentNumber || !name) return json({ error: '입학년도, 반, 번호, 이름을 모두 입력해주세요.' }, { status: 400 });
  const db = getDatabase();
  const row = await db.prepare(`SELECT id, name FROM students WHERE entrance_year=? AND current_class=? AND current_number=? AND name=? AND active=1 LIMIT 1`).bind(entranceYear, currentClass, currentNumber, name).first<{ id: string; name: string }>();
  if (!row) return json({ error: '등록된 학생 정보를 찾지 못했습니다. 이름과 반·번호를 확인해주세요.' }, { status: 404 });
  return json({ token: await createSession({ role: 'student', actor: row.name, studentId: row.id }), role: 'student' });
}
