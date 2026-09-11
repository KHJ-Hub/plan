import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
};

export const students = sqliteTable('students', {
  id: text('id').primaryKey(),
  entranceYear: integer('entrance_year').notNull(),
  // 현재 학년은 학생의 현재 소속 정보입니다. 수강신청 파일의 2·3학년 표기는
  // target_grade(신청 대상 학년)에만 기록하며 이 값으로 덮어쓰지 않습니다.
  currentGrade: integer('current_grade').notNull().default(1),
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
  academicTrack: text('academic_track', { enum: ['humanities', 'science', 'undecided'] }).notNull().default('undecided'),
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
  // 이전 승인형 상태는 운영 이력 호환을 위해 남긴다. 새 흐름은 submitted / resubmitted와
  // revision_requested만 사용하며, 문제가 없는 제출안에 별도 승인 처리는 하지 않는다.
  status: text('status', { enum: ['draft', 'submitted', 'resubmitted', 'revision_requested', 'pending', 'confirmed', 'recheck_required'] }).notNull().default('draft'),
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

// 공식 결과는 학생이 마지막으로 제출한 신청안과 비교한다. 수정 요청 뒤 학생이 다시
// 편집하는 동안 현재 plans/plan_courses가 바뀌어도 마지막 제출본은 이 테이블에 보존된다.
export const planSubmissionSnapshots = sqliteTable('plan_submission_snapshots', {
  id: text('id').primaryKey(),
  planId: text('plan_id').notNull().references(() => plans.id),
  submissionStatus: text('submission_status', { enum: ['submitted', 'resubmitted', 'legacy'] }).notNull(),
  snapshotJson: text('snapshot_json').notNull(),
  submittedAt: text('submitted_at').notNull(),
}, (t) => [index('idx_plan_submission_snapshots_plan').on(t.planId, t.submittedAt)]);

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
  // null은 선생님이 직접 관리하는 기존 과목, 값이 있으면 기준자료 업로드에서 온 과목입니다.
  sourceUploadId: text('source_upload_id'),
  ...timestamps,
}, (t) => [uniqueIndex('uq_curriculum_course').on(t.entranceYear, t.targetGrade, t.targetSemester, t.courseName)]);

// 과목 설명의 원문은 출처별로 보존합니다. 수동 입력과 공식 자료를 한 행에 섞지 않아
// 향후 공식 자료를 가져와도 선생님이 기존 설명을 안전하게 비교·선택할 수 있습니다.
export const courseDescriptionSources = sqliteTable('course_description_sources', {
  id: text('id').primaryKey(),
  entranceYear: integer('entrance_year').notNull(),
  courseName: text('course_name').notNull(),
  overview: text('overview').notNull().default(''),
  learningContent: text('learning_content').notNull().default(''),
  courseNature: text('course_nature').notNull().default(''),
  relatedCareers: text('related_careers').notNull().default(''),
  recommendedGrade: integer('recommended_grade'),
  recommendedSemester: integer('recommended_semester'),
  selectionType: text('selection_type', { enum: ['general', 'career', 'convergence'] }),
  note: text('note').notNull().default(''),
  sourceKind: text('source_kind', { enum: ['manual', 'official', 'merged'] }).notNull(),
  sourceName: text('source_name').notNull().default(''),
  sourceYear: integer('source_year'),
  ...timestamps,
}, (t) => [
  index('idx_course_description_sources_course').on(t.entranceYear, t.courseName, t.sourceKind),
]);

// 학생에게 우선 표시할 설명을 명시적으로 선택합니다. 기본값은 수동 입력일 수 있고,
// 공식 자료 수입 뒤에는 공식 설명 또는 병합 설명으로 안전하게 전환할 수 있습니다.
export const courseDescriptionSelections = sqliteTable('course_description_selections', {
  id: text('id').primaryKey(),
  entranceYear: integer('entrance_year').notNull(),
  courseName: text('course_name').notNull(),
  selectedSourceId: text('selected_source_id').notNull().references(() => courseDescriptionSources.id),
  displayMode: text('display_mode', { enum: ['manual', 'official', 'merged'] }).notNull(),
  updatedBy: text('updated_by').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => [uniqueIndex('uq_course_description_selection').on(t.entranceYear, t.courseName)]);

// 공식 안내 자료 수입 시 원본 행과 매칭 결과를 별도 보관합니다. 완전 일치하지 않는
// 과목명은 needs_confirmation으로만 기록하며, 유사도 기반 자동 병합을 하지 않습니다.
export const courseDescriptionImportBatches = sqliteTable('course_description_import_batches', {
  id: text('id').primaryKey(),
  entranceYear: integer('entrance_year').notNull(),
  sourceName: text('source_name').notNull(),
  sourceYear: integer('source_year'),
  uploadedBy: text('uploaded_by').notNull(),
  status: text('status', { enum: ['preview', 'applied', 'cancelled'] }).notNull().default('preview'),
  createdAt: text('created_at').notNull(),
});

export const courseDescriptionImportRows = sqliteTable('course_description_import_rows', {
  id: text('id').primaryKey(),
  batchId: text('batch_id').notNull().references(() => courseDescriptionImportBatches.id),
  incomingCourseName: text('incoming_course_name').notNull(),
  normalizedCourseName: text('normalized_course_name').notNull(),
  payloadJson: text('payload_json').notNull(),
  matchStatus: text('match_status', { enum: ['exact_match', 'needs_confirmation', 'new_course'] }).notNull(),
  matchedCourseName: text('matched_course_name'),
  decision: text('decision', { enum: ['pending', 'keep_existing', 'replace_official', 'merge', 'skip'] }).notNull().default('pending'),
  appliedSourceId: text('applied_source_id'),
  createdAt: text('created_at').notNull(),
}, (t) => [index('idx_course_description_import_rows_batch').on(t.batchId, t.matchStatus)]);

// 초기 비밀번호는 운영 환경 비밀값으로만 두고, 선생님이 변경한 뒤에는 평문 대신
// PBKDF2 해시와 세션 버전만 저장합니다. 버전을 올리면 기존 로그인 토큰을 모두 무효화합니다.
export const teacherAuthState = sqliteTable('teacher_auth_state', {
  id: text('id').primaryKey(),
  passwordHash: text('password_hash'),
  passwordSalt: text('password_salt'),
  passwordIterations: integer('password_iterations'),
  sessionVersion: integer('session_version').notNull().default(0),
  updatedBy: text('updated_by').notNull().default(''),
  updatedAt: text('updated_at').notNull(),
});

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
  sourceUploadId: text('source_upload_id'),
  ...timestamps,
}, (t) => [index('idx_university_requirements_match').on(t.admissionsYear, t.university, t.department)]);

export const trackRequirements = sqliteTable('track_requirements', {
  id: text('id').primaryKey(),
  admissionsYear: integer('admissions_year').notNull(),
  track: text('track').notNull(),
  departmentGroup: text('department_group').notNull(),
  courseName: text('course_name').notNull(),
  recommendationType: text('recommendation_type', { enum: ['core', 'recommended'] }).notNull().default('recommended'),
  note: text('note').notNull().default(''),
  sourceUploadId: text('source_upload_id'),
  ...timestamps,
}, (t) => [index('idx_track_requirements_match').on(t.admissionsYear, t.track, t.departmentGroup)]);

// 학교가 직접 정하는 계열별 선택 기준이다. 교육청 PDF나 대학 추천자료에서 자동으로
// 만들지 않으며, 필수/우선순위는 선생님이 이 기준자료 관리 화면에서만 설정한다.
export const academicTrackCourseGuides = sqliteTable('academic_track_course_guides', {
  id: text('id').primaryKey(),
  entranceYear: integer('entrance_year').notNull(),
  academicTrack: text('academic_track', { enum: ['humanities', 'science', 'common'] }).notNull(),
  courseName: text('course_name').notNull(),
  priority: text('priority', { enum: ['required', '1', '2', '3'] }).notNull(),
  targetGrade: integer('target_grade'),
  targetSemester: integer('target_semester'),
  note: text('note').notNull().default(''),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdBy: text('created_by').notNull(),
  ...timestamps,
}, (t) => [
  uniqueIndex('uq_academic_track_course_guides').on(t.entranceYear, t.academicTrack, t.courseName, t.priority, t.targetGrade, t.targetSemester),
  index('idx_academic_track_course_guides_lookup').on(t.entranceYear, t.academicTrack, t.active),
]);

// 원본 파일의 바이트는 저장하지 않고(민감한 학생 자료를 불필요하게 보관하지 않기 위해),
// 기준자료의 출처·적용 상태·이력만 D1에 보존합니다. 같은 기준연도의 교체본도 이력으로 남습니다.
export const referenceUploads = sqliteTable('reference_uploads', {
  id: text('id').primaryKey(),
  referenceType: text('reference_type', { enum: ['university_regional', 'university_track', 'school_course'] }).notNull(),
  criteriaYear: integer('criteria_year').notNull(),
  fileName: text('file_name').notNull(),
  uploadedBy: text('uploaded_by').notNull(),
  rowCount: integer('row_count').notNull(),
  failedCount: integer('failed_count').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  replacedUploadId: text('replaced_upload_id'),
  summaryJson: text('summary_json').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
}, (t) => [index('idx_reference_uploads_scope').on(t.referenceType, t.criteriaYear, t.active)]);

// 대학별 자료의 원문 행은 과목별 정규화 레코드와 분리해 남깁니다. 따라서 추천 조회에는
// university_requirements를 쓰되, 선생님은 업로드 파일의 원문 핵심·권장 목록도 확인할 수 있습니다.
export const universityReferenceEntries = sqliteTable('university_reference_entries', {
  id: text('id').primaryKey(),
  uploadId: text('upload_id').notNull().references(() => referenceUploads.id),
  criteriaYear: integer('criteria_year').notNull(),
  track: text('track').notNull().default(''),
  region: text('region').notNull().default(''),
  university: text('university').notNull(),
  department: text('department').notNull(),
  coreCoursesRaw: text('core_courses_raw').notNull().default(''),
  recommendedCoursesRaw: text('recommended_courses_raw').notNull().default(''),
  note: text('note').notNull().default(''),
  createdAt: text('created_at').notNull(),
}, (t) => [index('idx_university_reference_entries_filter').on(t.criteriaYear, t.university, t.department)]);

// 계열별 대표 모집단위 자료는 매트릭스 엑셀도 받아들이기 위해 과목 영역·세부 과목·대학
// 목록을 한 레코드로 구조화합니다. 대학명이 없는 표도 참고자료로 보존할 수 있습니다.
export const trackReferenceEntries = sqliteTable('track_reference_entries', {
  id: text('id').primaryKey(),
  uploadId: text('upload_id').notNull().references(() => referenceUploads.id),
  criteriaYear: integer('criteria_year').notNull(),
  track: text('track').notNull().default(''),
  department: text('department').notNull(),
  subjectArea: text('subject_area').notNull().default(''),
  courseName: text('course_name').notNull(),
  universitiesJson: text('universities_json').notNull().default('[]'),
  recommendationType: text('recommendation_type', { enum: ['core', 'recommended'] }).notNull().default('recommended'),
  note: text('note').notNull().default(''),
  createdAt: text('created_at').notNull(),
}, (t) => [index('idx_track_reference_entries_filter').on(t.criteriaYear, t.track, t.department)]);

export const schoolCourseGuides = sqliteTable('school_course_guides', {
  id: text('id').primaryKey(),
  uploadId: text('upload_id').notNull().references(() => referenceUploads.id),
  criteriaYear: integer('criteria_year').notNull(),
  courseName: text('course_name').notNull(),
  area: text('area').notNull().default(''),
  targetGrade: integer('target_grade'),
  targetSemester: integer('target_semester'),
  overview: text('overview').notNull().default(''),
  offered: integer('offered', { mode: 'boolean' }).notNull().default(true),
  credits: text('credits').notNull().default(''),
  note: text('note').notNull().default(''),
  createdAt: text('created_at').notNull(),
}, (t) => [index('idx_school_course_guides_upload').on(t.uploadId, t.courseName)]);

// 학교 수강신청 책자(HWP/HWPX)에서 확인한 운영 기준이다. 교육청 PDF·대학 추천과
// 섞지 않으며, 교육과정 분류와 학교 운영상 필수/선택도 각각 보존한다.
export const schoolCourseBookEntries = sqliteTable('school_course_book_entries', {
  id: text('id').primaryKey(), uploadId: text('upload_id').notNull().references(() => referenceUploads.id),
  academicYear: integer('academic_year').notNull(), entryYear: integer('entry_year').notNull(), currentGrade: integer('current_grade'),
  targetGrade: integer('target_grade'), targetSemester: integer('target_semester'), subjectGroup: text('subject_group').notNull().default(''),
  subjectName: text('subject_name').notNull(), curriculumCategory: text('curriculum_category').notNull().default(''),
  schoolRequirement: text('school_requirement').notNull().default('optional'), selectionGroup: text('selection_group').notNull().default(''),
  selectionCount: text('selection_count').notNull().default(''), credit: text('credit').notNull().default(''), timing: text('timing').notNull().default(''),
  selectionConditions: text('selection_conditions').notNull().default(''), concurrentLimit: text('concurrent_limit').notNull().default(''),
  prerequisite: text('prerequisite').notNull().default(''), subsequent: text('subsequent').notNull().default(''),
  csatPriority: integer('csat_priority', { mode: 'boolean' }).notNull().default(false), humanitiesPriority: integer('humanities_priority', { mode: 'boolean' }).notNull().default(false), sciencePriority: integer('science_priority', { mode: 'boolean' }).notNull().default(false),
  sourceLocation: text('source_location').notNull().default(''), adminNote: text('admin_note').notNull().default(''), ...timestamps,
}, (t) => [index('idx_school_course_book_entries_lookup').on(t.entryYear, t.targetGrade, t.targetSemester, t.subjectName)]);

// 교육청 PDF는 학교 개설 과목표와 별개인 교육과정 참고자료다. PDF에서 확인한
// 원문과 학생 화면용 핵심 항목을 함께 보존하되, 이 테이블이 curricula를 변경하지는 않는다.
export const educationOfficeCourseGuides = sqliteTable('education_office_course_guides', {
  id: text('id').primaryKey(),
  uploadId: text('upload_id').notNull().references(() => referenceUploads.id),
  criteriaYear: integer('criteria_year').notNull(),
  courseName: text('course_name').notNull(),
  subjectGroup: text('subject_group').notNull().default(''),
  selectionType: text('selection_type').notNull().default(''),
  credits: text('credits').notNull().default(''),
  gradingMethod: text('grading_method').notNull().default(''),
  csatRelation: text('csat_relation').notNull().default(''),
  courseNature: text('course_nature').notNull().default(''),
  coreIdeas: text('core_ideas').notNull().default(''),
  contentStructure: text('content_structure').notNull().default(''),
  knowledgeUnderstanding: text('knowledge_understanding').notNull().default(''),
  processSkills: text('process_skills').notNull().default(''),
  valuesAttitudes: text('values_attitudes').notNull().default(''),
  hierarchy: text('hierarchy').notNull().default(''),
  relatedCareers: text('related_careers').notNull().default(''),
  relatedDepartments: text('related_departments').notNull().default(''),
  sourcePage: integer('source_page').notNull(),
  sourceDocument: text('source_document').notNull(),
  issuingOrganization: text('issuing_organization').notNull().default('부산광역시교육청'),
  curriculumName: text('curriculum_name').notNull().default('2022 개정 교육과정'),
  extractionStatus: text('extraction_status').notNull().default('ok'),
  rawText: text('raw_text').notNull().default(''),
  createdAt: text('created_at').notNull(),
}, (t) => [index('idx_education_office_course_guides_course').on(t.criteriaYear, t.courseName)]);

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
