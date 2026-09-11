import { getDatabase } from '@/db';
import { compareCourseSets } from '@/lib/domain.mjs';
import { json, requireSession } from '@/lib/server';

async function all<T>(db: D1Database, sql: string, ...args: unknown[]) {
  return (await db.prepare(sql).bind(...args).all<T>()).results || [];
}

export async function GET(request: Request) {
  const session = await requireSession(request);
  const db = getDatabase();
  if (session.role === 'student') {
    const student = await db.prepare(`SELECT * FROM students WHERE id=?`).bind(session.studentId).first();
    const profile = await db.prepare(`SELECT * FROM student_profiles WHERE student_id=?`).bind(session.studentId).first();
    const preferences = await all(db, `SELECT * FROM student_preferences WHERE student_id=? ORDER BY rank`, session.studentId);
    const rounds = await all<Record<string, unknown>>(db, `SELECT r.*, p.id plan_id, p.status plan_status, p.student_memo, p.updated_at plan_updated_at FROM rounds r LEFT JOIN plans p ON p.round_id=r.id AND p.student_id=? WHERE r.entrance_year=(SELECT entrance_year FROM students WHERE id=?) ORDER BY r.round_number`, session.studentId, session.studentId);
    const plans = await all(db, `SELECT p.id plan_id, p.round_id, p.status, p.student_memo, pc.target_grade, pc.target_semester, pc.course_name FROM plans p LEFT JOIN plan_courses pc ON pc.plan_id=p.id WHERE p.student_id=? ORDER BY pc.target_grade, pc.target_semester`, session.studentId);
    const reviews = await all(db, `SELECT rh.* FROM review_history rh JOIN plans p ON p.id=rh.plan_id WHERE p.student_id=? ORDER BY rh.created_at DESC`, session.studentId);
    const official = await all<Record<string, unknown>>(db, `SELECT r.id result_id, r.round_number, r.target_grade, r.target_semester, c.course_name FROM official_results r JOIN upload_files f ON f.id=r.file_id AND f.active=1 LEFT JOIN official_result_courses c ON c.result_id=r.id WHERE r.student_id=? ORDER BY r.round_number, r.target_grade, r.target_semester`, session.studentId);
    const curriculum = student ? await all(db, `SELECT c.* FROM curricula c LEFT JOIN reference_uploads ru ON ru.id=c.source_upload_id WHERE c.entrance_year=? AND c.offered=1 AND (c.source_upload_id IS NULL OR ru.active=1) ORDER BY c.target_grade,c.target_semester,c.area,c.course_name`, (student as { entrance_year: number }).entrance_year) : [];
    const courseDescriptions = student ? await all(db, `SELECT s.*, sel.display_mode FROM course_description_selections sel JOIN course_description_sources s ON s.id=sel.selected_source_id WHERE sel.entrance_year=? UNION ALL SELECT 'school_guide_' || scg.id id,scg.criteria_year entrance_year,scg.course_name,scg.overview,scg.overview learning_content,'' course_nature,'',scg.target_grade recommended_grade,scg.target_semester recommended_semester,scg.selection_type,scg.note,'official' source_kind,'학교 실제 선택 가능 과목 안내' source_name,scg.criteria_year source_year,scg.created_at,scg.created_at,'official' display_mode FROM school_course_guides scg JOIN reference_uploads ru ON ru.id=scg.upload_id AND ru.active=1 LEFT JOIN course_description_selections sel ON sel.entrance_year=scg.criteria_year AND sel.course_name=scg.course_name WHERE scg.criteria_year=? AND sel.course_name IS NULL UNION ALL SELECT 'education_pdf_' || eg.id id,eg.criteria_year entrance_year,eg.course_name,eg.course_nature overview,eg.content_structure learning_content,eg.course_nature,eg.related_careers || CASE WHEN eg.related_departments<>'' THEN ' / ' || eg.related_departments ELSE '' END related_careers,NULL,NULL,eg.selection_type,TRIM(COALESCE(eg.hierarchy,'') || CASE WHEN COALESCE(eg.credits,'')<>'' THEN ' · 이수 학점: ' || eg.credits ELSE '' END || CASE WHEN COALESCE(eg.csat_relation,'')<>'' THEN ' · 수능 관련: ' || eg.csat_relation ELSE '' END) note,'official' source_kind,eg.source_document source_name,2022 source_year,eg.created_at,eg.created_at,'official' display_mode FROM education_office_course_guides eg JOIN reference_uploads ru ON ru.id=eg.upload_id AND ru.active=1 LEFT JOIN course_description_selections sel ON sel.entrance_year=eg.criteria_year AND sel.course_name=eg.course_name WHERE eg.criteria_year=? AND sel.course_name IS NULL ORDER BY course_name`, (student as { entrance_year: number }).entrance_year, (student as { entrance_year: number }).entrance_year, (student as { entrance_year: number }).entrance_year) : [];
    const requirements = await all(db, `SELECT ur.*,'exact' match_level FROM student_preferences sp JOIN university_requirements ur ON ur.admissions_year=sp.admissions_year AND ur.university=sp.university AND ur.department=sp.department LEFT JOIN reference_uploads ru ON ru.id=ur.source_upload_id WHERE sp.student_id=? AND (ur.source_upload_id IS NULL OR ru.active=1) UNION ALL SELECT ur.*,'same_department' match_level FROM student_preferences sp JOIN university_requirements ur ON ur.admissions_year=sp.admissions_year AND ur.department=sp.department AND ur.university<>sp.university LEFT JOIN reference_uploads ru ON ru.id=ur.source_upload_id WHERE sp.student_id=? AND (ur.source_upload_id IS NULL OR ru.active=1) UNION ALL SELECT tr.id,tr.admissions_year,tr.track,'' region,'' university,tr.department_group,tr.course_name,tr.recommendation_type,tr.note,tr.source_upload_id,tr.created_at,tr.updated_at,'track' match_level FROM student_preferences sp JOIN track_requirements tr ON tr.admissions_year=sp.admissions_year AND tr.department_group=sp.department LEFT JOIN reference_uploads ru ON ru.id=tr.source_upload_id WHERE sp.student_id=? AND (tr.source_upload_id IS NULL OR ru.active=1) ORDER BY match_level,university,department`, session.studentId, session.studentId, session.studentId);
    return json({ student, profile, preferences, rounds, plans, reviews, official, curriculum, courseDescriptions, requirements });
  }

  const url = new URL(request.url);
  const entranceYear = Number(url.searchParams.get('entranceYear') || new Date().getFullYear());
  const students = await all(db, `SELECT s.*, sp.career_goal, COUNT(DISTINCT p.id) plan_count FROM students s LEFT JOIN student_profiles sp ON sp.student_id=s.id LEFT JOIN plans p ON p.student_id=s.id WHERE s.entrance_year=? GROUP BY s.id ORDER BY s.current_class,s.current_number`, entranceYear);
  const plans = await all(db, `SELECT p.*, s.entrance_year,s.current_class,s.current_number,s.name,r.round_number,sp.career_goal,sp.counseling_memo FROM plans p JOIN students s ON s.id=p.student_id JOIN rounds r ON r.id=p.round_id LEFT JOIN student_profiles sp ON sp.student_id=s.id WHERE s.entrance_year=? ORDER BY s.current_class,s.current_number,r.round_number`, entranceYear);
  const planCourses = await all(db, `SELECT pc.plan_id,pc.target_grade,pc.target_semester,pc.course_name FROM plan_courses pc JOIN plans p ON p.id=pc.plan_id JOIN students s ON s.id=p.student_id WHERE s.entrance_year=? ORDER BY pc.target_grade,pc.target_semester,pc.course_name`, entranceYear);
  const planPreferences = await all(db, `SELECT sp.student_id,sp.rank,sp.university,sp.department,sp.admissions_year FROM student_preferences sp JOIN students s ON s.id=sp.student_id WHERE s.entrance_year=? ORDER BY sp.student_id,sp.rank`, entranceYear);
  // 정확 일치 자료를 먼저 반환하고, 같은 학과·계열 자료는 별도 수준으로 남겨 선생님이
  // 근거를 구분해 볼 수 있게 합니다. 유사도 기반 자동 매칭은 하지 않습니다.
  const planRequirements = await all(db, `SELECT pref.student_id,pref.rank preference_rank,ur.university,ur.department,ur.course_name,ur.recommendation_type,ur.note,'exact' match_level FROM student_preferences pref JOIN university_requirements ur ON ur.admissions_year=pref.admissions_year AND ur.university=pref.university AND ur.department=pref.department LEFT JOIN reference_uploads ru ON ru.id=ur.source_upload_id JOIN students s ON s.id=pref.student_id WHERE s.entrance_year=? AND (ur.source_upload_id IS NULL OR ru.active=1) UNION ALL SELECT pref.student_id,pref.rank preference_rank,ur.university,ur.department,ur.course_name,ur.recommendation_type,ur.note,'same_department' match_level FROM student_preferences pref JOIN university_requirements ur ON ur.admissions_year=pref.admissions_year AND ur.department=pref.department AND ur.university<>pref.university LEFT JOIN reference_uploads ru ON ru.id=ur.source_upload_id JOIN students s ON s.id=pref.student_id WHERE s.entrance_year=? AND (ur.source_upload_id IS NULL OR ru.active=1) UNION ALL SELECT pref.student_id,pref.rank preference_rank,'' university,tr.department_group department,tr.course_name,tr.recommendation_type,tr.note,'track' match_level FROM student_preferences pref JOIN track_requirements tr ON tr.admissions_year=pref.admissions_year AND tr.department_group=pref.department LEFT JOIN reference_uploads ru ON ru.id=tr.source_upload_id JOIN students s ON s.id=pref.student_id WHERE s.entrance_year=? AND (tr.source_upload_id IS NULL OR ru.active=1)`, entranceYear, entranceYear, entranceYear);
  const planReviews = await all(db, `SELECT rh.* FROM review_history rh JOIN plans p ON p.id=rh.plan_id JOIN students s ON s.id=p.student_id WHERE s.entrance_year=? ORDER BY rh.created_at DESC`, entranceYear);
  const issues = await all(db, `SELECT * FROM matching_issues WHERE entrance_year=? ORDER BY resolution,created_at DESC`, entranceYear);
  const files = await all(db, `SELECT * FROM upload_files WHERE entrance_year=? AND active=1 ORDER BY round_number,current_class,target_grade,target_semester`, entranceYear);
  const audit = await all(db, `SELECT * FROM audit_logs WHERE entrance_year=? OR entrance_year IS NULL ORDER BY created_at DESC LIMIT 100`, entranceYear);
  const rounds = await all(db, `SELECT * FROM rounds WHERE entrance_year=? ORDER BY round_number`, entranceYear);
  const curriculum = await all(db, `SELECT c.* FROM curricula c LEFT JOIN reference_uploads ru ON ru.id=c.source_upload_id WHERE c.entrance_year=? AND (c.source_upload_id IS NULL OR ru.active=1) ORDER BY c.target_grade,c.target_semester,c.area,c.course_name`, entranceYear);
  const courseDescriptions = await all(db, `SELECT s.*, sel.display_mode FROM course_description_selections sel JOIN course_description_sources s ON s.id=sel.selected_source_id WHERE sel.entrance_year=? ORDER BY s.course_name`, entranceYear);
  const referenceUploads = await all(db, `SELECT * FROM reference_uploads ORDER BY criteria_year DESC,created_at DESC`);
  const schoolCourseGuides = await all(db, `SELECT scg.* FROM school_course_guides scg JOIN reference_uploads ru ON ru.id=scg.upload_id WHERE ru.active=1 ORDER BY scg.criteria_year DESC,scg.target_grade,scg.target_semester,scg.course_name`);
  const educationOfficeCourseGuides = await all(db, `SELECT eg.* FROM education_office_course_guides eg JOIN reference_uploads ru ON ru.id=eg.upload_id WHERE ru.active=1 ORDER BY eg.criteria_year DESC,eg.subject_group,eg.course_name`);
  const universityReferenceEntries = await all(db, `SELECT ure.* FROM university_reference_entries ure JOIN reference_uploads ru ON ru.id=ure.upload_id WHERE ru.active=1 ORDER BY ure.criteria_year DESC,ure.region,ure.university,ure.department`);
  const trackReferenceEntries = await all(db, `SELECT tre.* FROM track_reference_entries tre JOIN reference_uploads ru ON ru.id=tre.upload_id WHERE ru.active=1 ORDER BY tre.criteria_year DESC,tre.track,tre.department,tre.course_name`);

  const officialRows = await all<{ student_id: string; round_number: number; target_grade: number; target_semester: number; course_name: string | null; current_class: number; current_number: number; student_name: string }>(db, `SELECT r.student_id,r.round_number,r.target_grade,r.target_semester,r.current_class,r.current_number,r.student_name,c.course_name FROM official_results r JOIN upload_files f ON f.id=r.file_id AND f.active=1 LEFT JOIN official_result_courses c ON c.result_id=r.id WHERE r.entrance_year=?`, entranceYear);
  const approvedRows = await all<{ plan_id: string; student_id: string; round_number: number; target_grade: number; target_semester: number; course_name: string | null; current_class: number; current_number: number; name: string }>(db, `SELECT p.id plan_id,p.student_id,r.round_number,pc.target_grade,pc.target_semester,pc.course_name,s.current_class,s.current_number,s.name FROM plans p JOIN rounds r ON r.id=p.round_id JOIN students s ON s.id=p.student_id LEFT JOIN plan_courses pc ON pc.plan_id=p.id WHERE s.entrance_year=? AND p.status='confirmed'`, entranceYear);
  const reviewRows = await all<any>(db, `SELECT * FROM verification_reviews`);
  const grouped = new Map<string, { studentId: string; round: number; targetGrade: number; targetSemester: number; currentClass: number; currentNumber: number; name: string; courses: string[] }>();
  for (const row of officialRows) {
    const key = `${row.student_id}:${row.round_number}:${row.target_grade}:${row.target_semester}`;
    const item = grouped.get(key) || { studentId: row.student_id, round: row.round_number, targetGrade: row.target_grade, targetSemester: row.target_semester, currentClass: row.current_class, currentNumber: row.current_number, name: row.student_name, courses: [] };
    if (row.course_name) item.courses.push(row.course_name);
    grouped.set(key, item);
  }
  const comparisons: any[] = [...grouped.values()].filter((item) => item.round === 1).map((first) => {
    const second = grouped.get(`${first.studentId}:2:${first.targetGrade}:${first.targetSemester}`);
    if (!second) return { ...first, firstCourses: first.courses, secondCourses: [], status: '2차 자료에서 확인되지 않음', review: '확인 필요' };
    const diff = compareCourseSets(first.courses, second.courses);
    return { ...first, firstCourses: first.courses, secondCourses: second.courses, status: diff.status, added: diff.added, removed: diff.removed, review: '미확인' };
  });
  for (const second of [...grouped.values()].filter((item) => item.round === 2)) {
    if (!grouped.has(`${second.studentId}:1:${second.targetGrade}:${second.targetSemester}`)) comparisons.push({ ...second, firstCourses: [], secondCourses: second.courses, status: '2차 자료에 새로 등장', review: '확인 필요' });
  }
  const approved = new Map<string, { planId: string; studentId: string; round: number; targetGrade: number; targetSemester: number; currentClass: number; currentNumber: number; name: string; courses: string[] }>();
  for (const row of approvedRows) {
    if (!row.target_grade || !row.target_semester) continue;
    const key = `${row.student_id}:${row.round_number}:${row.target_grade}:${row.target_semester}`;
    const item = approved.get(key) || { planId: row.plan_id, studentId: row.student_id, round: row.round_number, targetGrade: row.target_grade, targetSemester: row.target_semester, currentClass: row.current_class, currentNumber: row.current_number, name: row.name, courses: [] };
    if (row.course_name) item.courses.push(row.course_name);
    approved.set(key, item);
  }
  const verificationMap = new Map(reviewRows.map((row: any) => [`${row.student_id}:${row.round_number}:${row.target_grade}:${row.target_semester}`, row]));
  const validations: any[] = [];
  for (const official of grouped.values()) {
    const key = `${official.studentId}:${official.round}:${official.targetGrade}:${official.targetSemester}`;
    const plan = approved.get(key); const review = verificationMap.get(key);
    if (!plan) validations.push({ ...official, approvedCourses: [], officialCourses: official.courses, validationStatus: '승인안 없음', reviewStatus: review?.status || 'unreviewed' });
    else { const diff = compareCourseSets(plan.courses, official.courses); validations.push({ ...official, planId: plan.planId, approvedCourses: plan.courses, officialCourses: official.courses, validationStatus: diff.changed ? '불일치' : '일치', added: diff.added, removed: diff.removed, reviewStatus: review?.status || 'unreviewed' }); }
  }
  for (const plan of approved.values()) {
    const key = `${plan.studentId}:${plan.round}:${plan.targetGrade}:${plan.targetSemester}`;
    if (!grouped.has(key)) validations.push({ ...plan, approvedCourses: plan.courses, officialCourses: [], validationStatus: '실제 결과 없음', reviewStatus: verificationMap.get(key)?.status || 'unreviewed' });
  }
  return json({ entranceYear, students, plans, planCourses, planPreferences, planRequirements, planReviews, issues, files, rounds, curriculum, courseDescriptions, referenceUploads, schoolCourseGuides, educationOfficeCourseGuides, universityReferenceEntries, trackReferenceEntries, audit, comparisons, validations });
}
