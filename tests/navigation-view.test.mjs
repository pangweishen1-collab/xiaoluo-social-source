import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { viewFromSearch } from "../app/navigation-view.mjs";

test("article return destination selects company analysis", () => {
  const reader = readFileSync(new URL("../app/analysis/[slug]/reader.tsx", import.meta.url), "utf8");
  assert.match(reader, /<BackLink href="\/\?view=analysis">返回公司分析<\/BackLink>/);
  assert.equal(viewFromSearch("?view=analysis"), "analysis");
});
test("supported deep links and invalid view fallback", () => {
  for (const view of ["home", "hot", "daily", "analysis", "matrix", "talent", "business"]) {
    assert.equal(viewFromSearch(`?view=${view}`), view);
  }
  assert.equal(viewFromSearch(""), "home");
  assert.equal(viewFromSearch("?view=invalid"), "home");
});
