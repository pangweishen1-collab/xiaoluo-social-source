import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";

const bundle = await build({ stdin: { contents: 'export * from "./worker/hot-incremental"; export * from "./worker/hot-enrichment"; export * from "./worker/hot-daily";', resolveDir: new URL("..", import.meta.url).pathname }, bundle: true, format: "esm", platform: "browser", write: false });
const { HotIncrementalSession, HOT_PROCESSING_VERSION, enrichHotPayload, collectHotPayload, hotProcessingRepository } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const NOW = Date.parse("2026-10-20T02:00:00.000Z");
const PUBLISHED = "2026-10-19T02:00:00.000Z";
const QUOTE = "Discord adds voice room controls so hosts can choose who joins the conversation.";
const BODY = `${QUOTE} The new controls are available to community hosts. The article describes the product mechanism separately from its effects on user retention. This original appendix is not for republication: PRIVATE_ORIGINAL_APPENDIX.`;
function fixture(id = 1) {
  const source = { name: "TechCrunch Social", title: `Discord launches voice room controls ${id}`, url: `https://techcrunch.com/discord-voice-${id}/`, publishedAt: PUBLISHED, kind: "media" };
  const story = { id: `story-${id}`, topic: "Discord", title: source.title, publishedAt: PUBLISHED, sources: [source], sourceCount: 1, verification: "single-source", rank: id };
  const article = { sourceUrl: source.url, title: source.title, text: BODY, publishedAt: PUBLISHED, contentKind: "article" };
  const detail = { status: "ready", titleZh: "Discord 新增语聊房间主持人控制功能", change: "Discord 为语聊房间新增参与控制，主持人可以选择谁加入对话。", whyItMatters: "可关注主持人控制对房间互动的影响，实际留存效果仍需核实。", evidenceQuote: QUOTE,
    sourceUrl: source.url, sourceName: source.name, sourceTitle: source.title, sourceFeedPublishedAt: PUBLISHED, sourcePublishedAt: PUBLISHED, verifiedAt: new Date(NOW - 60_000).toISOString() };
  return { story, article, detail };
}
function repository() {
  const records = new Map();
  let lock = null;
  return { records, async load(at) { return new Map([...records].filter(([key, value]) => key === "ai-quota-pause" && Date.parse(value.expiresAt) > at).map(([key, value]) => [key, structuredClone(value)])); },
    async get(key, at) { const record = records.get(key); return record && Date.parse(record.expiresAt) > at ? structuredClone(record) : null; },
    async put(key, value, expiresAt) { records.set(key, { value: structuredClone(value), expiresAt }); },
    async acquire(token, at) { if (lock && lock.until > at) return false; lock = { token, until: at + 30 * 60_000 }; return true; },
    async release(token) { if (lock?.token === token) lock = null; } };
}
async function session(repo, at = NOW, budget = 10) { const value = new HotIncrementalSession(repo, at, budget); await value.initialize(); return value; }

test("unchanged originals reuse the independently reviewed result across runs with zero additional AI calls", async () => {
  const repo = repository(); const { story, article, detail } = fixture(); let calls = 0;
  const run = async () => { calls += 1; return detail; };
  assert.equal((await (await session(repo)).process(story, [article], run)).status, "ready");
  const next = await session(repo, NOW + 60_000);
  const reused = await next.process(story, [{ ...article, text: article.text.replaceAll(" ", "\n") }], run);
  assert.equal(calls, 1); assert.equal(next.stats.reused, 1); assert.equal(next.stats.newEvents, 0);
  assert.equal(reused.verifiedAt, detail.verifiedAt, "reuse cannot fabricate a new review time");
  assert(!JSON.stringify([...repo.records]).includes("PRIVATE_ORIGINAL_APPENDIX"));
});

test("body, original title, date, topic and source identity changes invalidate prior approval", async () => {
  for (const change of [
    (f) => { f.article.text += " This is a changed rollout."; },
    (f) => { f.article.title += " corrected"; },
    (f) => { f.story.sources[0].title += " revised"; },
    (f) => { f.story.topic = "WhatsApp"; },
    (f) => { f.article.publishedAt = "2026-10-19T03:00:00.000Z"; },
    (f) => { f.story.sources[0].publishedAt = "2026-10-19T03:00:00.000Z"; },
  ]) {
    const repo = repository(); const original = fixture();
    await (await session(repo)).process(original.story, [original.article], async () => original.detail);
    const modified = fixture(); change(modified); let calls = 0;
    await (await session(repo)).process(modified.story, [modified.article], async () => { calls += 1; return { status: "rejected" }; });
    assert.equal(calls, 1);
  }
});

test("processing-rule changes, malformed approvals and expired records cannot be reused", async () => {
  for (const corrupt of [
    (row) => { row.value.version = "previous-rules"; },
    (row) => { row.value.detail.sourceName = "Discord Blog"; },
    (row) => { row.value.detail.evidenceQuote = "A forged quotation that is not in the original body."; },
    (row) => { row.expiresAt = new Date(NOW - 1).toISOString(); },
  ]) {
    const repo = repository(); const { story, article, detail } = fixture();
    await (await session(repo)).process(story, [article], async () => detail);
    corrupt(repo.records.values().next().value); let calls = 0;
    await (await session(repo)).process(story, [article], async () => { calls += 1; return { status: "rejected" }; });
    assert.equal(calls, 1);
  }
});

test("same rejected original skips AI but revised content is retried; rejected prose is never persisted", async () => {
  const repo = repository(); const { story, article } = fixture(); let calls = 0;
  const reject = async () => { calls += 1; return { status: "rejected", change: "UNAPPROVED_PROSE", reason: "facts_not_supported" }; };
  await (await session(repo)).process(story, [article], reject);
  const next = await session(repo); assert.equal((await next.process(story, [article], reject)).status, "rejected");
  assert.equal(next.stats.rejectedReused, 1); assert.equal(calls, 1);
  assert(!JSON.stringify([...repo.records]).includes("UNAPPROVED_PROSE"));
  await next.process(story, [{ ...article, text: `${BODY} A corrected paragraph.` }], reject);
  assert.equal(calls, 2);
});

test("quota exhaustion pauses later calls, survives a new run, and never blocks a valid cache hit", async () => {
  const repo = repository(); const good = fixture(1); const fresh = fixture(2); let calls = 0;
  await (await session(repo)).process(good.story, [good.article], async () => good.detail);
  const blocked = await session(repo);
  const fail = async () => { calls += 1; throw new Error("4006: Free allocation of 10,000 neurons exceeded"); };
  assert.equal((await blocked.process(fresh.story, [fresh.article], fail)).status, "unavailable");
  assert.equal((await blocked.process(fixture(3).story, [fixture(3).article], fail)).reason, "ai_quota_paused");
  const later = await session(repo, NOW + 60_000);
  assert.equal((await later.process(fresh.story, [fresh.article], fail)).reason, "ai_quota_paused");
  assert.equal((await later.process(good.story, [good.article], fail)).status, "ready"); assert.equal(calls, 1);
  await (await session(repo, NOW + 61 * 60_000)).process(fresh.story, [fresh.article], fail);
  assert.equal(calls, 2, "only a later scheduled/manual run after backoff probes the provider again");
});

test("new-event budget excludes warm hits and defers excess events without caching a false rejection", async () => {
  const repo = repository(); const warm = fixture();
  await (await session(repo)).process(warm.story, [warm.article], async () => warm.detail);
  const bounded = await session(repo, NOW, 1); let calls = 0;
  await bounded.process(warm.story, [warm.article], async () => assert.fail("warm hit"));
  for (const id of [2, 3]) { const f = fixture(id); await bounded.process(f.story, [f.article], async () => { calls += 1; return f.detail; }); }
  assert.equal(calls, 1); assert.equal(bounded.stats.deferred, 1); assert.equal(bounded.stats.reused, 1);
  assert.equal(repo.records.size, 2);
});

test("unreadable, future and out-of-window originals cause no AI call", async () => {
  const { story, article } = fixture(); const value = await session(repository());
  for (const originals of [[], [{ ...article, text: "too short" }], [{ ...article, publishedAt: "2026-10-21T00:00:00.000Z" }], [{ ...article, publishedAt: "2026-01-01T00:00:00.000Z" }]]) {
    assert.equal((await value.process(story, originals, async () => assert.fail("invalid original"))).reason, "original_unreadable");
  }
});

test("a ready result without the literal current quote is not accepted or cached", async () => {
  const repo = repository(); const { story, article, detail } = fixture();
  const result = await (await session(repo)).process(story, [article], async () => ({ ...detail, evidenceQuote: "This fabricated claim cannot be found in the original article." }));
  assert.equal(result.status, "unavailable"); assert.equal(repo.records.size, 0);
});

test("enrichment fingerprints the same body supplied to the child and does not call it on warm runs", async () => {
  const repo = repository(); const { story, article, detail } = fixture(); let reads = 0; let aiCalls = 0;
  const fetcher = async () => { reads += 1; return new Response(`<html><head><meta property="og:title" content="${article.title}"><meta property="article:published_time" content="${PUBLISHED}"></head><body><article><p>${BODY}</p></article></body></html>`, { headers: { "content-type": "text/html" } }); };
  const detailService = { async fetch(request) { aiCalls += 1; const data = await request.json(); assert(data.articles[0].text.includes(QUOTE)); assert.equal(data.story.sources.length, 1); return Response.json(detail); } };
  const payload = { rankings: [story] };
  await enrichHotPayload(payload, { fetcher, detailService, now: NOW, incremental: await session(repo) });
  const result = await enrichHotPayload(payload, { fetcher, detailService, now: NOW + 60_000, incremental: await session(repo, NOW + 60_000) });
  assert.equal(aiCalls, 1); assert.equal(reads, 2, "network reread detects updates but does not invoke AI for unchanged text");
  assert.equal(result.rankings[0].detail.verifiedAt, detail.verifiedAt);
});

test("processing lock and unavailable cache fail closed before feed reads or AI", async () => {
  const repo = repository(); await repo.acquire("other", NOW); let calls = 0;
  const db = { prepare() { assert.fail("must not reach snapshot database"); } };
  const options = { now: () => NOW, fetcher: async () => { calls += 1; assert.fail("no fetch"); }, processingRepository: repo };
  await assert.rejects(collectHotPayload(db, options), /already running/);
  await repo.release("other"); repo.load = async () => { throw new Error("cache unavailable"); };
  await assert.rejects(collectHotPayload(db, options), /cache unavailable/);
  assert.equal(calls, 0); assert.equal(await repo.acquire("after-failure", NOW), true, "failed cache initialization releases its lease");
});

test("D1 repository uses conditional token-bound leases, success checks and an expiry index", async () => {
  const statements = [];
  const db = { prepare(sql) { return { bind(...values) { statements.push({ sql, values }); return { async run() { return { success: true, meta: { changes: 1 } }; }, async all() { return { success: true, results: [] }; } }; } }; } };
  const repo = hotProcessingRepository(db);
  await repo.acquire("owner", NOW); await repo.load(NOW); await repo.put("article:digest", { version: HOT_PROCESSING_VERSION }, new Date(NOW + 60_000).toISOString()); await repo.release("owner");
  assert.match(statements[0].sql, /WHERE hot_event_processing_cache.expires_at <= \?/);
  assert.match(statements.at(-1).sql, /AND result_json = \?/); assert.equal(statements.at(-1).values[1], '"owner"');
  const schema = await readFile(new URL("../db/hot-event-processing-cache.sql", import.meta.url), "utf8");
  assert.match(schema, /CREATE TABLE IF NOT EXISTS hot_event_processing_cache/); assert.match(schema, /CREATE INDEX IF NOT EXISTS/);
  assert(!statements.some((statement) => /hot_list_snapshot|daily_automation_runs/.test(statement.sql)));
});
