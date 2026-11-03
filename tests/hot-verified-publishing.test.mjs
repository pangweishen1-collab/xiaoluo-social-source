import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { buildHotList, HOT_FEEDS } from "../shared/hot-list.mjs";

const NOW = Date.parse("2026-10-19T05:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 86_400_000;
const topics = ["Discord", "Facebook", "Instagram", "WhatsApp", "Threads", "TikTok", "Snapchat", "Reddit", "Twitch", "Bluesky", "Twitter", "Orkut", "Clubhouse", "Telegram", "Kwai", "YouTube", "Chamet", "Tango Live", "WePlay", "Litmatch", "Azar", "BIGO LIVE", "Likee", "Hago", "YallaChat"];
const daily = build({ entryPoints: [new URL("../worker/hot-daily.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "browser", write: false })
  .then((result) => import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`));
const originals = (count) => topics.slice(0, count).map((topic, index) => ({ sourceId: "techcrunch", title: `${topic} launches new voice chat controls`,
  url: `https://techcrunch.com/new-${index}`, publishedAt: new Date(NOW - (index + 1) * HOUR).toISOString() }));
const rss = (items) => `<rss><channel><title>Publisher news</title>${items.map((item) => `<item><title>${item.title}</title><link>${item.url}</link><pubDate>${item.publishedAt}</pubDate></item>`).join("")}</channel></rss>`;
function crawler(items) {
  let calls = 0;
  const fetcher = async (url) => {
    calls += 1;
    const source = HOT_FEEDS.find((entry) => entry.url === url);
    assert(source, "reserve selection must not discover or recrawl additional feeds");
    if (source.id === "techcrunch") return new Response(rss(items));
    if (source.format === "apple-lookup") return Response.json({ resultCount: 0, results: [] });
    if (source.format === "newborn-json") return Response.json({ code: 0, data: { list: { website_hk_news: [] } } });
    if (source.format === "newborn-news-json") return Response.json({ code: 0, data: { list: [] } });
    if (source.format === "bigo-html") return new Response('<div class="blog-item"><a href="/news-events/old" class="title">BIGO LIVE launches voice rooms</a><div class="time">2025-01-01</div></div>');
    if (source.format === "globe-company-html") return new Response('<div class="recentNewsH"><li class="row"><div class="date-source"><span>August 25, 2025 19:00 ET</span><span>Source: <a class="sourceLink">JOYY Inc.</a></span></div><div class="mainLink"><a href="/news-release/2025/08/25/3000000/23553/en/joyy-old-results.html">JOYY Reports Old Financial Results</a></div></li></div>');
    return new Response(rss([]));
  };
  return { fetcher, get calls() { return calls; } };
}
function dbFixture(initial = null) {
  let row = initial;
  let writes = 0;
  return { get row() { return row; }, get writes() { return writes; }, prepare(sql) {
    if (sql.startsWith("SELECT")) return { async first() { return row; } };
    if (sql.startsWith("INSERT")) return { bind(updatedAt, payloadJson) { return { async run() { writes += 1; row = { updated_at: updatedAt, payload_json: payloadJson }; return { meta: { changes: 1 } }; } }; } };
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
}
const ready = (story) => {
  const source = story.sources[0];
  return { status: "ready", titleZh: "平台新增语聊房间互动控制功能", change: "平台新增语聊房间互动控制，主持人可以管理用户参与。", whyItMatters: "可研究主持人控制如何影响房间互动，具体效果仍需验证。", evidenceQuote: "hosts can manage who joins the conversation",
    sourceUrl: source.url, sourceName: source.name, sourceTitle: source.title, sourceFeedPublishedAt: source.publishedAt,
    sourcePublishedAt: source.publishedAt, verifiedAt: new Date(NOW).toISOString() };
};
function detailService(outcome) {
  const attempted = [];
  return { attempted, async fetch(request) {
    const { story } = await request.json();
    attempted.push(story);
    return Response.json(outcome(story, attempted.length));
  } };
}
const savedPayload = (items, at) => ({ methodVersion: 9, updatedAt: new Date(at).toISOString(), windowHours: 48, rankingWindowHours: 168, fallbackWindowHours: 2160,
  ...buildHotList(items, new Date(at)), sources: [], status: "ready", stale: false, failedSources: [] });

test("a rejected first-ten story is replaced by a real collected reserve without recrawling feeds", async () => {
  const { collectHotPayload } = await daily;
  const items = originals(11);
  const first = buildHotList(items, new Date(NOW)).rankings[0];
  const crawl = crawler(items);
  const service = detailService((story) => story.title === first.title ? { status: "rejected", reason: "facts_not_supported" } : ready(story));
  const result = await collectHotPayload(dbFixture(), { fetcher: crawl.fetcher, now: () => NOW, detailService: service });
  assert.equal(result.rankings.length, 10);
  assert(result.rankings.every((story) => story.detail?.status === "ready"));
  assert(!result.rankings.some((story) => story.title === first.title));
  assert(result.rankings.some((story) => story.sources.some((source) => source.url === items[10].url)));
  assert.deepEqual(result.rankings.map((story) => story.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(service.attempted.length, 11);
  assert.equal(crawl.calls, HOT_FEEDS.length);
  const observation = result.leads.find((story) => story.title === first.title);
  assert(observation);
  assert.equal(observation.detail, undefined, "rejected AI prose is not published as an observation");
});

test("all rejected candidates stop at twenty event attempts and preserve the last persisted snapshot", async () => {
  const { publishDailyHotList } = await daily;
  const items = originals(25);
  const priorPayload = savedPayload([{ ...originals(1)[0], url: "https://techcrunch.com/last-good-original", publishedAt: new Date(NOW - 2 * DAY).toISOString() }], NOW - DAY);
  const prior = { updated_at: priorPayload.updatedAt, payload_json: JSON.stringify(priorPayload) };
  const db = dbFixture(prior);
  const crawl = crawler(items);
  const service = detailService(() => ({ status: "rejected", reason: "facts_not_supported" }));
  await assert.rejects(publishDailyHotList(db, { fetcher: crawl.fetcher, now: () => NOW, detailService: service }), /No hot-list events passed detail verification/);
  assert.equal(service.attempted.length, 20);
  assert.equal(new Set(service.attempted.map((story) => story.sources[0].url)).size, 20);
  assert.equal(crawl.calls, HOT_FEEDS.length);
  assert.equal(db.writes, 0);
  assert.deepEqual(db.row, prior);
});

test("a genuine verified shortage publishes the actual count and no rejected filler", async () => {
  const { collectHotPayload } = await daily;
  const crawl = crawler(originals(12));
  const service = detailService((story, attempt) => attempt <= 2 ? ready(story) : { status: "unavailable", reason: "original_unreadable" });
  const result = await collectHotPayload(dbFixture(), { fetcher: crawl.fetcher, now: () => NOW, detailService: service });
  assert.equal(result.rankings.length, 2);
  assert.equal(service.attempted.length, 12);
  assert(result.rankings.every((story) => story.detail?.status === "ready"));
  assert.equal(result.leads.length, 10);
  assert.deepEqual(result.rankings.map((story) => story.rank), [1, 2]);
});

test("a verified saved financial reserve can retain its same-source detail during a transient outage", async () => {
  const { collectHotPayload } = await daily;
  const financial = { sourceId: "joyy-ir", title: "JOYY Reports Second Quarter 2026 Financial Results", url: "https://ir.joyy.com/news-releases/news-release-details/joyy-results",
    publishedAt: new Date(NOW - 20 * DAY).toISOString(), contentText: "BIGO LIVE livestreaming revenue increased 16.3% to US$500 million while paying users grew 8%.", contentKind: "article" };
  const priorPayload = savedPayload([financial], NOW - DAY);
  priorPayload.rankings[0].detail = { ...ready(priorPayload.rankings[0]), titleZh: "欢聚披露直播业务具体经营数据", evidenceQuote: "net revenues increased by 16.3%", verifiedAt: new Date(NOW - DAY).toISOString() };
  const db = dbFixture({ updated_at: priorPayload.updatedAt, payload_json: JSON.stringify(priorPayload) });
  const crawl = crawler(originals(10));
  const fetcher = async (url, options) => {
    if (url === HOT_FEEDS.find((source) => source.id === "joyy-ir").url) return new Response(rss([financial]));
    if (url === financial.url) return new Response("Temporary upstream failure", { status: 503 });
    return crawl.fetcher(url, options);
  };
  const service = detailService((story) => story.topic === "JOYY" ? { status: "unavailable", reason: "temporary_article_failure" } : { status: "rejected", reason: "facts_not_supported" });
  const result = await collectHotPayload(db, { fetcher, now: () => NOW, detailService: service });
  assert.equal(service.attempted.length, 11);
  assert.equal(result.rankings.length, 1);
  assert.equal(result.rankings[0].topic, "JOYY");
  assert.equal(result.rankings[0].detail?.status, "ready");
  assert.equal(result.rankings[0].detail?.retained, true);
  assert.equal(result.rankings[0].detail?.evidenceQuote, "net revenues increased by 16.3%");
});

test("collection without an AI or detail service preserves the existing non-AI fixture behavior", async () => {
  const { collectHotPayload } = await daily;
  const items = originals(5);
  const crawl = crawler(items);
  const result = await collectHotPayload(dbFixture(), { fetcher: crawl.fetcher, now: () => NOW });
  assert.equal(result.rankings.length, 5);
  assert(result.rankings.every((story) => story.detail === undefined));
  assert.equal(crawl.calls, HOT_FEEDS.length);
});
