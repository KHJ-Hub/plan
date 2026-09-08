import { getDatabase } from '@/db';
import { id, json, now, requireSession } from '@/lib/server';

export async function POST(request: Request) {
  const session = await requireSession(request);
  const body = await request.json() as Record<string, any>;
  const db = getDatabase();
  const time = now();

  if (session.role === 'student') {
    if (body.action === 'saveProfile') {
      const existingConfirmed = await db.prepare(`SELECT COUNT(*) count FROM plans WHERE student_id=? AND status='confirmed'`).bind(session.studentId).first<{ count: number }>();
      await db.batch([
        db.prepare(`INSERT INTO student_profiles(student_id,career_goal,counseling_memo,updated_at) VALUES(?,?,?,?) ON CONFLICT(student_id) DO UPDATE SET career_goal=excluded.career_goal,counseling_memo=excluded.counseling_memo,updated_at=excluded.updated_at`).bind(session.studentId, String(body.careerGoal || '').trim(), String(body.counselingMemo || '').trim(), time),
        db.prepare(`DELETE FROM student_preferences WHERE student_id=?`).bind(session.studentId),
        ...(Array.isArray(body.preferences) ? body.preferences.slice(0, 3).filter((p: any) => p.university || p.department).map((p: any, rank: number) => db.prepare(`INSERT INTO student_preferences(id,student_id,rank,university,department,admissions_year,updated_at) VALUES(?,?,?,?,?,?,?)`).bind(id('pref'), session.studentId, rank + 1, String(p.university || '').trim(), String(p.department || '').trim(), Number(p.admissionsYear || 2028), time)) : []),
        ...(existingConfirmed?.count ? [db.prepare(`UPDATE plans SET status='recheck_required',revision=revision+1,updated_at=? WHERE student_id=? AND status='confirmed'`).bind(time, session.studentId)] : []),
      ]);
      return json({ ok: true, statusChanged: Boolean(existingConfirmed?.count) });
    }
    if (body.action === 'savePlan') {
      const round = await db.prepare(`SELECT id,status FROM rounds WHERE id=? AND entrance_year=(SELECT entrance_year FROM students WHERE id=?)`).bind(body.roundId, session.studentId).first<{ id: string; status: string }>();
      if (!round || round.status !== 'open') return json({ error: '현재 신청 기간이 마감되어 있습니다.' }, { status: 409 });
      let plan = await db.prepare(`SELECT id,status FROM plans WHERE student_id=? AND round_id=?`).bind(session.studentId, round.id).first<{ id: string; status: string }>();
      if (plan && ['pending'].includes(plan.status)) return json({ error: '담임 확인 대기 중에는 수정할 수 없습니다.' }, { status: 409 });
      const planId = plan?.id || id('plan');
      const requestedEdit = plan?.status === 'confirmed';
      const status = requestedEdit ? 'recheck_required' : (plan?.status === 'revision_requested' ? 'draft' : plan?.status || 'draft');
      const statements: D1PreparedStatement[] = [
        db.prepare(`INSERT INTO plans(id,student_id,round_id,status,revision,student_memo,submitted_at,confirmed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(student_id,round_id) DO UPDATE SET status=excluded.status,student_memo=excluded.student_memo,updated_at=excluded.updated_at,revision=CASE WHEN plans.status='confirmed' THEN plans.revision+1 ELSE plans.revision END`).bind(planId, session.studentId, round.id, status, 1, String(body.studentMemo || ''), null, null, time, time),
        db.prepare(`DELETE FROM plan_courses WHERE plan_id=?`).bind(planId),
      ];
      for (const item of Array.isArray(body.courses) ? body.courses : []) statements.push(db.prepare(`INSERT INTO plan_courses(id,plan_id,target_grade,target_semester,course_name) VALUES(?,?,?,?,?)`).bind(id('pc'), planId, Number(item.targetGrade), Number(item.targetSemester), String(item.courseName).trim()));
      if (requestedEdit) statements.push(db.prepare(`INSERT INTO review_history(id,plan_id,action,actor,comment,snapshot_json,created_at) VALUES(?,?,?,?,?,?,?)`).bind(id('review'), planId, 'reopened', session.actor, '학생이 확인 완료 후 수정을 시작함', JSON.stringify(body.courses || []), time));
      await db.batch(statements);
      return json({ ok: true, planId, status });
    }
    if (body.action === 'submitPlan') {
      const plan = await db.prepare(`SELECT p.id,r.status round_status FROM plans p JOIN rounds r ON r.id=p.round_id WHERE p.id=? AND p.student_id=?`).bind(body.planId, session.studentId).first<{ id: string; round_status: string }>();
      if (!plan || plan.round_status !== 'open') return json({ error: '제출할 수 없는 신청안입니다.' }, { status: 409 });
      await db.batch([
        db.prepare(`UPDATE plans SET status='pending',submitted_at=?,updated_at=? WHERE id=?`).bind(time, time, plan.id),
        db.prepare(`INSERT INTO review_history(id,plan_id,action,actor,comment,snapshot_json,created_at) VALUES(?,?,?,?,?,?,?)`).bind(id('review'), plan.id, 'submitted', session.actor, '', JSON.stringify(body.snapshot || {}), time),
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
    const status = body.decision === 'confirmed' ? 'confirmed' : 'revision_requested';
    if (status === 'revision_requested' && !String(body.comment || '').trim()) return json({ error: '수정 요청 내용을 입력해주세요.' }, { status: 400 });
    await db.batch([
      db.prepare(`UPDATE plans SET status=?,confirmed_at=?,updated_at=? WHERE id=?`).bind(status, status === 'confirmed' ? time : null, time, body.planId),
      db.prepare(`INSERT INTO review_history(id,plan_id,action,actor,comment,snapshot_json,created_at) SELECT ?,id,?,?,?,COALESCE((SELECT json_group_array(json_object('targetGrade',target_grade,'targetSemester',target_semester,'courseName',course_name)) FROM plan_courses WHERE plan_id=plans.id),'[]'),? FROM plans WHERE id=?`).bind(id('review'), status === 'confirmed' ? 'confirmed' : 'revision_requested', session.actor, String(body.comment || ''), time, body.planId),
      db.prepare(`INSERT INTO audit_logs(id,actor,action,details_json,created_at) VALUES(?,?,?,?,?)`).bind(id('audit'), session.actor, status === 'confirmed' ? '담임 확인 완료' : '수정 요청', JSON.stringify({ planId: body.planId, comment: body.comment || '' }), time),
    ]);
    return json({ ok: true });
  }
  if (body.action === 'saveCurriculum') {
    const c = body.course || {};
    await db.prepare(`INSERT INTO curricula(id,entrance_year,target_grade,target_semester,area,course_name,selection_type,offered,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(entrance_year,target_grade,target_semester,course_name) DO UPDATE SET area=excluded.area,selection_type=excluded.selection_type,offered=excluded.offered,note=excluded.note,updated_at=excluded.updated_at`).bind(id('course'), Number(c.entranceYear), Number(c.targetGrade), Number(c.targetSemester), String(c.area || '').trim(), String(c.courseName || '').trim(), c.selectionType || 'general', c.offered === false ? 0 : 1, String(c.note || ''), time, time).run();
    return json({ ok: true });
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
