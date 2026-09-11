CREATE TABLE IF NOT EXISTS plan_submission_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  submission_status TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  submitted_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_plan_submission_snapshots_plan
  ON plan_submission_snapshots(plan_id, submitted_at);
