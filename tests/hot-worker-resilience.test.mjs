import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { buildHotList, HOT_FEEDS } from "../shared/hot-list.mjs";

const NOW = Date.parse("2026-10-13T08:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const topics = ["Discord", "Facebook", "Instagram", "WhatsApp", "Threads", "TikTok", "Snapchat", "Reddit", "Twitch", "Bluesky"];

const article = (sourceId, title, slug, hoursAgo = 1) => {
  const source = HOT_FEEDS.find((feed) => feed.id === sourceId);
  return { sourceId, title, url: `https://${source.hosts[0]}/${slug}`, publishedAt: new Date(NOW - hoursAgo * HOUR).toUTCString() };
};
const rss = (items = []) => `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title>${items.map((item) => `<item><title>${item.title}</title><link>${item.url}</link><pubDate>${item.publishedAt}</pubDate></item>`).join("")}</channel></rss>`;
const sourceResponse = (source, items = []) => {
  if (source.format === "apple-lookup") return Response.json({ resultCount: 0, results: [] });
  if (source.format === "globe-company-html") return new Response('<div class="recentNewsH"><li class="row"><div class="date-source"><span>August 25, 2025 19:00 ET</span><span>Source: <a class="sourceLink">JOYY Inc.</a></span></div><div class="mainLink"><a href="/news-release/2025/08/25/3000000/23553/en/joyy-reports-old-financial-results.html">JOYY Reports Old Financial Results</a></div></li></div>');
  if (source.format === "bigo-html") return new Response('<div class="blog-item"><a href="/news-events/old" class="title">BIGO LIVE launches voice rooms</a><div class="time">2025-01-01</div></div>');
  if (source.format === "newborn-json") return Response.json({ code: 0, data: { list: { website_hk_news: [] } } });
  if (source.format === "newborn-news-json") return Response.json({ code: 0, data: { list: [] } });
  return new Response(rss(items));
};
const bundled = (async () => {
  const [api, daily] = await Promise.all(["hot-list", "hot-daily"].map((name) => build({
    entryPoints: [new URL(`../worker/${name}.ts`, import.meta.url).pathname],
    bundle: true, format: "esm", platform: "browser", write: false,
  })));
  return Promise.all([api, daily].map((result) => import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`)));
})();

function snapshotDb() {
  let row = null;
  return {
    get row() { return row; },
    set row(value) { row = value; },
    prepare(sql) {
      if (sql.startsWith("SELECT")) return { async first() { return row; } };
      if (sql.startsWith("INSERT")) return { bind(updatedAt, payloadJson) {
        return { async run() {
          if (row && row.updated_at >= updatedAt) return { meta: { changes: 0 } };
          row = { updated_at: updatedAt, payload_json: payloadJson };
          return { meta: { changes: 1 } };
        } };
      } };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

function savedRow(items, at = NOW, methodVersion = 9) {
  const updatedAt = new Date(at).toISOString();
  const payload = {
    methodVersion, updatedAt, windowHours: 48, rankingWindowHours: 168, fallbackWindowHours: 2160,
    ...buildHotList(items, new Date(at)), sources: [], status: "ready", stale: false, failedSources: [],
  };
  return { updated_at: updatedAt, payload_json: JSON.stringify(payload) };
}

test("an unexpectedly empty source keeps its last real entries until their dates expire", async () => {
  const [api] = await bundled;
  let now = NOW;
  let empty = false;
  const title = "Discord launches new voice chat controls";
  const item = article("techcrunch", title, "discord-chat-controls", 1);
  const fetcher = async (url) => {
    const source = HOT_FEEDS.find((feed) => feed.url === url);
    return sourceResponse(source, source.id === "techcrunch" && !empty ? [item] : []);
  };
  const handle = api.createHotListHandler({ fetcher, now: () => now });
  const request = new Request("https://example.com/api/hot-list");
  const initial = await (await handle(request)).json();
  assert.equal(initial.status, "ready");
  assert.deepEqual(initial.rankings.map((story) => story.title), [title]);

  empty = true;
  now += 6 * 60 * 1000;
  const preserved = await (await handle(request)).json();
  assert.deepEqual(preserved.rankings.map((story) => story.title), [title]);
  assert.equal(preserved.stale, true);
  assert.deepEqual(preserved.failedSources, ["TechCrunch Social"]);
  assert.equal(preserved.rankings[0].sources[0].url, item.url);

  now += 91 * DAY;
  const expired = await (await handle(request)).json();
  assert.equal(expired.rankings.length, 0, "a saved link cannot stay ranked past 90 days");
});

test("a genuinely empty first crawl stays empty without fake records or false failures", async () => {
  const [api] = await bundled;
  const fetcher = async (url) => sourceResponse(HOT_FEEDS.find((feed) => feed.url === url));
  const result = await (await api.createHotListHandler({ fetcher, now: () => NOW })(new Request("https://example.com/api/hot-list"))).json();
  assert.equal(result.status, "empty");
  assert.equal(result.rankings.length, 0);
  assert.deepEqual(result.failedSources, []);
  assert.equal(result.stale, false);
});

test("a dedicated TikTok RSS crawl contributes concrete chat and live features only", async () => {
  const [api] = await bundled;
  const source = HOT_FEEDS.find((feed) => feed.id === "techcrunch-tiktok");
  assert.equal(source?.url, "https://techcrunch.com/tag/tiktok/feed/");
  let requests = 0;
  const fetcher = async (url) => {
    const feed = HOT_FEEDS.find((candidate) => candidate.url === url);
    if (feed.id !== "techcrunch-tiktok") return sourceResponse(feed);
    requests += 1;
    return sourceResponse(feed, [
      article("techcrunch-tiktok", "TikTok LIVE adds virtual gifts to multi-guest rooms", "tiktok-live-gifts", 2),
      article("techcrunch-tiktok", "TikTok rolls out in-app direct messages", "tiktok-direct-messages", 3),
      article("techcrunch-tiktok", "TikTok Safety Center", "tiktok-safety-center", 1),
      article("techcrunch-tiktok", "TikTok LIVE Spotlights Creators at Community Fest Event", "tiktok-community-event", 1),
    ]);
  };
  const payload = await (await api.createHotListHandler({ fetcher, now: () => NOW })(new Request("https://example.com/api/hot-list"))).json();
  assert.equal(requests, 1);
  assert.deepEqual(payload.failedSources, []);
  assert.equal(payload.sources.find((feed) => feed.name === source.name)?.kind, "media");
  assert.deepEqual(new Set(payload.rankings.map((story) => story.title)), new Set([
    "TikTok LIVE adds virtual gifts to multi-guest rooms",
    "TikTok rolls out in-app direct messages",
  ]));
  assert(payload.rankings.every((story) => story.sources[0].url.startsWith("https://techcrunch.com/")));
});

test("malformed, duplicate, unsafe, and expired full snapshots cannot hide a live recovery", async () => {
  const [api] = await bundled;
  const items = topics.map((topic, index) => article("techcrunch", `${topic} launches new social chat controls`, `snapshot-${index}`, index + 1));
  const row = savedRow(items);
  assert.equal(api.parseHotSnapshotRow(row, NOW)?.rankings.length, 10);
  const cases = [
    (payload) => { payload.rankings[1].rank = 1; },
    (payload) => { payload.rankings[1].id = payload.rankings[0].id; },
    (payload) => { payload.rankings[1].sources[0].url = payload.rankings[0].sources[0].url; },
    (payload) => { payload.rankings[1].sources[0].url = "https://evil.example/article"; },
    (payload) => { payload.rankings[1].sources[0].url += "?utm_source=forged"; },
    (payload) => { payload.rankings[1].sources[0].publishedAt = new Date(NOW + DAY).toISOString(); },
    (payload) => { payload.rankings[1].sources[0].publishedAt = new Date(NOW - 91 * DAY).toISOString(); },
  ];
  for (const corrupt of cases) {
    const payload = JSON.parse(row.payload_json);
    corrupt(payload);
    const bad = { ...row, payload_json: JSON.stringify(payload) };
    assert.equal(api.parseHotSnapshotRow(bad, NOW), null);
    const db = snapshotDb();
    db.row = bad;
    let liveCalls = 0;
    const response = await api.handleDurableHotList(new Request("https://example.com/api/hot-list"), {
      db, now: () => NOW,
      handler: async () => { liveCalls += 1; return Response.json({ marker: "live" }); },
    });
    assert.deepEqual(await response.json(), { marker: "live" });
    assert.equal(liveCalls, 1);
  }
});

test("a complete version 7 snapshot is re-ranked with a fresh version 9 crawl, never served unchanged", async () => {
  const [api] = await bundled;
  const savedItems = topics.map((topic, index) => article("techcrunch", `${topic} launches new social chat controls`, `legacy-${index}`, index + 1));
  const row = savedRow(savedItems, NOW, 7);
  const at = NOW + HOUR;
  assert.equal(api.parseHotSnapshotRow(row, at), null, "the old method must not qualify for direct serving");
  assert.equal(api.parseHotSnapshotRow(row, at, true)?.rankings.length, 10, "validated old links remain available to re-rank");
  const fresh = { ...article("techcrunch", "Telegram launches new social chat controls", "fresh-telegram"), publishedAt: new Date(at - 10 * 60 * 1000).toUTCString() };
  const current = {
    methodVersion: 9, updatedAt: new Date(at).toISOString(), windowHours: 48, rankingWindowHours: 168,
    fallbackWindowHours: 2160, ...buildHotList([fresh], new Date(at)), sources: [], status: "ready", stale: false, failedSources: [],
  };
  const db = snapshotDb();
  db.row = row;
  let liveCalls = 0;
  const response = await api.handleDurableHotList(new Request("https://example.com/api/hot-list"), {
    db, now: () => at,
    handler: async () => { liveCalls += 1; return Response.json(current); },
  });
  const payload = await response.json();
  assert.equal(liveCalls, 1);
  assert.equal(payload.methodVersion, 9);
  assert.equal(payload.updatedAt, current.updatedAt);
  assert.equal(payload.usedSavedSnapshot, true);
  assert.equal(payload.stale, true);
  assert.equal(payload.rankings.length, 10);
  assert(payload.rankings.some((story) => story.topic === "Telegram"));
  assert(payload.rankings.some((story) => story.sources.some((source) => source.url.includes("/legacy-"))));
  assert.equal(new Set(payload.rankings.flatMap((story) => story.sources.map((source) => source.url))).size, 10);
});

test("the scheduled publisher upgrades validated version 7 links without losing them", async () => {
  const [, daily] = await bundled;
  const db = snapshotDb();
  const savedItems = topics.map((topic, index) => article("techcrunch", `${topic} launches new social chat controls`, `legacy-${index}`, index + 1));
  db.row = savedRow(savedItems, NOW, 7);
  const at = NOW + DAY;
  const fresh = { ...article("techcrunch", "Telegram launches new social chat controls", "fresh-telegram"), publishedAt: new Date(at - HOUR).toUTCString() };
  const fetcher = async (url) => {
    const source = HOT_FEEDS.find((feed) => feed.url === url);
    return sourceResponse(source, source.id === "techcrunch" ? [fresh] : []);
  };
  const result = await daily.publishDailyHotList(db, { fetcher, now: () => at });
  const payload = JSON.parse(db.row.payload_json);
  assert.deepEqual({ written: result.written, rankings: result.rankings }, { written: true, rankings: 10 });
  assert.equal(payload.methodVersion, 9);
  assert.equal(payload.updatedAt, new Date(at).toISOString());
  assert.equal(payload.usedSavedSnapshot, true);
  assert(payload.rankings.some((story) => story.topic === "Telegram"));
  assert(payload.rankings.some((story) => story.sources.some((source) => source.url.includes("/legacy-"))));
  assert.equal(new Set(payload.rankings.flatMap((story) => story.sources.map((source) => source.url))).size, 10);
});

test("a Beijing date-only official story survives snapshot validation after local midnight", async () => {
  const [api] = await bundled;
  const at = Date.parse("2026-10-12T16:30:00Z"); // 2026-10-13 00:30 in Beijing
  const row = savedRow([{
    sourceId: "bigo-news",
    title: "BIGO LIVE launches creator voice rooms",
    url: "https://www.bigo.tv/news-events/creator-voice-rooms",
    publishedAt: "2026-10-13",
  }], at);
  const payload = api.parseHotSnapshotRow(row, at);
  assert.equal(payload?.rankings.length, 1);
  assert.equal(payload.rankings[0].publishedAt, "2026-10-13");
  assert.equal(payload.rankings[0].sources[0].publishedAt, "2026-10-13");
});

test("daily refresh keeps valid recent links when a ten-item older crawl displaces them", async () => {
  const [, daily] = await bundled;
  const db = snapshotDb();
  const recent = topics.map((topic, index) => article("techcrunch", `${topic} launches new social chat controls`, `recent-${index}`, index + 1));
  const older = topics.map((topic, index) => article("social-media-today", `${topic} updates new social chat settings`, `older-${index}`, 40 * 24 + index));
  let crawl = 1;
  const fetcher = async (url) => {
    const source = HOT_FEEDS.find((feed) => feed.url === url);
    const items = crawl === 1 && source.id === "techcrunch" ? recent
      : crawl === 2 && source.id === "social-media-today" ? older : [];
    return sourceResponse(source, items);
  };
  assert.equal((await daily.publishDailyHotList(db, { fetcher, now: () => NOW })).rankings, 10);
  crawl = 2;
  const result = await daily.publishDailyHotList(db, { fetcher, now: () => NOW + DAY });
  assert.equal(result.rankings, 10);
  const payload = JSON.parse(db.row.payload_json);
  assert.equal(payload.usedSavedSnapshot, true);
  assert.equal(payload.stale, true);
  assert.equal(payload.rankings.length, 10);
  assert(payload.rankings.every((story) => story.sources[0].url.includes("/recent-")));
  assert.equal(new Set(payload.rankings.map((story) => story.sources[0].url)).size, 10);
});
