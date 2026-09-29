import { getDatabase } from '@/db';
import { id, json, now, requireSession } from '@/lib/server';

// 인증 상태(비밀번호 해시/세션 버전)는 백업에서 제외한다. FK 부모를 먼저 나열해
// 복구 시 정방향 삽입, 초기화 시 역방향 삭제가 되도록 유지한다.
const TABLES = [
  'students','student_profiles','student_preferences','rounds','plans','plan_courses','review_history','plan_submission_snapshots',
  'upload_batches','upload_files','official_results','official_result_courses','matching_issues','verification_reviews',
  'curricula','academic_track_course_guides','course_description_sources','course_description_selections','course_description_import_batches','course_description_import_rows',
  'university_requirements','track_requirements','reference_uploads','university_reference_entries','track_reference_entries','school_course_guides','school_course_book_entries','education_office_course_guides','audit_logs',
] as const;

type TableName = typeof TABLES[number];
type Backup = { format: 'course-planner-backup-v1' | 'course-planner-backup-v2'; createdAt: string; tables: Record<string, unknown[]> };

async function readBackup(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  if (!body || !['course-planner-backup-v1','course-planner-backup-v2'].includes(String(body.format)) || !body.tables || typeof body.tables !== 'object') {
    throw new Error('지원하지 않는 백업 파일 형식입니다.');
  }
  return body as unknown as Backup;
}

export async function GET(request: Request) {
  const session = await requireSession(request, 'admin');
  const db = getDatabase(); const tables: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const result = await db.prepare(`SELECT * FROM ${table}`).all();
    tables[table] = result.results || [];
  }
  await db.prepare(`INSERT INTO audit_logs(id,actor,action,details_json,created_at) VALUES(?,?,?,?,?)`).bind(id('audit'), session.actor, '데이터 백업', JSON.stringify({ tableCount: TABLES.length, format: 'v2' }), now()).run();
  const filename = `course-planner-backup-${now().replace(/[-:T]/g, '').slice(0, 13)}.json`;
  return new Response(JSON.stringify({ format: 'course-planner-backup-v2', createdAt: now(), tables }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const session = await requireSession(request, 'admin');
  let backup: Backup;
  try { backup = await readBackup(request); } catch (error) { return json({ error: error instanceof Error ? error.message : '백업 파일을 읽지 못했습니다.' }, { status: 400 }); }
  // v1 백업에 없던 테이블은 복구 중 삭제하지 않는다. 백업에 실제 포함된 허용 테이블만 교체한다.
  const restoreTables = TABLES.filter((table) => Array.isArray(backup.tables[table])) as TableName[];
  const preservedTables = TABLES.filter((table) => !restoreTables.includes(table));
  const summary = Object.fromEntries(restoreTables.map((table) => [table, backup.tables[table].length]));
  if (!restoreTables.length || !Object.values(summary).some((count) => count > 0)) return json({ error: '복구할 데이터가 없는 백업 파일입니다.' }, { status: 400 });
  const action = request.headers.get('x-backup-action') || 'preview';
  if (action !== 'commit') return json({
    ok: true, preview: true, format: backup.format, summary,
    total: Object.values(summary).reduce((a, b) => a + b, 0),
    preservedTables,
    warning: backup.format === 'course-planner-backup-v1' ? '이전 v1 백업은 누락된 테이블이 있어 내용 확인만 지원합니다. 현재 시스템에서 v2 백업을 새로 만든 뒤 복구하세요.' : '복구 작업은 백업에 포함된 테이블의 현재 데이터를 교체합니다. 포함되지 않은 테이블은 그대로 보존됩니다.',
  });
  if (backup.format === 'course-planner-backup-v1') return json({ error: '이전 v1 백업은 누락 테이블과 참조 충돌 위험 때문에 자동 복구할 수 없습니다. v2 백업을 사용해주세요.' }, { status: 409 });

  const db = getDatabase();
  const statements = restoreTables.slice().reverse().map((table) => db.prepare(`DELETE FROM ${table}`));
  for (const table of restoreTables) {
    const rows = backup.tables[table] as Record<string, unknown>[];
    for (const row of rows) {
      const keys = Object.keys(row).filter((key) => row[key] !== undefined);
      if (!keys.length) continue;
      statements.push(db.prepare(`INSERT INTO ${table} (${keys.map((key) => `"${key.replace(/"/g, '""')}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`).bind(...keys.map((key) => row[key] ?? null)));
    }
  }
  try {
    await db.batch(statements);
    await db.prepare(`INSERT INTO audit_logs(id,actor,action,details_json,created_at) VALUES(?,?,?,?,?)`).bind(id('audit'), session.actor, '데이터 복구', JSON.stringify({ format: backup.format, summary, preservedTables }), now()).run();
    return json({ ok: true, restored: summary, preservedTables });
  } catch (error) {
    console.error('데이터 백업 복구 실패', error);
    return json({ error: '복구에 실패하여 현재 데이터를 확인해야 합니다. 관리자 로그를 확인해주세요.' }, { status: 500 });
  }
}
