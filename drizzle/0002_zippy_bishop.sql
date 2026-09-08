CREATE TABLE `teacher_auth_state` (
	`id` text PRIMARY KEY NOT NULL,
	`password_hash` text,
	`password_salt` text,
	`password_iterations` integer,
	`session_version` integer DEFAULT 0 NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL
);
