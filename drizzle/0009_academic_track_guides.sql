ALTER TABLE student_profiles ADD COLUMN academic_track TEXT NOT NULL DEFAULT 'undecided';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS academic_track_course_guides (
  id TEXT PRIMARY KEY NOT NULL,
  entrance_year INTEGER NOT NULL,
  academic_track TEXT NOT NULL,
  course_name TEXT NOT NULL,
  priority TEXT NOT NULL,
  target_grade INTEGER,
  target_semester INTEGER,
  note TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_academic_track_course_guides
  ON academic_track_course_guides(entrance_year, academic_track, course_name, priority, target_grade, target_semester);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_academic_track_course_guides_lookup
  ON academic_track_course_guides(entrance_year, academic_track, active);
