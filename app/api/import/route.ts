import { getDatabase } from '@/db';
import { makeScopeKey, normalizeCourseName } from '@/lib/domain.mjs';
import { id, json, now, requireSession } from '@/lib/server';

type IncomingStudent = { currentClass: number; currentNumber: number; name: string; externalId?: string; courses: string[] };
type IncomingFile = {
  fileName: string; checksum: string; currentClass: number; targetGrade: number; targetSemester: number;
  students: IncomingStudent[]; courseCount: number; courseNames?: string[]; error?: string; errors?: string[];
  warnings?: string[]; excludedRows?: Array<{ rowNumber: number; reason: string }>; ambiguousCourseNames?: string[]; headerRow?: number;
};
type ImportBody = { action: 'preview' | 'commit'; entranceYear: number; roundNumber?: number; files: IncomingFile[]; replaceScopes?: string[] };
type ExistingFile = { id: string; file_name: string; checksum: string; student_count: number; created_at: string };

function currentGradeFromEntranceYear(entranceYear: number) {
  return Math.max(1, new Date().getFullYear() - entranceYear + 1);
}

function validateFile(file: IncomingFile) {
  const errors = [...(file.errors || [])];
  if (file.error && !errors.includes(file.error)) errors.push(file.error);
  if (!file.fileName || !file.checksum) errors.push('파일 이름 또는 파일 확인값이 없습니다.');
  if (!Number.isInteger(file.currentClass) || file.currentClass < 1) errors.push('반을 확인해주세요.');
  if (![2, 3].includes(Number(file.targetGrade))) errors.push('대상 학년은 2학년 또는 3학년이어야 합니다.');
  if (![1, 2].includes(Number(file.targetSemester))) errors.push('대상 학기는 1학기 또는 2학기여야 합니다.');
  if (!Array.isArray(file.students) || !file.students.length) errors.push('유효한 학생 행이 없습니다.');
  if (file.students?.length > 1000) errors.push('한 반의 학생 수가 허용 범위를 초과했습니다.');
  if (!Number.isInteger(file.courseCount) || file.courseCount < 1 || file.courseCount > 200) errors.push('과목 열 수를 확인해주세요.');
  const identities = new Set<string>();
  for (const [index, student] of (file.students || []).entries()) {
    const rowLabel = `${index + 1}번째 학생`;
    const name = String(student?.name || '').trim();
    if (!Number.isInteger(Number(student?.currentClass)) || Number(student.currentClass) !== file.currentClass || !Number.isInteger(Number(student?.currentNumber)) || Number(student.currentNumber) < 1 || !name) {
      errors.push(`${rowLabel}의 반·번호·이름을 확인해주세요.`);
      continue;
    }
    if (!Array.isArray(student.courses)) errors.push(`${rowLabel}의 과목 목록을 확인해주세요.`);
    const identity = `${student.currentClass}:${student.currentNumber}:${name}`;
    if (identities.has(identity)) errors.push(`같은 학생이 중복되어 있습니다(${index + 1}번째 학생).`);
    identities.add(identity);
  }
  return [...new Set(errors)];
}

export async function POST(request: Request) {
  const session = await requireSession(request, 'admin');
  const body = await request.json() as ImportBody;
  const entranceYear = Number(body.entranceYear);
  // 기존 schema와 신청안 비교 호환을 위한 값일 뿐 최신 결과 범위에는 포함하지 않는다.
  const legacyRoundNumber = Math.max(1, Number(body.roundNumber) || 1);
  if (!Number.isInteger(entranceYear) || entranceYear < 2000 || entranceYear > 2200 || !Array.isArray(body.files) || !body.files.length) {
    return json({ error: '입학년도와 Excel 파일을 확인해주세요.' }, { status: 400 });
  }
  const db = getDatabase();
  const preview = [];
  const requestScopes = new Set<string>();

  for (const file of body.files) {
    const scope = makeScopeKey({ entranceYear, ...file });
    const validationErrors = validateFile(file);
    if (requestScopes.has(scope)) validationErrors.push('같은 반·학년·학기 자료가 요청에 중복되어 있습니다.');
    requestScopes.add(scope);
    const existingResult = validationErrors.length ? { results: [] } : await db.prepare(
      `SELECT id,file_name,checksum,student_count,created_at FROM upload_files WHERE entrance_year=? AND current_class=? AND target_grade=? AND target_semester=? AND active=1 ORDER BY created_at DESC`,
    ).bind(entranceYear, file.currentClass, file.targetGrade, file.targetSemester).all<ExistingFile>();
    const existing = existingResult.results || [];
    const duplicate = file.checksum ? await db.prepare(`SELECT id,file_name,active FROM upload_files WHERE checksum=? ORDER BY created_at DESC LIMIT 1`).bind(file.checksum).first() : null;
    preview.push({
      fileName: file.fileName, checksum: file.checksum, currentClass: file.currentClass, targetGrade: file.targetGrade,
      targetSemester: file.targetSemester, courseCount: file.courseCount, courseNames: file.courseNames || [],
      warnings: file.warnings || [], errors: validationErrors, excludedRows: file.excludedRows || [],
      ambiguousCourseNames: file.ambiguousCourseNames || [], headerRow: file.headerRow || 0,
      scope, valid: validationErrors.length === 0, existing, duplicate, replacement: existing.length > 0,
      studentCount: file.students?.length || 0,
    });
  }

  const summary = {
    fileCount: body.files.length,
    validCount: preview.filter((item) => item.valid).length,
    errorCount: preview.filter((item) => !item.valid).length,
    newCount: preview.filter((item) => item.valid && !item.existing.length).length,
    replacementCount: preview.filter((item) => item.valid && item.existing.length).length,
    studentCount: preview.filter((item) => item.valid).reduce((sum, item) => sum + item.studentCount, 0),
    courseCount: new Set(preview.flatMap((item) => item.courseNames)).size,
    excludedRowCount: preview.reduce((sum, item) => sum + item.excludedRows.length, 0),
    confirmationCourseCount: new Set(preview.flatMap((item) => item.ambiguousCourseNames)).size,
  };
  if (body.action === 'preview') return json({ preview, summary });
  if (preview.some((item) => !item.valid)) {
    return json({ error: '검증에 실패한 자료가 있어 아무 데이터도 변경하지 않았습니다.', preview, summary }, { status: 400 });
  }

  const replaceScopes = new Set(body.replaceScopes || []);
  const blocking = preview.filter((item) => item.existing.length && !replaceScopes.has(item.scope));
  if (blocking.length) {
    return json({ error: '기존 최신 자료가 있는 반·학기가 있습니다. 교체 여부를 확인해주세요.', conflicts: blocking.map((item) => item.scope) }, { status: 409 });
  }

  const batchId = id('batch');
  const createdAt = now();
  const staged: Array<{ fileId: string; item: typeof preview[number]; source: IncomingFile }> = [];
  const failed: Array<{ fileName: string; error: string }> = [];
  await db.prepare(`INSERT INTO upload_batches(id,entrance_year,round_number,uploaded_by,file_count,student_count,summary_json,created_at) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(batchId, entranceYear, legacyRoundNumber, session.actor, summary.validCount, summary.studentCount, JSON.stringify({ ...summary, status: 'staging' }), createdAt).run();

  for (let itemIndex = 0; itemIndex < preview.length; itemIndex += 1) {
    const item = preview[itemIndex];
    const source = body.files[itemIndex];
    try {
      const fileId = id('file');
      const statements: D1PreparedStatement[] = [
        db.prepare(`INSERT INTO upload_files(id,batch_id,entrance_year,round_number,current_class,target_grade,target_semester,file_name,checksum,student_count,course_count,active,replaced_file_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(fileId, batchId, entranceYear, legacyRoundNumber, item.currentClass, item.targetGrade, item.targetSemester, item.fileName, item.checksum, source.students.length, item.courseCount, 0, item.existing[0]?.id || null, createdAt),
      ];

      for (const student of source.students) {
        const cleanName = String(student.name || '').trim();
        const externalId = String(student.externalId || '').trim() || null;
        const found = externalId
          ? await db.prepare(`SELECT id,name,current_class,current_number FROM students WHERE entrance_year=? AND external_id=? LIMIT 1`).bind(entranceYear, externalId).first<{ id: string; name: string; current_class: number; current_number: number }>()
          : await db.prepare(`SELECT id,name,current_class,current_number FROM students WHERE entrance_year=? AND current_class=? AND current_number=? AND name=? LIMIT 1`).bind(entranceYear, student.currentClass, student.currentNumber, cleanName).first<{ id: string; name: string; current_class: number; current_number: number }>();
        if (!found && !externalId) {
          const collision = await db.prepare(`SELECT id,name FROM students WHERE entrance_year=? AND current_class=? AND current_number=? LIMIT 1`).bind(entranceYear, student.currentClass, student.currentNumber).first<{ id: string; name: string }>();
          if (collision && collision.name !== cleanName) {
            statements.push(db.prepare(`INSERT INTO matching_issues(id,entrance_year,from_round,to_round,student_id,issue_type,details_json,resolution,admin_memo,updated_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
              .bind(id('issue'), entranceYear, legacyRoundNumber, legacyRoundNumber, collision.id, 'name_mismatch', JSON.stringify({ currentClass: student.currentClass, currentNumber: student.currentNumber, previousName: collision.name, incomingName: cleanName, fileName: item.fileName }), 'pending', '', createdAt, createdAt));
          }
        }
        const studentId = found?.id || id('student');
        if (!found) {
          statements.push(db.prepare(`INSERT INTO students(id,entrance_year,current_grade,current_class,current_number,name,external_id,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
            .bind(studentId, entranceYear, currentGradeFromEntranceYear(entranceYear), student.currentClass, student.currentNumber, cleanName, externalId, 1, createdAt, createdAt));
        } else if (externalId && (found.name !== cleanName || found.current_class !== student.currentClass || found.current_number !== student.currentNumber)) {
          statements.push(db.prepare(`INSERT INTO matching_issues(id,entrance_year,from_round,to_round,student_id,issue_type,details_json,resolution,admin_memo,updated_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
            .bind(id('issue'), entranceYear, legacyRoundNumber, legacyRoundNumber, studentId, 'identity_changed', JSON.stringify({ previous: found, incoming: student, fileName: item.fileName }), 'pending', '', createdAt, createdAt));
          statements.push(db.prepare(`UPDATE students SET current_class=?,current_number=?,name=?,updated_at=? WHERE id=?`).bind(student.currentClass, student.currentNumber, cleanName, createdAt, studentId));
        }
        const resultId = id('official');
        statements.push(db.prepare(`INSERT INTO official_results(id,file_id,student_id,entrance_year,round_number,current_class,current_number,student_name,target_grade,target_semester,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(resultId, fileId, studentId, entranceYear, legacyRoundNumber, student.currentClass, student.currentNumber, cleanName, item.targetGrade, item.targetSemester, createdAt));
        for (const course of new Set(student.courses.map(normalizeCourseName).filter(Boolean))) {
          statements.push(db.prepare(`INSERT INTO official_result_courses(id,result_id,course_name) VALUES(?,?,?)`).bind(id('orc'), resultId, course));
        }
      }
      await db.batch(statements);
      staged.push({ fileId, item, source });
    } catch (error) {
      console.error('공식 결과 staging 실패', { fileName: item.fileName, scope: item.scope, error });
      failed.push({ fileName: item.fileName, error: '저장 준비 중 오류가 발생했습니다.' });
      break;
    }
  }

  if (failed.length || staged.length !== preview.length) {
    return json({
      error: '새 파일 저장 준비에 실패하여 기존 최신 데이터는 변경하지 않았습니다.',
      batchId, applied: [], failed, summary,
    }, { status: 422 });
  }

  try {
    const activation: D1PreparedStatement[] = [];
    for (const { fileId, item, source } of staged) {
      activation.push(db.prepare(`UPDATE upload_files SET active=0 WHERE entrance_year=? AND current_class=? AND target_grade=? AND target_semester=? AND active=1`)
        .bind(entranceYear, item.currentClass, item.targetGrade, item.targetSemester));
      activation.push(db.prepare(`UPDATE upload_files SET active=1 WHERE id=?`).bind(fileId));
      activation.push(db.prepare(`INSERT INTO audit_logs(id,actor,action,entrance_year,current_class,target_grade,target_semester,details_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
        .bind(id('audit'), session.actor, item.existing.length ? '최신 공식 결과 교체' : '최신 공식 결과 등록', entranceYear, item.currentClass, item.targetGrade, item.targetSemester, JSON.stringify({ fileName: item.fileName, studentCount: source.students.length, replacedFileIds: item.existing.map((existing) => existing.id) }), createdAt));
    }
    await db.batch(activation);
  } catch (error) {
    console.error('공식 결과 활성화 실패', { batchId, error });
    return json({ error: '새 파일 활성화에 실패하여 기존 최신 데이터는 변경하지 않았습니다.', batchId, applied: [], failed: [], summary }, { status: 500 });
  }

  const applied = staged.map(({ item, source }) => ({
    fileName: item.fileName, scope: item.scope, studentCount: source.students.length, replaced: item.existing.length > 0,
  }));
  return json({ batchId, applied, failed: [], summary, message: '모든 자료를 검증한 뒤 최신 결과를 안전하게 교체했습니다.' });
}
