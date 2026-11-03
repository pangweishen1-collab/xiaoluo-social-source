import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import generatorWorker from "../worker/daily-automation/generator.mjs";

const NOW = new Date("2026-10-15T03:15:00.000Z");
const REPORT_DATE = "2026-10-15";

const hotWorker = build({
  entryPoints: [new URL("../worker/hot-daily.ts", import.meta.url).pathname],
  bundle: true, format: "esm", platform: "browser", write: false,
}).then((result) => import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`));

function runDb(initialStatus = null) {
  let status = initialStatus;
  const queries = [];
  return {
    queries,
    setStatus(value) { status = value; },
    prepare(sql) {
      assert.match(sql, /SELECT status FROM daily_automation_runs WHERE report_date = \?/);
      return {
        bind(date) {
          queries.push(date);
          return { async first() { return status ? { status } : null; } };
        },
      };
    },
  };
}

test("backup never repeats any recorded daily attempt, including rejection", async () => {
  const { runMissedDailyReport } = await hotWorker;
  for (const status of ["published", "skipped_existing", "rejected"]) {
    const db = runDb(status);
    let generatorCalls = 0;
    const result = await runMissedDailyReport(db, {
      async fetch() { generatorCalls += 1; throw new Error("must not be called"); },
    }, { now: () => NOW });
    assert.deepEqual(result, { reportDate: REPORT_DATE, status: "skipped_recorded", existingStatus: status });
    assert.deepEqual(db.queries, [REPORT_DATE]);
    assert.equal(generatorCalls, 0);
  }
});

test("backup invokes the private generator once after a missing run, then skips it", async () => {
  const { runMissedDailyReport } = await hotWorker;
  const db = runDb();
  let generatorCalls = 0;
  const generator = {
    async fetch(request) {
      generatorCalls += 1;
      assert.equal(request.url, "https://generator.internal/run-if-missing");
      assert.equal(request.method, "POST");
      db.setStatus("rejected");
      return Response.json({ reportDate: REPORT_DATE, publicationStatus: "rejected", candidateCount: 0 });
    },
  };
  assert.deepEqual(await runMissedDailyReport(db, generator, { now: () => NOW }), {
    reportDate: REPORT_DATE, status: "rejected", candidateCount: 0,
  });
  assert.equal((await runMissedDailyReport(db, generator, { now: () => NOW })).status, "skipped_recorded");
  assert.equal(generatorCalls, 1);
  assert.deepEqual(db.queries, [REPORT_DATE, REPORT_DATE]);
});

test("backup fails closed if D1 status cannot be read or the generator gives no persisted outcome", async () => {
  const { runMissedDailyReport } = await hotWorker;
  let calls = 0;
  const generator = { async fetch() { calls += 1; return Response.json({ reportDate: REPORT_DATE, publicationStatus: "published" }); } };
  const brokenDb = { prepare() { throw new Error("D1 unavailable"); } };
  await assert.rejects(runMissedDailyReport(brokenDb, generator, { now: () => NOW }), /D1 unavailable/);
  assert.equal(calls, 0);

  const db = runDb();
  await assert.rejects(runMissedDailyReport(db, { async fetch() { return Response.json({ reportDate: "2026-10-14", publicationStatus: "published" }); } }, { now: () => NOW }), /persisted outcome for today/);
  await assert.rejects(runMissedDailyReport(db, { async fetch() { return Response.json({ reportDate: REPORT_DATE, publicationStatus: "unknown" }); } }, { now: () => NOW }), /persisted outcome for today/);
  await assert.rejects(runMissedDailyReport(db, { async fetch() { return new Response("failed", { status: 503 }); } }, { now: () => NOW }), /HTTP 503/);
});

test("hot-list cron keeps its original crawl and never calls the generator", async () => {
  const { default: worker } = await hotWorker;
  const previousFetch = globalThis.fetch;
  const statements = [];
  const db = {
    prepare(sql) {
      statements.push(sql);
      assert.doesNotMatch(sql, /daily_automation_runs/);
      if (sql.startsWith("SELECT")) return { async first() { return null; } };
      return { bind() { return { async run() { return { meta: { changes: 1 } }; } }; } };
    },
  };
  let generatorCalls = 0;
  try {
    const published = new Date().toUTCString();
    const xml = `<rss version="2.0"><channel><title>Feed</title><item><title>TikTok LIVE adds virtual gifts to multi-guest rooms</title><link>https://techcrunch.com/2026/10/15/tiktok-live-gifts/</link><pubDate>${published}</pubDate></item></channel></rss>`;
    globalThis.fetch = async () => new Response(xml);
    await worker.scheduled({ cron: "0 0 * * *" }, {
      DB: db,
      DAILY_GENERATOR: { async fetch() { generatorCalls += 1; throw new Error("unexpected"); } },
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
  assert.equal(generatorCalls, 0);
  assert(statements.some((sql) => sql.includes("INSERT INTO hot_list_snapshot")));
  await assert.rejects(worker.scheduled({ cron: "unexpected" }, { DB: db }), /Unexpected scheduled cron/);
});

test("backup cron dispatches to the recorded-run gate without crawling hot feeds", async () => {
  const { default: worker } = await hotWorker;
  const db = runDb("published");
  let generatorCalls = 0;
  await worker.scheduled({ cron: "15 3 * * *" }, {
    DB: db,
    DAILY_GENERATOR: { async fetch() { generatorCalls += 1; throw new Error("unexpected"); } },
  });
  assert.equal(db.queries.length, 1);
  assert.equal(generatorCalls, 0);
});

test("generator fallback entrypoint is private and reports only persisted review outcomes", async () => {
  const env = {
    AI: {},
    REVIEWER: { async fetch(request) {
      assert.equal(new URL(request.url).pathname, "/review");
      assert.equal((await request.json()).failure, "generator_ai_unavailable");
      return Response.json({ status: "rejected", publisher: { status: "rejected" } });
    } },
  };
  for (const request of [
    new Request("https://generator.internal/run-if-missing"),
    new Request("https://generator.internal/other", { method: "POST" }),
    new Request("https://public.example/run-if-missing", { method: "POST" }),
    new Request("https://generator.internal/run-if-missing?test=1", { method: "POST" }),
  ]) assert.equal((await generatorWorker.fetch(request, env)).status, 404);

  const response = await generatorWorker.fetch(new Request("https://generator.internal/run-if-missing", { method: "POST" }), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.reviewStatus, "rejected");
  assert.equal(payload.publicationStatus, "rejected");
  assert.equal(payload.candidateCount, 0);
  assert.match(payload.reportDate, /^\d{4}-\d{2}-\d{2}$/);
});
