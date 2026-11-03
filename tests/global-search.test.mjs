import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildSearchIndex, normalizeSearch, searchSite, SEARCH_LIMIT } from "../app/site-search-index.mjs";

const article = (slug, title, summary = "", company = "") => ({ slug, title, summary, company });
const companyResults = documents => documents.filter(item => item.kind === "公司与产品");

test("global search normalizes case, width and whitespace; empty queries stay empty", () => {
  assert.equal(normalizeSearch("  ＹＡＬＬＡ\n Live  "), "yalla live");
  assert.equal(normalizeSearch(null), "");
  const documents = buildSearchIndex({ articles: [article("yalla", "Yalla Live", "中东运营观察")] });
  assert.equal(searchSite(documents, "ＹＡＬＬＡ")[0].title, "Yalla Live");
  assert.equal(searchSite(documents, "YALLA 中东").length, 1);
  assert.equal(searchSite(documents, "YALLA 欧洲").length, 0);
  assert.deepEqual(searchSite(documents, " \t"), []);
  assert.equal(SEARCH_LIMIT, 20);
});

test("one-character matching works and exact title outranks title prefix and body hits", () => {
  const documents = buildSearchIndex({ articles: [
    article("body", "出海观察", "互乐产品研究"), article("prefix", "互乐科技研究"), article("exact", "互乐"),
  ] });
  assert.equal(searchSite(documents, "互").filter(item => item.kind === "公司分析").length, 3);
  assert.deepEqual(searchSite(documents, "互乐").filter(item => item.kind === "公司分析").map(item => item.id), ["公司分析:exact", "公司分析:prefix", "公司分析:body"]);
});

test("company names and tags are searchable and article URLs are encoded", () => {
  const documents = buildSearchIndex({ articles: [{ ...article("a/b?c", "语音房研究", "", "互乐科技"), tags: ["商业化"] }] });
  const [item] = searchSite(documents, "互乐 商业化");
  assert.equal(item.href, "/analysis/a%2Fb%3Fc");
});

test("matrix indexing respects renames, replaced products, deletion and new companies", () => {
  const documents = buildSearchIndex({ builtIns: [
    { company: "旧公司", products: ["旧产品"] }, { company: "已删除", products: ["历史产品"] }, { company: "清空产品", products: ["不再展示"] },
  ], matrix: [
    { id: "rename", sourceCompany: "旧公司", company: "新公司", products: ["Sawa Live"] },
    { sourceCompany: "已删除", company: "已删除", deleted: true },
    { sourceCompany: "清空产品", company: "清空产品", products: [] },
    { id: "new", company: "新增公司", products: ["Game Vox"] },
    { id: "gone", company: "新增后删除", products: ["Gone"], deleted: true },
  ] });
  assert.equal(companyResults(documents).length, 3);
  assert.equal(searchSite(documents, "旧产品").length, 0);
  assert.equal(searchSite(documents, "历史产品").length, 0);
  assert.equal(searchSite(documents, "不再展示").length, 0);
  assert.equal(searchSite(documents, "Gone").length, 0);
  assert.equal(searchSite(documents, "sawa")[0].title, "新公司");
  assert.equal(searchSite(documents, "旧公司")[0].title, "新公司");
  const link = new URL(searchSite(documents, "Game Vox")[0].href, "https://example.com");
  assert.equal(link.searchParams.get("view"), "matrix");
  assert.equal(link.searchParams.get("company"), "新增公司");
});

test("unavailable matrix never brings back deleted static entries, other sources still work", () => {
  const options = { builtIns: [{ company: "静态公司", products: ["产品"] }], articles: [article("a", "公司研究")] };
  assert.equal(companyResults(buildSearchIndex(options)).length, 0);
  assert.equal(companyResults(buildSearchIndex({ ...options, matrix: [] })).length, 1);
  assert.equal(searchSite(buildSearchIndex(options), "公司研究").length, 1);
});

test("daily full body is searchable with a bounded excerpt and specific date target", () => {
  const documents = buildSearchIndex({ daily: [{ date: "2026-09-17", title: "9月17日日报", body: `# 今日动态\n${"市场资讯 ".repeat(150)} **Kaya Chat** 新动向 [原文](https://example.com)` }] });
  const [item] = searchSite(documents, "Kaya");
  assert.equal(item.href, "/daily/2026-09-17");
  assert.match(item.excerpt, /Kaya Chat/);
  assert.ok(item.excerpt.length <= 112);
  assert.doesNotMatch(item.excerpt, /\*\*|https:\/\//);
});

test("talent results select the right mode and entry, without indexing contact fields", () => {
  const documents = buildSearchIndex({ talent: [
    { id: "job#1", kind: "jobs", title: "海外运营", company: "互乐", city: "深圳", contact: "private@example.com" },
    { id: "求职 2", kind: "people", title: "增长运营", tags: ["中东"], note: "三年经验" },
  ] });
  const [job] = searchSite(documents, "互乐 深圳");
  assert.equal(job.kind, "招聘");
  assert.equal(job.href, "/?view=talent&kind=jobs#talent-job%231");
  const [person] = searchSite(documents, "中东");
  const url = new URL(person.href, "https://example.com");
  assert.equal(url.searchParams.get("kind"), "people");
  assert.equal(decodeURIComponent(url.hash), "#talent-求职 2");
  assert.equal(searchSite(documents, "private@example.com").length, 0);
});

test("tools, providers and business categories are indexed, unsafe links and malformed records are skipped", () => {
  const documents = buildSearchIndex({
    articles: [null, article("a", "正文"), article("a", "正文最新版")], daily: [null, { date: "wrong", title: "无效日报" }],
    talent: [null, { id: "bad", kind: "private", title: "非法栏目" }], matrix: [null], builtIns: [null],
    tools: [null, { name: "不安全链接", url: "javascript:alert(1)" }, { name: "极瞬动画", url: "https://www.jsgift.top/", text: "直播礼物设计" }],
  });
  assert.equal(searchSite(documents, "直播礼物").length, 3);
  assert.equal(searchSite(documents, "极瞬")[0].href, "https://www.jsgift.top/");
  const provider = searchSite(documents, "极瞬").find(item => item.kind === "入驻服务商");
  assert.equal(provider?.href, "/?view=talent&market=providers");
  assert.equal(searchSite(documents, "头像框").find(item => item.kind === "入驻服务商")?.title, "极瞬动画");
  assert.equal(searchSite(documents, "海外支付")[0].href, "/?view=business");
  assert.equal(searchSite(documents, "正文").length, 1);
  assert.equal(searchSite(documents, "不安全").length, 0);
  assert.equal(searchSite(documents, "无效日报").length, 0);
});

test("both public headers share global search and no longer render brand wording", async () => {
  for (const file of ["../app/page.tsx", "../app/analysis/[slug]/reader.tsx"]) {
    const code = await readFile(new URL(file, import.meta.url), "utf8");
    const header = code.match(/<header className="nav shell[^]*?<\/header>/)?.[0];
    assert.ok(header);
    assert.match(header, /<GlobalSearch\s*\/>/);
    assert.ok(header.indexOf("</nav>") < header.indexOf("<GlobalSearch"), "search follows centered navigation");
    assert.match(header, /avatar-login/);
    assert.doesNotMatch(header, /小骆日报/);
    assert.doesNotMatch(header, /语聊出海观察|brand-home/);
  }
});

test("navigation is centered between equal columns and global search suppresses the inherited icon", async () => {
  const css = await readFile(new URL("../app/site-navigation.css", import.meta.url), "utf8");
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
  assert.match(css, /grid-template-areas: "brand navigation search"/);
  assert.match(css, /input\[type="search"\] \{ background-image: none !important; padding-left: 0 !important/);
  assert.match(css, /\.global-search-panel \{[^}]*right: 0/);
});
