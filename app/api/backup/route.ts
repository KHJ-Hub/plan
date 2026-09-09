import { getDatabase } from '@/db';
import { id, json, now, requireSession } from '@/lib/server';

// 인증 상태(비밀번호 해시/세션 버전)는 백업에서 제외한다.
const TABLES = [
  'students','student_profiles','student_preferences','rounds','plans','plan_courses','review_history',
  'upload_batches','upload_files','official_results','official_result_courses','matching_issues','verification_reviews',
  'curricula','course_description_sources','course_description_selections','course_description_import_batches','course_description_import_rows',
  'university_requirements','track_requirements','reference_uploads','university_reference_entries','track_reference_entries','school_course_guides','audit_logs',
] as const;

type Backup = { format: string; createdAt: string; tables: Record<string, unknown[]> };

async function readBackup(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  if (!body || body.format !== 'course-planner-backup-v1' || !body.tables || typeof body.tables !== 'object') throw new Error('지원하지 않는 백업 파일 형식입니다.');
  return body as unknown as Backup;
}

export async function GET(request: Request) {
  const session = await requireSession(request, 'admin');
  const db = getDatabase(); const tables: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const result = await db.prepare(`SELECT * FROM ${table}`).all();
    tables[table] = result.results || [];
  }
  await db.prepare(`INSERT INTO audit_logs(id,actor,action,details_json,created_at) VALUES(?,?,?,?,?)`).bind(id('audit'), session.actor, '데이터 백업', JSON.stringify({ tableCount: TABLES.length }), now()).run();
  const filename = `course-planner-backup-${now().replace(/[-:T]/g, '').slice(0, 13)}.json`;
  return new Response(JSON.stringify({ format: 'course-planner-backup-v1', createdAt: now(), tables }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const session = await requireSession(request, 'admin');
  let backup: Backup;
  try { backup = await readBackup(request); } catch (error) { return json({ error: error instanceof Error ? error.message : '백업 파일을 읽지 못했습니다.' }, { status: 400 }); }
  const summary = Object.fromEntries(TABLES.map((table) => [table, Array.isArray(backup.tables[table]) ? backup.tables[table].length : 0]));
  if (!Object.values(summary).some((count) => count > 0)) return json({ error: '복구할 데이터가 없는 백업 파일입니다.' }, { status: 400 });
  const action = request.headers.get('x-backup-action') || 'preview';
  if (action !== 'commit') return json({ ok: true, preview: true, summary, total: Object.values(summary).reduce((a, b) => a + b, 0), warning: '복구 작업은 현재 데이터를 변경할 수 있습니다. 복구 범위를 확인한 후 진행해주세요.' });

  // 전체 복구는 명시적인 두 번째 요청에서만 실행한다. 인증 테이블은 절대 복구하지 않는다.
  const db = getDatabase();
  const statements = TABLES.slice().reverse().map((table) => db.prepare(`DELETE FROM ${table}`));
  for (const table of TABLES) {
    const rows = Array.isArray(backup.tables[table]) ? backup.tables[table] as Record<string, unknown>[] : [];
    for (const row of rows) {
      const keys = Object.keys(row).filter((key) => row[key] !== undefined);
      if (!keys.length) continue;
      statements.push(db.prepare(`INSERT INTO ${table} (${keys.map((key) => `"${key.replace(/"/g, '""')}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`).bind(...keys.map((key) => row[key] ?? null)));
    }
  }
  try {
    await db.batch(statements);
    await db.prepare(`INSERT INTO audit_logs(id,actor,action,details_json,created_at) VALUES(?,?,?,?,?)`).bind(id('audit'), session.actor, '데이터 복구', JSON.stringify({ summary }), now()).run();
    return json({ ok: true, restored: summary });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : '복구 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
