CREATE TABLE `course_description_import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`entrance_year` integer NOT NULL,
	`source_name` text NOT NULL,
	`source_year` integer,
	`uploaded_by` text NOT NULL,
	`status` text DEFAULT 'preview' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `course_description_import_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`incoming_course_name` text NOT NULL,
	`normalized_course_name` text NOT NULL,
	`payload_json` text NOT NULL,
	`match_status` text NOT NULL,
	`matched_course_name` text,
	`decision` text DEFAULT 'pending' NOT NULL,
	`applied_source_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `course_description_import_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_course_description_import_rows_batch` ON `course_description_import_rows` (`batch_id`,`match_status`);--> statement-breakpoint
CREATE TABLE `course_description_selections` (
	`id` text PRIMARY KEY NOT NULL,
	`entrance_year` integer NOT NULL,
	`course_name` text NOT NULL,
	`selected_source_id` text NOT NULL,
	`display_mode` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`selected_source_id`) REFERENCES `course_description_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_course_description_selection` ON `course_description_selections` (`entrance_year`,`course_name`);--> statement-breakpoint
CREATE TABLE `course_description_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`entrance_year` integer NOT NULL,
	`course_name` text NOT NULL,
	`overview` text DEFAULT '' NOT NULL,
	`learning_content` text DEFAULT '' NOT NULL,
	`course_nature` text DEFAULT '' NOT NULL,
	`related_careers` text DEFAULT '' NOT NULL,
	`recommended_grade` integer,
	`recommended_semester` integer,
	`selection_type` text,
	`note` text DEFAULT '' NOT NULL,
	`source_kind` text NOT NULL,
	`source_name` text DEFAULT '' NOT NULL,
	`source_year` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_course_description_sources_course` ON `course_description_sources` (`entrance_year`,`course_name`,`source_kind`);