CREATE TABLE `reference_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`reference_type` text NOT NULL,
	`criteria_year` integer NOT NULL,
	`file_name` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`row_count` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`replaced_upload_id` text,
	`summary_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reference_uploads_scope` ON `reference_uploads` (`reference_type`,`criteria_year`,`active`);--> statement-breakpoint
CREATE TABLE `school_course_guides` (
	`id` text PRIMARY KEY NOT NULL,
	`upload_id` text NOT NULL,
	`criteria_year` integer NOT NULL,
	`course_name` text NOT NULL,
	`area` text DEFAULT '' NOT NULL,
	`target_grade` integer,
	`target_semester` integer,
	`overview` text DEFAULT '' NOT NULL,
	`offered` integer DEFAULT true NOT NULL,
	`credits` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`upload_id`) REFERENCES `reference_uploads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_school_course_guides_upload` ON `school_course_guides` (`upload_id`,`course_name`);--> statement-breakpoint
ALTER TABLE `curricula` ADD `source_upload_id` text;--> statement-breakpoint
ALTER TABLE `track_requirements` ADD `source_upload_id` text;--> statement-breakpoint
ALTER TABLE `university_requirements` ADD `source_upload_id` text;