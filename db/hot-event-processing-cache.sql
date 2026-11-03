-- Private processing metadata only: no article bodies or rejected draft copy.
CREATE TABLE IF NOT EXISTS hot_event_processing_cache (
  cache_key TEXT PRIMARY KEY NOT NULL,
  expires_at TEXT NOT NULL,
  result_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS hot_event_processing_cache_expiry
  ON hot_event_processing_cache(expires_at);
