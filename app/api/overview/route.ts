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
    const curriculum = student ? await all(db, `SELECT * FROM curricula WHERE entrance_year=? AND offered=1 ORDER BY target_grade,target_semester,area,course_name`, (student as { entrance_year: number }).entrance_year) : [];
    const courseDescriptions = student ? await all(db, `SELECT s.*, sel.display_mode FROM course_description_selections sel JOIN course_description_sources s ON s.id=sel.selected_source_id WHERE sel.entrance_year=? ORDER BY s.course_name`, (student as { entrance_year: number }).entrance_year) : [];
    const requirements = await all(db, `SELECT ur.* FROM university_requirements ur JOIN student_preferences sp ON sp.student_id=? AND sp.admissions_year=ur.admissions_year AND sp.university=ur.university AND sp.department=ur.department ORDER BY ur.university, ur.department`, session.studentId);
    return json({ student, profile, preferences, rounds, plans, reviews, official, curriculum, courseDescriptions, requirements });
  }

  const url = new URL(request.url);
  const entranceYear = Number(url.searchParams.get('entranceYear') || new Date().getFullYear());
  const students = await all(db, `SELECT s.*, sp.career_goal, COUNT(DISTINCT p.id) plan_count FROM students s LEFT JOIN student_profiles sp ON sp.student_id=s.id LEFT JOIN plans p ON p.student_id=s.id WHERE s.entrance_year=? GROUP BY s.id ORDER BY s.current_class,s.current_number`, entranceYear);
  const plans = await all(db, `SELECT p.*, s.current_class,s.current_number,s.name,r.round_number FROM plans p JOIN students s ON s.id=p.student_id JOIN rounds r ON r.id=p.round_id WHERE s.entrance_year=? ORDER BY s.current_class,s.current_number`, entranceYear);
  const issues = await all(db, `SELECT * FROM matching_issues WHERE entrance_year=? ORDER BY resolution,created_at DESC`, entranceYear);
  const files = await all(db, `SELECT * FROM upload_files WHERE entrance_year=? AND active=1 ORDER BY round_number,current_class,target_grade,target_semester`, entranceYear);
  const audit = await all(db, `SELECT * FROM audit_logs WHERE entrance_year=? OR entrance_year IS NULL ORDER BY created_at DESC LIMIT 100`, entranceYear);
  const rounds = await all(db, `SELECT * FROM rounds WHERE entrance_year=? ORDER BY round_number`, entranceYear);
  const curriculum = await all(db, `SELECT * FROM curricula WHERE entrance_year=? ORDER BY target_grade,target_semester,area,course_name`, entranceYear);
  const courseDescriptions = await all(db, `SELECT s.*, sel.display_mode FROM course_description_selections sel JOIN course_description_sources s ON s.id=sel.selected_source_id WHERE sel.entrance_year=? ORDER BY s.course_name`, entranceYear);

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
  return json({ entranceYear, students, plans, issues, files, rounds, curriculum, courseDescriptions, audit, comparisons, validations });
}
