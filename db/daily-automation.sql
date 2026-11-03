-- Private audit trail for the scheduled Xiaoluo daily-report pipeline.
-- Drafts are never returned by the public daily-report API.
CREATE TABLE IF NOT EXISTS daily_automation_runs (
  report_date TEXT PRIMARY KEY,
  attempted_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('published', 'rejected', 'skipped_existing')),
  reason TEXT NOT NULL DEFAULT '',
  draft_json TEXT,
  published_title TEXT
);
