import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { HOT_FEEDS, buildHotList } from "../shared/hot-list.mjs";

const NOW = Date.parse("2026-10-19T03:00:00.000Z");
const PUBLISHED_AT = "2026-10-18T08:00:00.000Z";
const ARTICLE_URL = "https://ir.joyy.com/news-releases/news-release-details/2026-results";
const TITLE = "JOYY Reports Second Quarter 2026 Unaudited Financial Results";
const QUOTE = "BIGO LIVE livestreaming revenue increased 12.5% year over year to US$240.6 million.";
const BODY = `${QUOTE} JOYY reported these results for the second quarter of 2026. The release discusses paying users and the livestreaming business separately from corporate financial information. The company has not established which product feature caused the revenue movement. Supporting appendix marker: BODY_APPENDIX_NOT_FOR_REPUBLICATION.`;
const PROPOSAL = {
  eligible: true,
  titleZh: "JOYY：BIGO LIVE 直播收入同比增长 12.5%",
  change: "JOYY 披露 BIGO LIVE 直播收入同比增长 12.5%，达到 US$240.6 million，属于季度经营结果。",
  whyItMatters: "可关注直播付费机制与收入变化的关系，具体产品机制的贡献仍需进一步核实。",
  evidenceQuote: QUOTE,
};
const CHECKS = { articleMatch: true, concreteChange: true, productIdentity: true, dateAccurate: true, numbersAccurate: true, chineseFactsSupported: true, analysisIsQualified: true, socialRelevance: true, evidenceSupportsChange: true };

const workerBundle = await build({
  entryPoints: [new URL("../worker/hot-daily.ts", import.meta.url).pathname],
  bundle: true, format: "esm", platform: "browser", write: false,
});
const { publishDailyHotList } = await import(`data:text/javascript;base64,${Buffer.from(workerBundle.outputFiles[0].text).toString("base64")}`);

function rss(items = []) {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Publisher feed</title>${items.map((item) => `<item><title>${item.title}</title><link>${item.url}</link><pubDate>${item.publishedAt}</pubDate></item>`).join("")}</channel></rss>`;
}

function emptySource(source) {
  if (source.format === "apple-lookup") return Response.json({ resultCount: 0, results: [] });
  if (source.format === "newborn-json") return Response.json({ code: 0, data: { list: { website_hk_news: [] } } });
  if (source.format === "newborn-news-json") return Response.json({ code: 0, data: { list: [] } });
  if (source.format === "bigo-html") return new Response('<div class="blog-item"><a href="/news-events/old-product-feature" class="title">BIGO LIVE launches voice rooms</a><div class="time">2025-01-01</div></div>');
  if (source.format === "globe-company-html") return new Response('<div class="recentNewsH"><ul><li class="row"><div class="date-source"><span>January 15, 2025 19:00 ET</span><span>Source: <a class="sourceLink">JOYY Inc.</a></span></div><div class="mainLink"><a href="/news-release/2025/01/15/3250000/23553/en/joyy-reports-fourth-quarter-financial-results.html">JOYY Reports Fourth Quarter 2024 Financial Results</a></div></li></ul></div>');
  return new Response(rss());
}

function snapshotDb() {
  let row = null;
  return {
    get row() { return row; },
    prepare(sql) {
      if (sql.startsWith("SELECT")) return { async first() { return row; } };
      if (sql.startsWith("INSERT")) return {
        bind(updatedAt, json) {
          return { async run() { row = { updated_at: updatedAt, payload_json: json }; return { meta: { changes: 1 } }; } };
        },
      };
      throw new Error(`Unexpected snapshot operation: ${sql}`);
    },
  };
}

function fixture({ approved = true } = {}) {
  const calls = { feeds: [], articles: [], ai: [] };
  const fetcher = async (rawUrl) => {
    const url = String(rawUrl);
    const source = HOT_FEEDS.find((feed) => feed.url === url);
    if (source) {
      calls.feeds.push(source.id);
      return source.id === "joyy-ir"
        ? new Response(rss([{ title: TITLE, url: ARTICLE_URL, publishedAt: new Date(PUBLISHED_AT).toUTCString() }]))
        : emptySource(source);
    }
    assert.equal(url, ARTICLE_URL, "only the discovered publisher article may be read");
    calls.articles.push(url);
    return new Response(`<html><head><meta property="og:title" content="${TITLE}"><meta property="article:published_time" content="${PUBLISHED_AT}"></head><body><article><h1>${TITLE}</h1><p>${BODY}</p></article></body></html>`, { headers: { "content-type": "text/html; charset=utf-8" } });
  };
  const ai = {
    async run(model, input) {
      const proposalCall = Object.hasOwn(input.response_format.json_schema.properties, "eligible");
      calls.ai.push({ model, input, phase: proposalCall ? "extract" : "review" });
      const request = JSON.parse(input.messages.at(-1).content);
      assert.ok(request.originalArticleText.includes(QUOTE), "each AI stage receives the article body rather than just the generic headline");
      assert.equal(request.originalPublishedAt, PUBLISHED_AT);
      if (!proposalCall) assert.deepEqual(request.proposed, Object.fromEntries(Object.entries(PROPOSAL).filter(([key]) => key !== "eligible")));
      return { response: JSON.stringify(proposalCall ? PROPOSAL : {
        approved, checks: { ...CHECKS, chineseFactsSupported: approved }, confirmedTopic: "JOYY",
        evidenceQuote: QUOTE, reason: approved ? "The quarterly social-business fact is supported." : "The Chinese claim is not supported.",
      }) };
    },
  };
  return { calls, fetcher, ai };
}

test("scheduled Worker reads generic core-company reports before ranking and shares that body with both AI stages", async () => {
  const metadataOnly = { sourceId: "joyy-ir", title: TITLE, url: ARTICLE_URL, publishedAt: PUBLISHED_AT };
  assert.equal(buildHotList([metadataOnly], new Date(NOW)).rankings.length, 0, "a generic financial headline alone is not an eligible event");
  const { calls, fetcher, ai } = fixture();
  const db = snapshotDb();
  const result = await publishDailyHotList(db, { fetcher, ai, now: () => NOW });
  assert.equal(result.status, "ready");
  assert.equal(result.rankings, 1, "the concrete social-business fact in the original body enables discovery");
  assert.equal(result.detailsReady, 1);
  assert.equal(result.written, true);
  assert.deepEqual(result.failedSources, []);
  assert.equal(calls.feeds.length, HOT_FEEDS.length);
  assert.equal(new Set(calls.feeds).size, HOT_FEEDS.length);
  assert.equal(calls.articles.length, 1, "discovery and enrichment must reuse one original article read");
  assert.deepEqual(calls.ai.map((call) => call.phase), ["extract", "review"]);
  const payload = JSON.parse(db.row.payload_json);
  const [story] = payload.rankings;
  assert.equal(story.topic, "JOYY");
  assert.equal(story.title, TITLE);
  assert.equal(story.detail.status, "ready");
  assert.equal(story.detail.titleZh, PROPOSAL.titleZh);
  assert.equal(story.detail.change, PROPOSAL.change);
  assert.equal(story.detail.whyItMatters, PROPOSAL.whyItMatters);
  assert.equal(story.detail.evidenceQuote, QUOTE);
  assert.equal(story.detail.sourceUrl, ARTICLE_URL);
  assert.equal(story.detail.sourcePublishedAt, PUBLISHED_AT);
  assert.doesNotMatch(db.row.payload_json, /contentText|originalArticleText|BODY_APPENDIX_NOT_FOR_REPUBLICATION|<article>/);
  assert.ok(!db.row.payload_json.includes(BODY), "the full article must remain transient and absent from the public D1 snapshot");
});

test("an edition with no approved AI reviews leaves the persisted snapshot untouched", async () => {
  const { calls, fetcher, ai } = fixture({ approved: false });
  const db = snapshotDb();
  await assert.rejects(publishDailyHotList(db, { fetcher, ai, now: () => NOW }), /No hot-list events passed detail verification/);
  assert.equal(db.row, null, "rejected proposed facts never reach the publishing database");
  assert.equal(calls.articles.length, 1);
  assert.deepEqual(calls.ai.map((call) => call.phase), ["extract", "review", "extract", "review"]);
});

test("complete scheduled pipeline spends on new originals only and repeats both AI gates after a body change", async () => {
  const { calls, fetcher: underlying, ai } = fixture();
  const db = snapshotDb(); const records = new Map(); let revised = false; let locked = false;
  const repository = {
    async load() { return new Map(); },
    async get(key) { return records.get(key) ?? null; },
    async put(key, value, expiresAt) { records.set(key, { value, expiresAt }); },
    async acquire() { if (locked) return false; locked = true; return true; },
    async release() { locked = false; },
  };
  const fetcher = async (url, init) => {
    const response = await underlying(url, init);
    if (!revised || String(url) !== ARTICLE_URL) return response;
    return new Response((await response.text()).replace("</article>", "<p>The original publisher added a revised rollout paragraph.</p></article>"), { headers: response.headers });
  };
  await publishDailyHotList(db, { fetcher, ai, now: () => NOW, processingRepository: repository });
  assert.equal(calls.ai.length, 2, "one new original requires extraction and independent review");
  const first = JSON.parse(db.row.payload_json).rankings[0].detail;
  await publishDailyHotList(db, { fetcher, ai, now: () => NOW + 60_000, processingRepository: repository });
  assert.equal(calls.ai.length, 2, "the second scheduled run makes no model calls");
  assert.equal(JSON.parse(db.row.payload_json).rankings[0].detail.verifiedAt, first.verifiedAt);
  revised = true;
  await publishDailyHotList(db, { fetcher, ai, now: () => NOW + 120_000, processingRepository: repository });
  assert.deepEqual(calls.ai.map((call) => call.phase), ["extract", "review", "extract", "review"]);
  assert(!db.row.payload_json.includes("rollout paragraph"));
  assert.equal(locked, false);
});
