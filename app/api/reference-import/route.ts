import { getDatabase } from '@/db';
import { normalizeCourseName } from '@/lib/domain.mjs';
import { id, json, now, requireSession } from '@/lib/server';

type ReferenceType = 'university_regional' | 'university_track' | 'school_course';
type MatrixCourse = { subjectArea?: string; courseName: string; universities?: string; recommendationType?: 'core' | 'recommended' };
type IncomingRow = Record<string, unknown> & { matrixCourses?: MatrixCourse[]; sourceRowNumber?: number };
type Body = { action: 'preview' | 'commit' | 'deactivate'; referenceType: ReferenceType; criteriaYear: number; fileName: string; rows: IncomingRow[]; matrixCourseColumnCount?: number; replaceUploadIds?: string[]; uploadId?: string };

const types: ReferenceType[] = ['university_regional', 'university_track', 'school_course'];
const value = (row: IncomingRow, key: string) => String(row[key] ?? '').trim();
const splitCourses = (raw: string) => [...new Set(raw.split(/[\n,;/·]+/).map(normalizeCourseName).filter(Boolean))];
// 쉼표가 괄호 안의 과목 설명에 쓰일 수 있다. 최상위 쉼표·줄바꿈만 대학 목록
// 구분자로 처리해 '국민대(확률과통계, 미적분Ⅰ)' 같은 원문을 훼손하지 않는다.
const splitUniversities = (raw: string) => {
  const values: string[] = []; let current = ''; let depth = 0;
  for (const character of raw) {
    if (character === '(' || character === '[') depth += 1;
    if (character === ')' || character === ']') depth = Math.max(0, depth - 1);
    if ((character === ',' && depth === 0) || /[\n\r;/·]/.test(character)) { if (current.trim()) values.push(current.trim()); current = ''; continue; }
    current += character;
  }
  if (current.trim()) values.push(current.trim());
  return [...new Set(values.filter((item) => item && !/^[-–—]+$/.test(item)))];
};
const offered = (raw: string) => !/^(아니오|n|no|x|불가|미개설|0)$/i.test(raw.trim());

function validateRow(type: ReferenceType, row: IncomingRow) {
  if (type === 'school_course') return Boolean(value(row, 'courseName'));
  if (type === 'university_track') return Boolean(value(row, 'department') && (value(row, 'coreCourses') || value(row, 'recommendedCourses') || row.matrixCourses?.some((item) => item.courseName)));
  return Boolean(value(row, 'university') && value(row, 'department') && (value(row, 'coreCourses') || value(row, 'recommendedCourses')));
}

function classifyTrackRows(rows: IncomingRow[]) {
  const validRows: IncomingRow[] = []; const autoExcludedRows: Array<{ rowNumber:number; reason:string }> = []; const invalidRows: Array<{ rowNumber:number; reason:string }> = [];
  rows.forEach((row, index) => {
    const rowNumber = Number(row.sourceRowNumber) || index + 2;
    const courses = (row.matrixCourses || []).filter((item) => normalizeCourseName(item.courseName) && splitUniversities(String(item.universities || '')).length);
    if (!value(row, 'department') && !courses.length) { autoExcludedRows.push({ rowNumber, reason:'모집단위와 반영 대학 데이터가 없는 빈 행·주석 행' }); return; }
    if (!value(row, 'department')) { invalidRows.push({ rowNumber, reason:'반영 대학 데이터는 있으나 모집단위를 찾지 못함' }); return; }
    if (!courses.length) { autoExcludedRows.push({ rowNumber, reason:'반영 대학 데이터가 없는 모집단위 행' }); return; }
    validRows.push({ ...row, matrixCourses:courses });
  });
  return { validRows, autoExcludedRows, invalidRows };
}

export async function POST(request: Request) {
  const session = await requireSession(request, 'admin');
  const body = await request.json() as Body;
  if (body.action === 'deactivate') {
    if (!body.uploadId) return json({ error: '적용 해제할 자료를 확인해주세요.' }, { status: 400 });
    const db = getDatabase(); const timestamp = now();
    await db.batch([
      db.prepare(`UPDATE reference_uploads SET active=0 WHERE id=?`).bind(body.uploadId),
      db.prepare(`INSERT INTO audit_logs(id,actor,action,details_json,created_at) VALUES(?,?,?,?,?)`).bind(id('audit'), session.actor, '기준자료 적용 해제', JSON.stringify({ uploadId: body.uploadId }), timestamp),
    ]);
    return json({ ok: true });
  }
  if (!types.includes(body.referenceType) || !Number.isInteger(Number(body.criteriaYear)) || !body.fileName || !Array.isArray(body.rows)) return json({ error: '기준연도, 자료 유형, 파일을 확인해주세요.' }, { status: 400 });
  const criteriaYear = Number(body.criteriaYear);
  const rows = body.rows.map((row) => row || {});
  const trackClassification = body.referenceType === 'university_track' ? classifyTrackRows(rows) : null;
  const validRows = trackClassification?.validRows || rows.filter((row) => validateRow(body.referenceType, row));
  const invalidRows = trackClassification?.invalidRows || rows.map((row, index) => ({ rowNumber: Number(row.sourceRowNumber) || index + 2, reason:'필수값 누락', valid: validateRow(body.referenceType, row) })).filter((row) => !row.valid);
  const autoExcludedRows = trackClassification?.autoExcludedRows || [];
  const db = getDatabase();
  const existing = await db.prepare(`SELECT id,file_name,row_count,created_at FROM reference_uploads WHERE reference_type=? AND criteria_year=? AND active=1 ORDER BY created_at DESC`).bind(body.referenceType, criteriaYear).all<Record<string, unknown>>();
  const matrixCourseCount = validRows.reduce((sum, row) => sum + (row.matrixCourses?.length || 0), 0);
  const relationshipSample = body.referenceType === 'university_track' ? validRows.flatMap((row) => (row.matrixCourses || []).map((matrix) => ({ track:value(row,'track'), department:value(row,'department'), subjectArea:String(matrix.subjectArea || '').trim(), courseName:normalizeCourseName(matrix.courseName), universities:splitUniversities(String(matrix.universities || '')) }))).slice(0, 10) : [];
  const relationshipCount = body.referenceType === 'university_track' ? validRows.reduce((sum, row) => sum + (row.matrixCourses || []).reduce((courseSum, matrix) => courseSum + splitUniversities(String(matrix.universities || '')).length, 0), 0) : 0;
  const summary = { totalCount: rows.length, validCount: validRows.length, errorCount: invalidRows.length, autoExcludedCount:autoExcludedRows.length, matrixCourseCount, matrixCourseColumnCount:Number(body.matrixCourseColumnCount) || 0, relationshipCount, sample: body.referenceType === 'university_track' ? relationshipSample : validRows.slice(0, 8) };
  if (body.action === 'preview') return json({ summary, invalidRows: invalidRows.slice(0, 20), autoExcludedRows:autoExcludedRows.slice(0, 20), existing: existing.results || [] });
  if (!validRows.length) return json({ error: '저장할 수 있는 정상 행이 없습니다.' }, { status: 400 });
  const replaceIds = new Set(body.replaceUploadIds || []);
  const active = (existing.results || []) as Array<{ id: string }>;
  if (active.some((upload) => !replaceIds.has(upload.id))) return json({ error: '같은 기준연도의 적용 중인 자료가 있습니다. 교체 여부를 확인해주세요.', conflicts: active.map((upload) => upload.id) }, { status: 409 });

  const timestamp = now(); const uploadId = id('reference');
  const statements: D1PreparedStatement[] = [];
  for (const old of active) statements.push(db.prepare(`UPDATE reference_uploads SET active=0 WHERE id=?`).bind(old.id));
  statements.push(db.prepare(`INSERT INTO reference_uploads(id,reference_type,criteria_year,file_name,uploaded_by,row_count,failed_count,active,replaced_upload_id,summary_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(uploadId, body.referenceType, criteriaYear, body.fileName, session.actor, validRows.length, invalidRows.length, 1, active[0]?.id || null, JSON.stringify(summary), timestamp));

  for (const row of validRows) {
    if (body.referenceType === 'school_course') {
      const courseName = normalizeCourseName(value(row, 'courseName'));
      const targetGrade = Number(value(row, 'targetGrade')) || null; const targetSemester = Number(value(row, 'targetSemester')) || null;
      statements.push(db.prepare(`INSERT INTO school_course_guides(id,upload_id,criteria_year,course_name,area,target_grade,target_semester,overview,offered,credits,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id('guide'), uploadId, criteriaYear, courseName, value(row, 'area'), targetGrade, targetSemester, value(row, 'overview'), offered(value(row, 'offered')) ? 1 : 0, value(row, 'credits'), value(row, 'note'), timestamp));
      if (targetGrade && targetSemester) statements.push(db.prepare(`INSERT INTO curricula(id,entrance_year,target_grade,target_semester,area,course_name,selection_type,offered,note,source_upload_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(entrance_year,target_grade,target_semester,course_name) DO UPDATE SET area=excluded.area,selection_type=excluded.selection_type,offered=excluded.offered,note=excluded.note,source_upload_id=excluded.source_upload_id,updated_at=excluded.updated_at`).bind(id('course'), criteriaYear, targetGrade, targetSemester, value(row, 'area'), courseName, value(row, 'selectionType') || 'general', offered(value(row, 'offered')) ? 1 : 0, value(row, 'note'), uploadId, timestamp, timestamp));
    } else if (body.referenceType === 'university_regional') {
      const common = [criteriaYear, value(row, 'track'), value(row, 'region'), value(row, 'university'), value(row, 'department'), value(row, 'note'), uploadId, timestamp, timestamp];
      statements.push(db.prepare(`INSERT INTO university_reference_entries(id,upload_id,criteria_year,track,region,university,department,core_courses_raw,recommended_courses_raw,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id('university_ref'), uploadId, criteriaYear, common[1], common[2], common[3], common[4], value(row, 'coreCourses'), value(row, 'recommendedCourses'), common[5], timestamp));
      for (const courseName of splitCourses(value(row, 'coreCourses'))) statements.push(db.prepare(`INSERT INTO university_requirements(id,admissions_year,track,region,university,department,course_name,recommendation_type,note,source_upload_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id('ureq'), common[0], common[1], common[2], common[3], common[4], courseName, 'core', common[5], common[6], common[7], common[8]));
      for (const courseName of splitCourses(value(row, 'recommendedCourses'))) statements.push(db.prepare(`INSERT INTO university_requirements(id,admissions_year,track,region,university,department,course_name,recommendation_type,note,source_upload_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id('ureq'), common[0], common[1], common[2], common[3], common[4], courseName, 'recommended', common[5], common[6], common[7], common[8]));
    } else {
      for (const matrix of row.matrixCourses || []) {
        const courseName = normalizeCourseName(matrix.courseName);
        if (!courseName) continue;
        const recommendationType = matrix.recommendationType === 'core' ? 'core' : 'recommended';
        statements.push(db.prepare(`INSERT INTO track_reference_entries(id,upload_id,criteria_year,track,department,subject_area,course_name,universities_json,recommendation_type,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id('track_ref'), uploadId, criteriaYear, value(row, 'track'), value(row, 'department'), String(matrix.subjectArea || '').trim(), courseName, JSON.stringify(splitUniversities(String(matrix.universities || ''))), recommendationType, value(row, 'note'), timestamp));
        statements.push(db.prepare(`INSERT INTO track_requirements(id,admissions_year,track,department_group,course_name,recommendation_type,note,source_upload_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id('treq'), criteriaYear, value(row, 'track'), value(row, 'department'), courseName, recommendationType, value(row, 'note'), uploadId, timestamp, timestamp));
      }
      for (const courseName of splitCourses(value(row, 'coreCourses'))) { statements.push(db.prepare(`INSERT INTO track_reference_entries(id,upload_id,criteria_year,track,department,subject_area,course_name,universities_json,recommendation_type,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id('track_ref'), uploadId, criteriaYear, value(row, 'track'), value(row, 'department'), value(row, 'subjectArea'), courseName, '[]', 'core', value(row, 'note'), timestamp)); statements.push(db.prepare(`INSERT INTO track_requirements(id,admissions_year,track,department_group,course_name,recommendation_type,note,source_upload_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id('treq'), criteriaYear, value(row, 'track'), value(row, 'department'), courseName, 'core', value(row, 'note'), uploadId, timestamp, timestamp)); }
      for (const courseName of splitCourses(value(row, 'recommendedCourses'))) { statements.push(db.prepare(`INSERT INTO track_reference_entries(id,upload_id,criteria_year,track,department,subject_area,course_name,universities_json,recommendation_type,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id('track_ref'), uploadId, criteriaYear, value(row, 'track'), value(row, 'department'), value(row, 'subjectArea'), courseName, '[]', 'recommended', value(row, 'note'), timestamp)); statements.push(db.prepare(`INSERT INTO track_requirements(id,admissions_year,track,department_group,course_name,recommendation_type,note,source_upload_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id('treq'), criteriaYear, value(row, 'track'), value(row, 'department'), courseName, 'recommended', value(row, 'note'), uploadId, timestamp, timestamp)); }
    }
  }
  statements.push(db.prepare(`INSERT INTO audit_logs(id,actor,action,details_json,created_at) VALUES(?,?,?,?,?)`).bind(id('audit'), session.actor, '기준자료 업로드', JSON.stringify({ referenceType: body.referenceType, criteriaYear, fileName: body.fileName, rowCount: validRows.length, replaced: active.map((item) => item.id) }), timestamp));
  await db.batch(statements);
  return json({ ok: true, uploadId, savedCount: validRows.length, replacedCount: active.length });
}
