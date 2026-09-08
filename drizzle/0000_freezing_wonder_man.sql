CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`entrance_year` integer,
	`current_class` integer,
	`target_grade` integer,
	`target_semester` integer,
	`details_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_time` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `curricula` (
	`id` text PRIMARY KEY NOT NULL,
	`entrance_year` integer NOT NULL,
	`target_grade` integer NOT NULL,
	`target_semester` integer NOT NULL,
	`area` text NOT NULL,
	`course_name` text NOT NULL,
	`selection_type` text NOT NULL,
	`offered` integer DEFAULT true NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_curriculum_course` ON `curricula` (`entrance_year`,`target_grade`,`target_semester`,`course_name`);--> statement-breakpoint
CREATE TABLE `matching_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`entrance_year` integer NOT NULL,
	`from_round` integer NOT NULL,
	`to_round` integer NOT NULL,
	`student_id` text,
	`issue_type` text NOT NULL,
	`details_json` text NOT NULL,
	`resolution` text DEFAULT 'pending' NOT NULL,
	`admin_memo` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_matching_issues_pending` ON `matching_issues` (`entrance_year`,`resolution`);--> statement-breakpoint
CREATE TABLE `official_result_courses` (
	`id` text PRIMARY KEY NOT NULL,
	`result_id` text NOT NULL,
	`course_name` text NOT NULL,
	FOREIGN KEY (`result_id`) REFERENCES `official_results`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_official_result_course` ON `official_result_courses` (`result_id`,`course_name`);--> statement-breakpoint
CREATE TABLE `official_results` (
	`id` text PRIMARY KEY NOT NULL,
	`file_id` text NOT NULL,
	`student_id` text NOT NULL,
	`entrance_year` integer NOT NULL,
	`round_number` integer NOT NULL,
	`current_class` integer NOT NULL,
	`current_number` integer NOT NULL,
	`student_name` text NOT NULL,
	`target_grade` integer NOT NULL,
	`target_semester` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`file_id`) REFERENCES `upload_files`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_official_result_compare` ON `official_results` (`entrance_year`,`round_number`,`student_id`,`target_grade`,`target_semester`);--> statement-breakpoint
CREATE TABLE `plan_courses` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`target_grade` integer NOT NULL,
	`target_semester` integer NOT NULL,
	`course_name` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_plan_courses` ON `plan_courses` (`plan_id`,`target_grade`,`target_semester`,`course_name`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`round_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`student_memo` text DEFAULT '' NOT NULL,
	`submitted_at` text,
	`confirmed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_plans_student_round` ON `plans` (`student_id`,`round_id`);--> statement-breakpoint
CREATE INDEX `idx_plans_status` ON `plans` (`status`);--> statement-breakpoint
CREATE TABLE `review_history` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_review_history_plan` ON `review_history` (`plan_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`entrance_year` integer NOT NULL,
	`round_number` integer NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'closed' NOT NULL,
	`official_finalized` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_rounds_year_number` ON `rounds` (`entrance_year`,`round_number`);--> statement-breakpoint
CREATE TABLE `student_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`rank` integer NOT NULL,
	`university` text NOT NULL,
	`department` text NOT NULL,
	`admissions_year` integer NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_student_preferences_rank` ON `student_preferences` (`student_id`,`rank`);--> statement-breakpoint
CREATE TABLE `student_profiles` (
	`student_id` text PRIMARY KEY NOT NULL,
	`career_goal` text DEFAULT '' NOT NULL,
	`counseling_memo` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`entrance_year` integer NOT NULL,
	`current_class` integer NOT NULL,
	`current_number` integer NOT NULL,
	`name` text NOT NULL,
	`external_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_students_fallback_identity` ON `students` (`entrance_year`,`current_class`,`current_number`,`name`);--> statement-breakpoint
CREATE INDEX `idx_students_lookup` ON `students` (`entrance_year`,`current_class`,`current_number`);--> statement-breakpoint
CREATE INDEX `idx_students_external` ON `students` (`entrance_year`,`external_id`);--> statement-breakpoint
CREATE TABLE `track_requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`admissions_year` integer NOT NULL,
	`track` text NOT NULL,
	`department_group` text NOT NULL,
	`course_name` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_track_requirements_match` ON `track_requirements` (`admissions_year`,`track`,`department_group`);--> statement-breakpoint
CREATE TABLE `university_requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`admissions_year` integer NOT NULL,
	`track` text DEFAULT '' NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`university` text NOT NULL,
	`department` text NOT NULL,
	`course_name` text NOT NULL,
	`recommendation_type` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_university_requirements_match` ON `university_requirements` (`admissions_year`,`university`,`department`);--> statement-breakpoint
CREATE TABLE `upload_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`entrance_year` integer NOT NULL,
	`round_number` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	`file_count` integer NOT NULL,
	`student_count` integer NOT NULL,
	`summary_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `upload_files` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`entrance_year` integer NOT NULL,
	`round_number` integer NOT NULL,
	`current_class` integer NOT NULL,
	`target_grade` integer NOT NULL,
	`target_semester` integer NOT NULL,
	`file_name` text NOT NULL,
	`checksum` text NOT NULL,
	`student_count` integer NOT NULL,
	`course_count` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`replaced_file_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `upload_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_upload_files_scope` ON `upload_files` (`entrance_year`,`round_number`,`current_class`,`target_grade`,`target_semester`,`active`);--> statement-breakpoint
CREATE INDEX `idx_upload_files_checksum` ON `upload_files` (`checksum`);--> statement-breakpoint
CREATE TABLE `verification_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`round_number` integer NOT NULL,
	`target_grade` integer NOT NULL,
	`target_semester` integer NOT NULL,
	`status` text DEFAULT 'unreviewed' NOT NULL,
	`memo` text DEFAULT '' NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_verification_review` ON `verification_reviews` (`student_id`,`round_number`,`target_grade`,`target_semester`);
--> statement-breakpoint
PRAGMA optimize;
