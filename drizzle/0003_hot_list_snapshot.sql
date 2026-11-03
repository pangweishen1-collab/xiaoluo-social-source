-- Latest successful daily hot-list crawl. Apply to D1 before enabling the cron Worker.
CREATE TABLE IF NOT EXISTS hot_list_snapshot (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  updated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
