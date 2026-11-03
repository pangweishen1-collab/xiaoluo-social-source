CREATE TABLE IF NOT EXISTS daily_reports (
  report_date TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_thread TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  edition_json TEXT
);
