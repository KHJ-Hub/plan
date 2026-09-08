import { getDatabase } from '@/db';
import { makeScopeKey, normalizeCourseName } from '@/lib/domain.mjs';
import { id, json, now, requireSession } from '@/lib/server';

type IncomingStudent = { currentClass: number; currentNumber: number; name: string; externalId?: string; courses: string[] };
type IncomingFile = { fileName: string; checksum: string; currentClass: number; targetGrade: number; targetSemester: number; students: IncomingStudent[]; courseCount: number; error?: string; warnings?: string[] };
type ImportBody = { action: 'preview' | 'commit'; entranceYear: number; roundNumber: number; files: IncomingFile[]; replaceScopes?: string[] };

function validFile(file: IncomingFile) {
  return !file.error && file.fileName && file.checksum && Number.isInteger(file.currentClass) && file.currentClass > 0 && [2, 3].includes(Number(file.targetGrade)) && [1, 2].includes(Number(file.targetSemester)) && file.students.length > 0;
}

export async function POST(request: Request) {
  const session = await requireSession(request, 'admin');
  const body = await request.json() as ImportBody;
  const entranceYear = Number(body.entranceYear);
  const roundNumber = Number(body.roundNumber);
  if (!entranceYear || roundNumber < 1 || !Array.isArray(body.files) || !body.files.length) return json({ error: '입학년도, 차수, 파일을 확인해주세요.' }, { status: 400 });
  const db = getDatabase();

  const preview = [];
  for (const file of body.files) {
    const scope = makeScopeKey({ entranceYear, roundNumber, ...file });
    const existing = validFile(file) ? await db.prepare(`SELECT id,file_name,checksum,student_count FROM upload_files WHERE entrance_year=? AND round_number=? AND current_class=? AND target_grade=? AND target_semester=? AND active=1 LIMIT 1`).bind(entranceYear, roundNumber, file.currentClass, file.targetGrade, file.targetSemester).first<Record<string, unknown>>() : null;
    const duplicate = file.checksum ? await db.prepare(`SELECT id,file_name FROM upload_files WHERE checksum=? LIMIT 1`).bind(file.checksum).first() : null;
    preview.push({ ...file, scope, valid: validFile(file), existing, duplicate, replacement: Boolean(existing), studentCount: file.students.length });
  }
  const summary = {
    fileCount: body.files.length,
    validCount: preview.filter((item) => item.valid).length,
    errorCount: preview.filter((item) => !item.valid).length,
    newCount: preview.filter((item) => item.valid && !item.existing).length,
    replacementCount: preview.filter((item) => item.valid && item.existing).length,
    studentCount: preview.filter((item) => item.valid).reduce((sum, item) => sum + item.studentCount, 0),
  };
  if (body.action === 'preview') return json({ preview, summary });

  const replaceScopes = new Set(body.replaceScopes || []);
  const blocking = preview.filter((item) => item.valid && item.existing && !replaceScopes.has(item.scope));
  if (blocking.length) return json({ error: '기존 자료가 있는 반·학기가 있습니다. 교체 여부를 확인해주세요.', conflicts: blocking.map((item) => item.scope) }, { status: 409 });

  const batchId = id('batch');
  const createdAt = now();
  const applied: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];
  await db.prepare(`INSERT INTO upload_batches(id,entrance_year,round_number,uploaded_by,file_count,student_count,summary_json,created_at) VALUES(?,?,?,?,?,?,?,?)`).bind(batchId, entranceYear, roundNumber, session.actor, summary.validCount, summary.studentCount, JSON.stringify(summary), createdAt).run();

  for (const item of preview) {
    if (!item.valid) { failed.push({ fileName: item.fileName, error: item.error || '파일 형식을 확인해주세요.' }); continue; }
    try {
      const fileId = id('file');
      const statements: D1PreparedStatement[] = [];
      if (item.existing) statements.push(db.prepare(`UPDATE upload_files SET active=0 WHERE id=?`).bind(String(item.existing.id)));
      statements.push(db.prepare(`INSERT INTO upload_files(id,batch_id,entrance_year,round_number,current_class,target_grade,target_semester,file_name,checksum,student_count,course_count,active,replaced_file_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(fileId, batchId, entranceYear, roundNumber, item.currentClass, item.targetGrade, item.targetSemester, item.fileName, item.checksum, item.students.length, item.courseCount, 1, item.existing ? String(item.existing.id) : null, createdAt));

      for (const student of item.students) {
        const cleanName = String(student.name || '').trim();
        const externalId = String(student.externalId || '').trim() || null;
        let found: { id: string; name: string; current_class: number; current_number: number } | null = externalId
          ? await db.prepare(`SELECT id,name,current_class,current_number FROM students WHERE entrance_year=? AND external_id=? LIMIT 1`).bind(entranceYear, externalId).first<{ id: string; name: string; current_class: number; current_number: number }>()
          : await db.prepare(`SELECT id,name,current_class,current_number FROM students WHERE entrance_year=? AND current_class=? AND current_number=? AND name=? LIMIT 1`).bind(entranceYear, student.currentClass, student.currentNumber, cleanName).first<{ id: string; name: string; current_class: number; current_number: number }>();
        if (!found && !externalId) {
          const collision = await db.prepare(`SELECT id,name FROM students WHERE entrance_year=? AND current_class=? AND current_number=? LIMIT 1`).bind(entranceYear, student.currentClass, student.currentNumber).first<{ id: string; name: string }>();
          if (collision && collision.name !== cleanName) {
            statements.push(db.prepare(`INSERT INTO matching_issues(id,entrance_year,from_round,to_round,student_id,issue_type,details_json,resolution,admin_memo,updated_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id('issue'), entranceYear, Math.max(1, roundNumber - 1), roundNumber, collision.id, 'name_mismatch', JSON.stringify({ currentClass: student.currentClass, currentNumber: student.currentNumber, previousName: collision.name, incomingName: cleanName, fileName: item.fileName }), 'pending', '', createdAt, createdAt));
          }
        }
        const studentId = found?.id || id('student');
        if (!found) statements.push(db.prepare(`INSERT INTO students(id,entrance_year,current_class,current_number,name,external_id,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind(studentId, entranceYear, student.currentClass, student.currentNumber, cleanName, externalId, 1, createdAt, createdAt));
        else if (externalId && (found.name !== cleanName || found.current_class !== student.currentClass || found.current_number !== student.currentNumber)) {
          statements.push(db.prepare(`INSERT INTO matching_issues(id,entrance_year,from_round,to_round,student_id,issue_type,details_json,resolution,admin_memo,updated_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id('issue'), entranceYear, Math.max(1, roundNumber - 1), roundNumber, studentId, 'identity_changed', JSON.stringify({ previous: found, incoming: student, fileName: item.fileName }), 'pending', '', createdAt, createdAt));
          statements.push(db.prepare(`UPDATE students SET current_class=?,current_number=?,name=?,updated_at=? WHERE id=?`).bind(student.currentClass, student.currentNumber, cleanName, createdAt, studentId));
        }
        const resultId = id('official');
        statements.push(db.prepare(`INSERT INTO official_results(id,file_id,student_id,entrance_year,round_number,current_class,current_number,student_name,target_grade,target_semester,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(resultId, fileId, studentId, entranceYear, roundNumber, student.currentClass, student.currentNumber, cleanName, item.targetGrade, item.targetSemester, createdAt));
        for (const course of new Set(student.courses.map(normalizeCourseName).filter(Boolean))) statements.push(db.prepare(`INSERT INTO official_result_courses(id,result_id,course_name) VALUES(?,?,?)`).bind(id('orc'), resultId, course));
      }
      statements.push(db.prepare(`INSERT INTO audit_logs(id,actor,action,entrance_year,current_class,target_grade,target_semester,details_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind(id('audit'), session.actor, item.existing ? '공식 결과 파일 교체' : '공식 결과 파일 업로드', entranceYear, item.currentClass, item.targetGrade, item.targetSemester, JSON.stringify({ roundNumber, fileName: item.fileName, studentCount: item.students.length, replacedFileId: item.existing?.id || null }), createdAt));
      await db.batch(statements);
      applied.push({ fileName: item.fileName, scope: item.scope, studentCount: item.students.length, replaced: Boolean(item.existing) });
    } catch (error) {
      failed.push({ fileName: item.fileName, error: error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.' });
    }
  }
  if (applied.length) {
    const roundId = `round_${entranceYear}_${roundNumber}`;
    await db.prepare(`INSERT INTO rounds(id,entrance_year,round_number,title,status,official_finalized,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(entrance_year,round_number) DO UPDATE SET official_finalized=1,updated_at=excluded.updated_at`).bind(roundId, entranceYear, roundNumber, `${roundNumber}차 신청안 작성`, 'closed', 1, createdAt, now()).run();
  }
  return json({ batchId, applied, failed, summary });
}
