import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("update timeline omits badges and boilerplate but preserves text and filters", async () => {
  const source = await readFile(new URL("../app/site-updates.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /className="release-(badge|type)"/);
  assert.match(source, /entry.summary !== "后台发布"/);
  assert.match(source, /change.text/);
  assert.match(source, /按更新类型筛选/);
});
test("public updates omit site changes and the removed homepage changelog module", async () => {
  const source = await readFile(new URL("../app/site-updates.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /网站调整|网站更新记录|import updates/);
  assert.match(source, /\["行业文章", "矩阵产品"\]\.includes\(change.type\)/);
  assert.match(source, /const shown = contentEntries.map/);
  assert.match(source, /\["全部", "行业文章", "矩阵产品"\]/);
  assert.match(source, /contentEntries.filter\(\(entry\) => entry.status === "published"\)/);
  assert.doesNotMatch(page, /import SiteUpdates|<SiteUpdates/);
  const overview = await readFile(new URL("../app/atlas-overview.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(overview, /查看更新|<UpdatesDialog|近7天新增/);
});
