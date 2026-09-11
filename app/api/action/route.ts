import { getDatabase } from '@/db';
import { normalizeCourseName } from '@/lib/domain.mjs';
import { id, json, now, requireSession } from '@/lib/server';
import { changeTeacherPassword } from '@/lib/teacher-auth';

export async function POST(request: Request) {
  const session = await requireSession(request);
  const body = await request.json() as Record<string, any>;
  const db = getDatabase();
  const time = now();

  if (session.role === 'student') {
    if (body.action === 'saveProfile') {
      const lockedPlan = await db.prepare(`SELECT id FROM plans WHERE student_id=? AND status IN ('submitted','resubmitted','pending','confirmed','recheck_required') LIMIT 1`).bind(session.studentId).first();
      if (lockedPlan) return json({ error: '제출 완료된 신청안은 담임이 수정 요청할 때까지 진로 정보와 희망 대학·학과를 수정할 수 없습니다.' }, { status: 409 });
      const careerGoal = String(body.careerGoal || '').trim();
      const counselingMemo = String(body.counselingMemo || '').trim();
      const preferences = (Array.isArray(body.preferences) ? body.preferences : []).slice(0, 3).filter((p: any) => p.university || p.department).map((p: any, rank: number) => ({ rank: rank + 1, university: String(p.university || '').trim(), department: String(p.department || '').trim(), admissionsYear: Number(p.admissionsYear || 2028) }));
      await db.batch([
        db.prepare(`INSERT INTO student_profiles(student_id,career_goal,counseling_memo,updated_at) VALUES(?,?,?,?) ON CONFLICT(student_id) DO UPDATE SET career_goal=excluded.career_goal,counseling_memo=excluded.counseling_memo,updated_at=excluded.updated_at`).bind(session.studentId, careerGoal, counselingMemo, time),
        db.prepare(`DELETE FROM student_preferences WHERE student_id=?`).bind(session.studentId),
        ...preferences.map((p) => db.prepare(`INSERT INTO student_preferences(id,student_id,rank,university,department,admissions_year,updated_at) VALUES(?,?,?,?,?,?,?)`).bind(id('pref'), session.studentId, p.rank, p.university, p.department, p.admissionsYear, time)),
      ]);
      return json({ ok: true, statusChanged: false });
    }
    if (body.action === 'savePlan') {
      const round = await db.prepare(`SELECT id,status FROM rounds WHERE id=? AND entrance_year=(SELECT entrance_year FROM students WHERE id=?)`).bind(body.roundId, session.studentId).first<{ id: string; status: string }>();
      if (!round || round.status !== 'open') return json({ error: '현재 신청 기간이 마감되어 있습니다.' }, { status: 409 });
      let plan = await db.prepare(`SELECT id,status FROM plans WHERE student_id=? AND round_id=?`).bind(session.studentId, round.id).first<{ id: string; status: string }>();
      if (plan && ['submitted','resubmitted','pending','confirmed','recheck_required'].includes(plan.status)) return json({ error: '제출 완료된 신청안은 담임이 수정 요청할 때까지 수정할 수 없습니다.' }, { status: 409 });
      const planId = plan?.id || id('plan');
      const status = plan?.status || 'draft';
      const statements: D1PreparedStatement[] = [
        db.prepare(`INSERT INTO plans(id,student_id,round_id,status,revision,student_memo,submitted_at,confirmed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(student_id,round_id) DO UPDATE SET status=excluded.status,student_memo=excluded.student_memo,updated_at=excluded.updated_at,revision=CASE WHEN plans.status='revision_requested' THEN plans.revision+1 ELSE plans.revision END`).bind(planId, session.studentId, round.id, status, 1, String(body.studentMemo || ''), null, null, time, time),
        db.prepare(`DELETE FROM plan_courses WHERE plan_id=?`).bind(planId),
      ];
      for (const item of Array.isArray(body.courses) ? body.courses : []) statements.push(db.prepare(`INSERT INTO plan_courses(id,plan_id,target_grade,target_semester,course_name) VALUES(?,?,?,?,?)`).bind(id('pc'), planId, Number(item.targetGrade), Number(item.targetSemester), String(item.courseName).trim()));
      await db.batch(statements);
      return json({ ok: true, planId, status });
    }
    if (body.action === 'submitPlan') {
      const plan = await db.prepare(`SELECT p.id,p.status,r.status round_status FROM plans p JOIN rounds r ON r.id=p.round_id WHERE p.id=? AND p.student_id=?`).bind(body.planId, session.studentId).first<{ id: string; status: string; round_status: string }>();
      if (!plan || plan.round_status !== 'open') return json({ error: '제출할 수 없는 신청안입니다.' }, { status: 409 });
      if (['submitted','resubmitted','pending','confirmed','recheck_required'].includes(plan.status)) return json({ error: '이미 제출 완료된 신청안입니다.' }, { status: 409 });
      const submissionStatus = plan.status === 'revision_requested' ? 'resubmitted' : 'submitted';
      const snapshot = body.snapshot || {};
      await db.batch([
        db.prepare(`UPDATE plans SET status=?,submitted_at=?,updated_at=? WHERE id=?`).bind(submissionStatus, time, time, plan.id),
        db.prepare(`INSERT INTO plan_submission_snapshots(id,plan_id,submission_status,snapshot_json,submitted_at) VALUES(?,?,?,?,?)`).bind(id('submission'), plan.id, submissionStatus, JSON.stringify(snapshot), time),
        db.prepare(`INSERT INTO review_history(id,plan_id,action,actor,comment,snapshot_json,created_at) VALUES(?,?,?,?,?,?,?)`).bind(id('review'), plan.id, submissionStatus, session.actor, '', JSON.stringify(snapshot), time),
      ]);
      return json({ ok: true });
    }
  }

  if (session.role !== 'admin') return json({ error: '권한이 없습니다.' }, { status: 403 });
  if (body.action === 'setRound') {
    const entranceYear = Number(body.entranceYear); const roundNumber = Number(body.roundNumber);
    const roundId = `round_${entranceYear}_${roundNumber}`;
    await db.batch([
      db.prepare(`INSERT INTO rounds(id,entrance_year,round_number,title,status,official_finalized,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(entrance_year,round_number) DO UPDATE SET title=excluded.title,status=excluded.status,updated_at=excluded.updated_at`).bind(roundId, entranceYear, roundNumber, String(body.title || `${roundNumber}차 신청`), body.status === 'open' ? 'open' : 'closed', 0, time, time),
      db.prepare(`INSERT INTO audit_logs(id,actor,action,entrance_year,details_json,created_at) VALUES(?,?,?,?,?,?)`).bind(id('audit'), session.actor, body.status === 'open' ? '신청 기간 열기' : '신청 기간 마감', entranceYear, JSON.stringify({ roundNumber }), time),
    ]);
    let generatedPlans = 0;
    if (body.status === 'open' && roundNumber > 1) {
      const previousRows = (await db.prepare(`SELECT r.student_id,r.target_grade,r.target_semester,c.course_name FROM official_results r JOIN upload_files f ON f.id=r.file_id AND f.active=1 LEFT JOIN official_result_courses c ON c.result_id=r.id WHERE r.entrance_year=? AND r.round_number=? ORDER BY r.student_id,r.target_grade,r.target_semester`).bind(entranceYear, roundNumber - 1).all<{ student_id: string; target_grade: number; target_semester: number; course_name: string | null }>()).results || [];
      const studentIds = [...new Set(previousRows.map((row) => row.student_id))];
      for (const studentId of studentIds) {
        const planId = `plan_${studentId}_${roundId}`;
        const existing = await db.prepare(`SELECT id FROM plans WHERE student_id=? AND round_id=?`).bind(studentId, roundId).first();
        if (existing) continue;
        const statements: D1PreparedStatement[] = [db.prepare(`INSERT INTO plans(id,student_id,round_id,status,revision,student_memo,submitted_at,confirmed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(planId, studentId, roundId, 'draft', 1, '', null, null, time, time)];
        for (const row of previousRows.filter((item) => item.student_id === studentId && item.course_name)) statements.push(db.prepare(`INSERT OR IGNORE INTO plan_courses(id,plan_id,target_grade,target_semester,course_name) VALUES(?,?,?,?,?)`).bind(id('pc'), planId, row.target_grade, row.target_semester, row.course_name));
        await db.batch(statements); generatedPlans++;
      }
    }
    return json({ ok: true, generatedPlans });
  }
  if (body.action === 'reviewPlan') {
    const status = 'revision_requested';
    if (!String(body.comment || '').trim()) return json({ error: '수정 요청 내용을 입력해주세요.' }, { status: 400 });
    await db.batch([
      db.prepare(`UPDATE plans SET status=?,confirmed_at=NULL,updated_at=? WHERE id=?`).bind(status, time, body.planId),
      db.prepare(`INSERT INTO review_history(id,plan_id,action,actor,comment,snapshot_json,created_at) SELECT ?,id,?,?,?,COALESCE((SELECT json_group_array(json_object('targetGrade',target_grade,'targetSemester',target_semester,'courseName',course_name)) FROM plan_courses WHERE plan_id=plans.id),'[]'),? FROM plans WHERE id=?`).bind(id('review'), status, session.actor, String(body.comment || ''), time, body.planId),
      db.prepare(`INSERT INTO audit_logs(id,actor,action,details_json,created_at) VALUES(?,?,?,?,?)`).bind(id('audit'), session.actor, '수정 요청', JSON.stringify({ planId: body.planId, comment: body.comment || '' }), time),
    ]);
    return json({ ok: true });
  }
  if (body.action === 'changeTeacherPassword') {
    const result = await changeTeacherPassword(String(body.currentPassword || ''), String(body.newPassword || ''), session.actor);
    if (!result.ok) return json({ error: result.error }, { status: 403 });
    await db.prepare(`INSERT INTO audit_logs(id,actor,action,details_json,created_at) VALUES(?,?,?,?,?)`).bind(id('audit'), session.actor, '선생님 로그인 비밀번호 변경', JSON.stringify({ sessionVersion: result.sessionVersion }), time).run();
    return json({ ok: true, sessionVersion: result.sessionVersion });
  }
  if (body.action === 'saveCurriculum') {
    const c = body.course || {};
    await db.prepare(`INSERT INTO curricula(id,entrance_year,target_grade,target_semester,area,course_name,selection_type,offered,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(entrance_year,target_grade,target_semester,course_name) DO UPDATE SET area=excluded.area,selection_type=excluded.selection_type,offered=excluded.offered,note=excluded.note,updated_at=excluded.updated_at`).bind(id('course'), Number(c.entranceYear), Number(c.targetGrade), Number(c.targetSemester), String(c.area || '').trim(), String(c.courseName || '').trim(), c.selectionType || 'general', c.offered === false ? 0 : 1, String(c.note || ''), time, time).run();
    return json({ ok: true });
  }
  if (body.action === 'saveCourseDescription') {
    const d = body.description || {};
    const entranceYear = Number(d.entranceYear);
    const courseName = normalizeCourseName(d.courseName);
    if (!entranceYear || !courseName) return json({ error: '입학년도와 과목명을 입력해주세요.' }, { status: 400 });
    const existing = await db.prepare(`SELECT id FROM course_description_sources WHERE entrance_year=? AND course_name=? AND source_kind='manual' ORDER BY updated_at DESC LIMIT 1`).bind(entranceYear, courseName).first<{ id: string }>();
    const sourceId = existing?.id || id('course_desc');
    const selectionType = ['general', 'career', 'convergence'].includes(d.selectionType) ? d.selectionType : null;
    const grade = [2, 3].includes(Number(d.recommendedGrade)) ? Number(d.recommendedGrade) : null;
    const semester = [1, 2].includes(Number(d.recommendedSemester)) ? Number(d.recommendedSemester) : null;
    await db.batch([
      db.prepare(`INSERT INTO course_description_sources(id,entrance_year,course_name,overview,learning_content,course_nature,related_careers,recommended_grade,recommended_semester,selection_type,note,source_kind,source_name,source_year,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET overview=excluded.overview,learning_content=excluded.learning_content,course_nature=excluded.course_nature,related_careers=excluded.related_careers,recommended_grade=excluded.recommended_grade,recommended_semester=excluded.recommended_semester,selection_type=excluded.selection_type,note=excluded.note,source_name=excluded.source_name,source_year=excluded.source_year,updated_at=excluded.updated_at`).bind(sourceId, entranceYear, courseName, String(d.overview || '').trim(), String(d.learningContent || '').trim(), String(d.courseNature || '').trim(), String(d.relatedCareers || '').trim(), grade, semester, selectionType, String(d.note || '').trim(), 'manual', String(d.sourceName || '선생님 직접 입력').trim(), Number(d.sourceYear) || null, time, time),
      db.prepare(`INSERT INTO course_description_selections(id,entrance_year,course_name,selected_source_id,display_mode,updated_by,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(entrance_year,course_name) DO UPDATE SET selected_source_id=excluded.selected_source_id,display_mode=excluded.display_mode,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(id('course_desc_selection'), entranceYear, courseName, sourceId, 'manual', session.actor, time),
      db.prepare(`INSERT INTO audit_logs(id,actor,action,entrance_year,details_json,created_at) VALUES(?,?,?,?,?,?)`).bind(id('audit'), session.actor, '과목 설명 저장', entranceYear, JSON.stringify({ courseName, sourceKind: 'manual' }), time),
    ]);
    return json({ ok: true, sourceId });
  }
  if (body.action === 'selectCourseDescriptionSource') {
    const entranceYear = Number(body.entranceYear); const courseName = normalizeCourseName(body.courseName);
    const displayMode = ['manual', 'official', 'merged'].includes(body.displayMode) ? body.displayMode : null;
    if (!entranceYear || !courseName || !displayMode || !body.sourceId) return json({ error: '설명 선택 정보를 확인해주세요.' }, { status: 400 });
    const source = await db.prepare(`SELECT id,source_kind FROM course_description_sources WHERE id=? AND entrance_year=? AND course_name=?`).bind(String(body.sourceId), entranceYear, courseName).first<{ id: string; source_kind: string }>();
    if (!source || source.source_kind !== displayMode) return json({ error: '선택할 수 없는 과목 설명입니다.' }, { status: 409 });
    await db.prepare(`INSERT INTO course_description_selections(id,entrance_year,course_name,selected_source_id,display_mode,updated_by,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(entrance_year,course_name) DO UPDATE SET selected_source_id=excluded.selected_source_id,display_mode=excluded.display_mode,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(id('course_desc_selection'), entranceYear, courseName, source.id, displayMode, session.actor, time).run();
    return json({ ok: true });
  }
  // 공식 자료 파일을 읽는 UI가 추가되면 정규화된 행을 이 작업으로 전달합니다. 이름이
  // 완전히 같은 경우만 exact_match이며, 그 외에는 어떤 경우도 자동 적용하지 않습니다.
  if (body.action === 'previewCourseDescriptionImport') {
    const entranceYear = Number(body.entranceYear); const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!entranceYear || !String(body.sourceName || '').trim()) return json({ error: '입학년도와 자료 출처를 입력해주세요.' }, { status: 400 });
    const knownRows = await db.prepare(`SELECT course_name FROM curricula WHERE entrance_year=? UNION SELECT course_name FROM course_description_sources WHERE entrance_year=?`).bind(entranceYear, entranceYear).all<{ course_name: string }>();
    const known = new Set((knownRows.results || []).map((row) => normalizeCourseName(row.course_name)));
    const batchId = id('course_desc_import');
    const statements: D1PreparedStatement[] = [db.prepare(`INSERT INTO course_description_import_batches(id,entrance_year,source_name,source_year,uploaded_by,status,created_at) VALUES(?,?,?,?,?,?,?)`).bind(batchId, entranceYear, String(body.sourceName).trim(), Number(body.sourceYear) || null, session.actor, 'preview', time)];
    const preview = rows.map((row: any) => {
      const incomingCourseName = String(row.courseName || ''); const normalized = normalizeCourseName(incomingCourseName);
      const matchStatus = normalized && known.has(normalized) ? 'exact_match' : 'needs_confirmation';
      const rowId = id('course_desc_import_row');
      statements.push(db.prepare(`INSERT INTO course_description_import_rows(id,batch_id,incoming_course_name,normalized_course_name,payload_json,match_status,matched_course_name,decision,created_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind(rowId, batchId, incomingCourseName, normalized, JSON.stringify(row), matchStatus, matchStatus === 'exact_match' ? normalized : null, 'pending', time));
      return { id: rowId, incomingCourseName, normalizedCourseName: normalized, matchStatus, matchedCourseName: matchStatus === 'exact_match' ? normalized : null };
    });
    await db.batch(statements);
    return json({ ok: true, batchId, preview });
  }
  if (body.action === 'resolveIssue') {
    await db.prepare(`UPDATE matching_issues SET resolution=?,admin_memo=?,updated_at=? WHERE id=?`).bind(body.resolution, String(body.memo || ''), time, body.issueId).run();
    return json({ ok: true });
  }
  if (body.action === 'reviewVerification') {
    const rows = Array.isArray(body.items) ? body.items : [];
    const statements = rows.map((item: any) => db.prepare(`INSERT INTO verification_reviews(id,student_id,round_number,target_grade,target_semester,status,memo,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(student_id,round_number,target_grade,target_semester) DO UPDATE SET status=excluded.status,memo=excluded.memo,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(id('verify'), item.studentId, Number(item.roundNumber), Number(item.targetGrade), Number(item.targetSemester), item.status === 'student_check' ? 'student_check' : 'confirmed', String(item.memo || ''), session.actor, time));
    if (statements.length) await db.batch(statements);
    await db.prepare(`INSERT INTO audit_logs(id,actor,action,details_json,created_at) VALUES(?,?,?,?,?)`).bind(id('audit'), session.actor, rows.length > 1 ? '일치 결과 일괄 확인' : '공식 결과 검증 확인', JSON.stringify({ count: rows.length }), time).run();
    return json({ ok: true, count: rows.length });
  }
  return json({ error: '지원하지 않는 작업입니다.' }, { status: 400 });
}
