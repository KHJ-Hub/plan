CREATE TABLE `track_reference_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`upload_id` text NOT NULL,
	`criteria_year` integer NOT NULL,
	`track` text DEFAULT '' NOT NULL,
	`department` text NOT NULL,
	`subject_area` text DEFAULT '' NOT NULL,
	`course_name` text NOT NULL,
	`universities_json` text DEFAULT '[]' NOT NULL,
	`recommendation_type` text DEFAULT 'recommended' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`upload_id`) REFERENCES `reference_uploads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_track_reference_entries_filter` ON `track_reference_entries` (`criteria_year`,`track`,`department`);--> statement-breakpoint
CREATE TABLE `university_reference_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`upload_id` text NOT NULL,
	`criteria_year` integer NOT NULL,
	`track` text DEFAULT '' NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`university` text NOT NULL,
	`department` text NOT NULL,
	`core_courses_raw` text DEFAULT '' NOT NULL,
	`recommended_courses_raw` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`upload_id`) REFERENCES `reference_uploads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_university_reference_entries_filter` ON `university_reference_entries` (`criteria_year`,`university`,`department`);--> statement-breakpoint
ALTER TABLE `reference_uploads` ADD `failed_count` integer DEFAULT 0 NOT NULL;