-- One-time, additive migration for databases that already have daily_reports.
-- New databases use db/daily-reports.sql, which includes this nullable column.
ALTER TABLE daily_reports ADD COLUMN edition_json TEXT;
