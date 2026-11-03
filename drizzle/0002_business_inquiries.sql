CREATE TABLE IF NOT EXISTS business_inquiries (
 id TEXT PRIMARY KEY NOT NULL,
 company_product TEXT NOT NULL,
 region TEXT NOT NULL,
 type TEXT NOT NULL,
 description TEXT NOT NULL,
 budget TEXT NOT NULL,
 timeline TEXT NOT NULL,
 contact TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_business_inquiries_created ON business_inquiries(created_at, id);
