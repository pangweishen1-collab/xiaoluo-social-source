import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
test("tab switches discard stale anchors while old daily hashes redirect to issue pages", () => {
  const page = read("../app/page.tsx");
  const navigate = page.slice(page.indexOf("const navigate ="), page.indexOf("const logout ="));
  assert.match(navigate, /if \(view === tab\) return/);
  assert.match(navigate, /url.hash = ""/);
  const daily = read("../app/daily-reports.tsx");
  const reader = read("../app/daily-issue-reader.tsx");
  assert.match(daily, /window.location.hash.match/);
  assert.match(daily, /window.location.replace\(`\/daily\/\$\{date\}`\)/);
  assert.match(reader, /fetch\("\/api\/daily-reports\?index=1"/);
  assert.match(daily, /invalidatePublicData\("\/api\/daily-reports"\)/);
  assert.match(daily, /invalidatePublicData\("\/api\/daily-reports\?index=1"\)/);
  assert.doesNotMatch(daily, /setLoading\(true\); setError/);
});
test("short loading states retain scrollbar space and a minimum daily page height", () => {
  assert.match(read("../app/site-navigation.css"), /html \{ scrollbar-gutter: stable;/);
  assert.match(read("../app/daily-reports.css"), /min-height:calc\(100svh - 88px\)/);
});
