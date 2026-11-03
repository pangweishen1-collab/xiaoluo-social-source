import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { buildHotList, HOT_FEEDS, parseAppStoreLookupJson } from "../shared/hot-list.mjs";

const NOW = Date.parse("2026-10-19T05:00:00.000Z");
const DAY = 86_400_000;
const api = build({ entryPoints: [new URL("../worker/hot-list.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "browser", write: false })
  .then((result) => import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`));
const feed = (id) => HOT_FEEDS.find((source) => source.id === id);
const item = (sourceId, title, path, at = NOW - 3_600_000, extra = {}) => ({ sourceId, title, url: `https://${feed(sourceId).hosts[0]}/${path}`, publishedAt: new Date(at).toISOString(), ...extra });
const payload = (items, at = NOW) => ({ methodVersion: 9, updatedAt: new Date(at).toISOString(), windowHours: 48, rankingWindowHours: 168, fallbackWindowHours: 2160,
  ...buildHotList(items, new Date(at)), sources: [], status: items.length ? "ready" : "empty", stale: false, failedSources: [] });
function withReviewedDetail(story, verifiedAt = NOW - 60_000) {
  const source = story.sources[0];
  return { ...story, detail: { status: "ready", titleZh: "官方披露具体社交产品变化", change: "公司披露直播业务收入增长，并公布本期经营数据。", whyItMatters: "可研究直播业务的付费机制，具体效果仍需持续验证。",
    evidenceQuote: "net revenues increased by 16.3%", sourceUrl: source.url, sourceName: source.name, sourceTitle: source.title,
    sourceFeedPublishedAt: source.publishedAt, sourcePublishedAt: source.publishedAt, verifiedAt: new Date(verifiedAt).toISOString() } };
}
const row = (data) => ({ updated_at: data.updatedAt, payload_json: JSON.stringify(data) });
const finance = (at = NOW - 3_600_000) => item("joyy-ir", "JOYY Reports Second Quarter 2026 Unaudited Financial Results", "news-releases/news-release-details/joyy-results", at,
  { contentText: "BIGO LIVE livestreaming revenue increased 16.3% to US$500 million, while paying users grew 8% year over year.", contentKind: "article" });
const storeItem = (version, at) => {
  const source = feed("bigo-app-store");
  return { ...parseAppStoreLookupJson(JSON.stringify({ resultCount: 1, results: [{ trackId: source.appId, trackName: "BIGO LIVE - Live Chat", trackViewUrl: `https://apps.apple.com/us/app/bigo-live/id${source.appId}`,
    version, currentVersionReleaseDate: new Date(at).toISOString(), releaseNotes: "Added invite links for group voice chat rooms. Hosts can now approve guests before they join the room." }] }), source)[0], sourceId: source.id };
};

test("a short fully reviewed edition is served without replacing it with unreviewed headlines", async () => {
  const { handleDurableHotList } = await api;
  const data = payload([item("techcrunch", "WhatsApp launches new guest voice call controls", "verified-short")]);
  data.rankings = data.rankings.map((story) => withReviewedDetail(story));
  const db = { prepare() { return { async first() { return row(data); } }; } };
  const result = await handleDurableHotList(new Request("https://example.com/api/hot-list"), {
    db, now: () => NOW, handler: async () => { assert.fail("a public read must not replace reviewed results"); },
  });
  assert.equal((await result.json()).rankings[0].detail.status, "ready");
});

test("a delayed scheduled edition keeps its real timestamp and displays stale status without new AI-less news", async () => {
  const { handleDurableHotList } = await api;
  const data = payload([item("techcrunch", "WhatsApp launches new guest voice call controls", "verified-delayed", NOW - 3 * DAY)], NOW - 2 * DAY);
  data.rankings = data.rankings.map((story) => withReviewedDetail(story, NOW - 2 * DAY));
  const db = { prepare() { return { async first() { return row(data); } }; } };
  const result = await handleDurableHotList(new Request("https://example.com/api/hot-list"), {
    db, now: () => NOW, handler: async () => { assert.fail("stale reviewed evidence should remain visible"); },
  });
  const served = await result.json();
  assert.equal(served.updatedAt, data.updatedAt);
  assert.equal(served.snapshotStale, true);
  assert.equal(served.stale, true);
  assert.equal(served.rankings[0].detail.status, "ready");
});

test("merging a full current list keeps core financial events admitted from original article bodies", async () => {
  const { mergeSavedHotList } = await api;
  const prepared = [finance(), ...["Discord", "Facebook", "Instagram", "WhatsApp", "Threads", "TikTok", "Snapchat", "Reddit", "Twitch"].map((topic, index) => item("techcrunch", `${topic} launches new voice chat controls`, `current-${index}`, NOW - (index + 2) * 3_600_000))];
  const current = payload(prepared);
  assert.equal(current.rankings.length, 10);
  const saved = payload([item("techcrunch", "Telegram adds new social group chat controls", "old-telegram", NOW - 20 * DAY)]);
  const merged = mergeSavedHotList(current, saved, NOW, prepared);
  assert.equal(merged.rankings.length, 10);
  assert(merged.rankings.some((story) => story.title === prepared[0].title), "a new financial event must not be replaced by an old fallback after its body is discarded");
  assert(!JSON.stringify(merged).includes("contentText"));
  assert(!JSON.stringify(merged).includes("US$500 million"));
});

test("a previously reviewed financial event survives recovery without treating its short quote as article text", async () => {
  const { mergeSavedHotList, parseHotSnapshotRow } = await api;
  const saved = payload([finance(NOW - DAY)]);
  saved.rankings[0] = withReviewedDetail(saved.rankings[0]);
  assert.equal(parseHotSnapshotRow(row(saved), NOW)?.rankings.length, 1);
  assert(!/social|voice|chat|live/iu.test(saved.rankings[0].detail.evidenceQuote));
  const current = payload([item("techcrunch", "Telegram launches social group chat controls", "fresh-telegram")]);
  const merged = mergeSavedHotList(current, saved, NOW);
  assert.equal(merged.rankings.length, 2);
  const restored = merged.rankings.find((story) => story.topic === "JOYY");
  assert.equal(restored?.detail?.status, "ready");
  assert.equal(restored?.detail?.evidenceQuote, saved.rankings[0].detail.evidenceQuote);
  assert(!JSON.stringify(merged).includes("contentKind"));
  const forgedRaw = { ...finance(), contentText: "", contentKind: "article", previouslyReviewed: true };
  assert.equal(buildHotList([forgedRaw], new Date(NOW)).rankings.length, 0, "JSON fields cannot claim the process-local reviewed status");
});

test("the same App Store URL cannot restore an old detail into a newer version or publication date", async () => {
  const { mergeSavedHotList } = await api;
  const old = payload([storeItem("5.0.0", NOW - 2 * DAY)]);
  old.rankings[0] = withReviewedDetail(old.rankings[0], NOW - DAY);
  for (const [version, at] of [["5.1.0", NOW - 3_600_000], ["5.0.0", NOW - 3_600_000]]) {
    const fresh = storeItem(version, at);
    const current = payload([fresh]);
    assert.equal(current.rankings[0].sources[0].url, old.rankings[0].sources[0].url);
    const merged = mergeSavedHotList(current, old, NOW, [fresh]);
    assert.equal(merged.rankings.length, 1);
    assert.equal(merged.rankings[0].title, current.rankings[0].title);
    assert.equal(merged.rankings[0].publishedAt, fresh.publishedAt);
    assert.equal(merged.rankings[0].detail, undefined);
  }
});

test("v9 snapshot validation rejects wrong app identity and mismatched detail source, date or verification time", async () => {
  const { parseHotSnapshotRow } = await api;
  const valid = payload([storeItem("5.0.0", NOW - DAY)]);
  valid.rankings[0] = withReviewedDetail(valid.rankings[0]);
  assert.equal(parseHotSnapshotRow(row(valid), NOW)?.rankings[0].detail?.status, "ready");
  const corruptions = [
    (data) => { const story = data.rankings[0]; story.sources[0].url = story.sources[0].url.replace(`id${feed("bigo-app-store").appId}`, "id1509635224"); story.detail.sourceUrl = story.sources[0].url; },
    (data) => { data.rankings[0].detail.verifiedAt = new Date(NOW + DAY).toISOString(); },
    (data) => { data.rankings[0].detail.sourceName = feed("yoho-app-store").name; },
    (data) => { data.rankings[0].detail.sourceTitle = "BIGO LIVE - Live Chat · iOS 4.0.0"; },
    (data) => { data.rankings[0].detail.sourceFeedPublishedAt = new Date(NOW - 2 * DAY).toISOString(); },
    (data) => { data.rankings[0].detail.sourcePublishedAt = new Date(NOW - 5 * DAY).toISOString(); },
  ];
  for (const corrupt of corruptions) {
    const bad = structuredClone(valid);
    corrupt(bad);
    assert.equal(parseHotSnapshotRow(row(bad), NOW), null);
  }
  const wire = payload([item("joyy-wire", "JOYY social livestreaming revenue grows 10%", "news-release/2026/10/18/3400000/23553/en/joyy-results.html")]);
  wire.rankings[0] = withReviewedDetail(wire.rankings[0]);
  assert.equal(parseHotSnapshotRow(row(wire), NOW)?.rankings.length, 1);
  wire.rankings[0].sources[0].url = wire.rankings[0].sources[0].url.replace("/23553/", "/99999/");
  wire.rankings[0].detail.sourceUrl = wire.rankings[0].sources[0].url;
  assert.equal(parseHotSnapshotRow(row(wire), NOW), null, "a cached release cannot switch to an unrelated issuing organization on the same wire host");
});

test("a warm source outage preserves events whose first crawl required prepared original bodies", async () => {
  const { createHotListHandler } = await api;
  let unavailable = false;
  let at = NOW;
  const financial = finance();
  const fetcher = async (url) => {
    if (unavailable) throw new Error("temporary network outage");
    const source = HOT_FEEDS.find((entry) => entry.url === url);
    if (source.id === "joyy-ir") return new Response(`<rss><channel><item><title>${financial.title}</title><link>${financial.url}</link><pubDate>${financial.publishedAt}</pubDate></item></channel></rss>`);
    if (source.format === "apple-lookup") return Response.json({ resultCount: 0, results: [] });
    if (source.format === "newborn-json") return Response.json({ code: 0, data: { list: { website_hk_news: [] } } });
    if (source.format === "newborn-news-json") return Response.json({ code: 0, data: { list: [] } });
    if (source.format === "bigo-html") return new Response('<div class="blog-item"><a class="title" href="/news-events/old">BIGO LIVE launches voice rooms</a><div class="time">2025-01-01</div></div>');
    if (source.format === "globe-company-html") return new Response('<div class="recentNewsH"><li class="row"><div class="date-source"><span>August 25, 2025 19:00 ET</span><span>Source: <a class="sourceLink">JOYY Inc.</a></span></div><div class="mainLink"><a href="/news-release/2025/08/25/3000000/23553/en/joyy-old-results.html">JOYY Reports Old Financial Results</a></div></li></div>');
    return new Response("<rss><channel></channel></rss>");
  };
  const handler = createHotListHandler({ fetcher, now: () => at, prepareItems: async (items) => items.map((entry) => entry.url === financial.url ? { ...entry, contentText: financial.contentText, contentKind: "article" } : entry) });
  const request = new Request("https://example.com/api/hot-list");
  const first = await (await handler(request)).json();
  assert.equal(first.rankings[0]?.topic, "JOYY");
  unavailable = true;
  at += 6 * 60_000;
  const fallback = await (await handler(request)).json();
  assert.equal(fallback.status, "unavailable");
  assert.equal(fallback.stale, true);
  assert.equal(fallback.rankings[0]?.topic, "JOYY");
  assert.equal(fallback.rankings[0]?.title, financial.title);
});
