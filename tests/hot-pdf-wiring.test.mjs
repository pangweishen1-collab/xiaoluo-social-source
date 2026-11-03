import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { buildHotList } from "../shared/hot-list.mjs";

const bundled = await build({ entryPoints: [new URL("../worker/hot-enrichment.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "browser", write: false });
const { prepareHotArticles } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const NOW = Date.parse("2026-10-19T03:00:00Z");
const PDF_URL = "https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0825/2026082501387.pdf";
const DATE = "2026-08-25T00:00:00.000Z";
const TITLE = "INTERIM RESULTS ANNOUNCEMENT FOR THE SIX MONTHS ENDED 30 JUNE 2026";
const BODY = "Newborn Town social networking revenue increased 25.0% to RMB1,000 million. The reported business operates products for overseas social networking users. These are issuer-reported financial results, not proof of a product feature's effect on retention or monetization.";
const item = () => ({ sourceId: "newborn-ir", title: TITLE, url: PDF_URL, publishedAt: DATE, category: "Interim Results" });

test("parent reads a registered issuer PDF through the private article service before title filtering and caches it only in memory", async () => {
  const articleCache = new Map(); let serviceCalls = 0; let networkCalls = 0;
  const detailService = { async fetch(request) {
    serviceCalls += 1;
    assert.equal(new URL(request.url).pathname, "/article");
    assert.equal(request.method, "POST");
    assert.deepEqual(await request.json(), { source: { name: "赤子城科技投资者关系", url: PDF_URL, publishedAt: DATE } });
    return Response.json({ sourceUrl: PDF_URL, title: `Newborn Town ${TITLE}`, text: BODY, publishedAt: DATE, contentKind: "article" });
  } };
  const original = item();
  assert.equal(buildHotList([original], new Date(NOW)).rankings.length, 0);
  const prepared = await prepareHotArticles([original], { articleCache, detailService, now: NOW, fetcher: async () => { networkCalls += 1; throw new Error("Parent must not fetch PDFs directly"); } });
  assert.equal(serviceCalls, 1);
  assert.equal(networkCalls, 0);
  assert.equal(prepared[0].contentText, BODY);
  assert.equal((await articleCache.get(PDF_URL)).text, BODY);
  const publicList = buildHotList(prepared, new Date(NOW));
  assert.equal(publicList.rankings[0].topic, "Newborn Town");
  assert.ok(!JSON.stringify(publicList).includes(BODY));
  assert.ok(!JSON.stringify(publicList).includes("contentText"));
});

test("an unavailable or mismatched private PDF result never becomes a current article body", async () => {
  for (const article of [null, { sourceUrl: PDF_URL, title: TITLE, text: BODY, contentKind: "article", publishedAt: "2026-10-18T00:00:00.000Z" },
    { sourceUrl: "https://www1.hkexnews.hk/another.pdf", title: TITLE, text: BODY, contentKind: "article", publishedAt: DATE }]) {
    const articleCache = new Map();
    const prepared = await prepareHotArticles([item()], { articleCache, now: NOW, detailService: { async fetch() {
      return article ? Response.json(article) : Response.json({ status: "unavailable" }, { status: 422 });
    } } });
    assert.equal(prepared[0].contentText, undefined);
    assert.equal(articleCache.size, 0);
    assert.equal(buildHotList(prepared, new Date(NOW)).rankings.length, 0);
  }
});

test("private parent PDF preview only forwards to the child and never reads or writes D1", async () => {
  const bundle = await build({ entryPoints: [new URL("../worker/hot-daily.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "browser", write: false });
  const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  let forwarded = 0;
  const payload = { source: { name: "赤子城科技投资者关系", url: PDF_URL, publishedAt: DATE } };
  const env = { DB: { prepare() { throw new Error("PDF preview must not query or mutate D1"); } }, HOT_DETAIL: { async fetch(request) {
    forwarded += 1;
    assert.equal(new URL(request.url).pathname, "/article");
    assert.deepEqual(await request.json(), payload);
    return Response.json({ sourceUrl: PDF_URL, title: TITLE, text: BODY, publishedAt: DATE, contentKind: "article" }, { headers: { "cache-control": "no-store" } });
  } } };
  const response = await worker.fetch(new Request("https://preview.example/__hot-article-preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).text, BODY);
  assert.equal(forwarded, 1);
  assert.equal((await worker.fetch(new Request("https://preview.example/__hot-article-preview"), env)).status, 404);
  assert.equal((await worker.fetch(new Request("https://preview.example/__hot-article-preview?anything=1", { method: "POST" }), env)).status, 404);
  assert.equal(forwarded, 1);
});
