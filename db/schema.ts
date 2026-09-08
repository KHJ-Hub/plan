import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
};

export const students = sqliteTable('students', {
  id: text('id').primaryKey(),
  entranceYear: integer('entrance_year').notNull(),
  currentClass: integer('current_class').notNull(),
  currentNumber: integer('current_number').notNull(),
  name: text('name').notNull(),
  externalId: text('external_id'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  ...timestamps,
}, (t) => [
  uniqueIndex('uq_students_fallback_identity').on(t.entranceYear, t.currentClass, t.currentNumber, t.name),
  index('idx_students_lookup').on(t.entranceYear, t.currentClass, t.currentNumber),
  index('idx_students_external').on(t.entranceYear, t.externalId),
]);

export const studentProfiles = sqliteTable('student_profiles', {
  studentId: text('student_id').primaryKey().references(() => students.id),
  careerGoal: text('career_goal').notNull().default(''),
  counselingMemo: text('counseling_memo').notNull().default(''),
  updatedAt: text('updated_at').notNull(),
});

export const studentPreferences = sqliteTable('student_preferences', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull().references(() => students.id),
  rank: integer('rank').notNull(),
  university: text('university').notNull(),
  department: text('department').notNull(),
  admissionsYear: integer('admissions_year').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => [uniqueIndex('uq_student_preferences_rank').on(t.studentId, t.rank)]);

export const rounds = sqliteTable('rounds', {
  id: text('id').primaryKey(),
  entranceYear: integer('entrance_year').notNull(),
  roundNumber: integer('round_number').notNull(),
  title: text('title').notNull(),
  status: text('status', { enum: ['open', 'closed'] }).notNull().default('closed'),
  officialFinalized: integer('official_finalized', { mode: 'boolean' }).notNull().default(false),
  ...timestamps,
}, (t) => [uniqueIndex('uq_rounds_year_number').on(t.entranceYear, t.roundNumber)]);

export const plans = sqliteTable('plans', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull().references(() => students.id),
  roundId: text('round_id').notNull().references(() => rounds.id),
  status: text('status', { enum: ['draft', 'pending', 'revision_requested', 'confirmed', 'recheck_required'] }).notNull().default('draft'),
  revision: integer('revision').notNull().default(1),
  studentMemo: text('student_memo').notNull().default(''),
  submittedAt: text('submitted_at'),
  confirmedAt: text('confirmed_at'),
  ...timestamps,
}, (t) => [uniqueIndex('uq_plans_student_round').on(t.studentId, t.roundId), index('idx_plans_status').on(t.status)]);

export const planCourses = sqliteTable('plan_courses', {
  id: text('id').primaryKey(),
  planId: text('plan_id').notNull().references(() => plans.id),
  targetGrade: integer('target_grade').notNull(),
  targetSemester: integer('target_semester').notNull(),
  courseName: text('course_name').notNull(),
}, (t) => [uniqueIndex('uq_plan_courses').on(t.planId, t.targetGrade, t.targetSemester, t.courseName)]);

export const reviewHistory = sqliteTable('review_history', {
  id: text('id').primaryKey(),
  planId: text('plan_id').notNull().references(() => plans.id),
  action: text('action', { enum: ['submitted', 'confirmed', 'revision_requested', 'reopened'] }).notNull(),
  actor: text('actor').notNull(),
  comment: text('comment').notNull().default(''),
  snapshotJson: text('snapshot_json').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [index('idx_review_history_plan').on(t.planId, t.createdAt)]);

export const uploadBatches = sqliteTable('upload_batches', {
  id: text('id').primaryKey(),
  entranceYear: integer('entrance_year').notNull(),
  roundNumber: integer('round_number').notNull(),
  uploadedBy: text('uploaded_by').notNull(),
  fileCount: integer('file_count').notNull(),
  studentCount: integer('student_count').notNull(),
  summaryJson: text('summary_json').notNull(),
  createdAt: text('created_at').notNull(),
});

export const uploadFiles = sqliteTable('upload_files', {
  id: text('id').primaryKey(),
  batchId: text('batch_id').notNull().references(() => uploadBatches.id),
  entranceYear: integer('entrance_year').notNull(),
  roundNumber: integer('round_number').notNull(),
  currentClass: integer('current_class').notNull(),
  targetGrade: integer('target_grade').notNull(),
  targetSemester: integer('target_semester').notNull(),
  fileName: text('file_name').notNull(),
  checksum: text('checksum').notNull(),
  studentCount: integer('student_count').notNull(),
  courseCount: integer('course_count').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  replacedFileId: text('replaced_file_id'),
  createdAt: text('created_at').notNull(),
}, (t) => [
  index('idx_upload_files_scope').on(t.entranceYear, t.roundNumber, t.currentClass, t.targetGrade, t.targetSemester, t.active),
  index('idx_upload_files_checksum').on(t.checksum),
]);

export const officialResults = sqliteTable('official_results', {
  id: text('id').primaryKey(),
  fileId: text('file_id').notNull().references(() => uploadFiles.id),
  studentId: text('student_id').notNull().references(() => students.id),
  entranceYear: integer('entrance_year').notNull(),
  roundNumber: integer('round_number').notNull(),
  currentClass: integer('current_class').notNull(),
  currentNumber: integer('current_number').notNull(),
  studentName: text('student_name').notNull(),
  targetGrade: integer('target_grade').notNull(),
  targetSemester: integer('target_semester').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [index('idx_official_result_compare').on(t.entranceYear, t.roundNumber, t.studentId, t.targetGrade, t.targetSemester)]);

export const officialResultCourses = sqliteTable('official_result_courses', {
  id: text('id').primaryKey(),
  resultId: text('result_id').notNull().references(() => officialResults.id),
  courseName: text('course_name').notNull(),
}, (t) => [uniqueIndex('uq_official_result_course').on(t.resultId, t.courseName)]);

export const matchingIssues = sqliteTable('matching_issues', {
  id: text('id').primaryKey(),
  entranceYear: integer('entrance_year').notNull(),
  fromRound: integer('from_round').notNull(),
  toRound: integer('to_round').notNull(),
  studentId: text('student_id'),
  issueType: text('issue_type', { enum: ['missing_in_next', 'new_in_next', 'name_mismatch', 'identity_changed'] }).notNull(),
  detailsJson: text('details_json').notNull(),
  resolution: text('resolution', { enum: ['pending', 'normal', 'excluded'] }).notNull().default('pending'),
  adminMemo: text('admin_memo').notNull().default(''),
  updatedAt: text('updated_at').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [index('idx_matching_issues_pending').on(t.entranceYear, t.resolution)]);

export const verificationReviews = sqliteTable('verification_reviews', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull().references(() => students.id),
  roundNumber: integer('round_number').notNull(),
  targetGrade: integer('target_grade').notNull(),
  targetSemester: integer('target_semester').notNull(),
  status: text('status', { enum: ['unreviewed', 'confirmed', 'student_check'] }).notNull().default('unreviewed'),
  memo: text('memo').notNull().default(''),
  updatedBy: text('updated_by').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => [uniqueIndex('uq_verification_review').on(t.studentId, t.roundNumber, t.targetGrade, t.targetSemester)]);

export const curricula = sqliteTable('curricula', {
  id: text('id').primaryKey(),
  entranceYear: integer('entrance_year').notNull(),
  targetGrade: integer('target_grade').notNull(),
  targetSemester: integer('target_semester').notNull(),
  area: text('area').notNull(),
  courseName: text('course_name').notNull(),
  selectionType: text('selection_type', { enum: ['general', 'career', 'convergence'] }).notNull(),
  offered: integer('offered', { mode: 'boolean' }).notNull().default(true),
  note: text('note').notNull().default(''),
  ...timestamps,
}, (t) => [uniqueIndex('uq_curriculum_course').on(t.entranceYear, t.targetGrade, t.targetSemester, t.courseName)]);

export const universityRequirements = sqliteTable('university_requirements', {
  id: text('id').primaryKey(),
  admissionsYear: integer('admissions_year').notNull(),
  track: text('track').notNull().default(''),
  region: text('region').notNull().default(''),
  university: text('university').notNull(),
  department: text('department').notNull(),
  courseName: text('course_name').notNull(),
  recommendationType: text('recommendation_type', { enum: ['core', 'recommended'] }).notNull(),
  note: text('note').notNull().default(''),
  ...timestamps,
}, (t) => [index('idx_university_requirements_match').on(t.admissionsYear, t.university, t.department)]);

export const trackRequirements = sqliteTable('track_requirements', {
  id: text('id').primaryKey(),
  admissionsYear: integer('admissions_year').notNull(),
  track: text('track').notNull(),
  departmentGroup: text('department_group').notNull(),
  courseName: text('course_name').notNull(),
  note: text('note').notNull().default(''),
  ...timestamps,
}, (t) => [index('idx_track_requirements_match').on(t.admissionsYear, t.track, t.departmentGroup)]);

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  entranceYear: integer('entrance_year'),
  currentClass: integer('current_class'),
  targetGrade: integer('target_grade'),
  targetSemester: integer('target_semester'),
  detailsJson: text('details_json').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [index('idx_audit_logs_time').on(t.createdAt)]);
