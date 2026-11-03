import test from "node:test";
import assert from "node:assert/strict";
import { loadPublicData, readPublicData, invalidatePublicData } from "../app/public-data-cache.mjs";
test("daily cache is synchronously reusable, expires and clears after editing", async () => {
  let time = 1000;
  const path = "/test-daily-sync";
  const data = { items: [{ date: "2026-09-17", title: "日报", body: "正文" }] };
  assert.equal(readPublicData(path, { now: () => time }), null);
  await loadPublicData(path, { now: () => time, fetcher: async () => ({ ok: true, json: async () => data }) });
  assert.deepEqual(readPublicData(path, { now: () => time }), data);
  time += 30000;
  assert.equal(readPublicData(path, { now: () => time }), null);
  await loadPublicData(path, { now: () => time, fetcher: async () => ({ ok: true, json: async () => data }) });
  invalidatePublicData(path);
  assert.equal(readPublicData(path, { now: () => time }), null);
});
test("parallel and repeated requests reuse one fetch until expiry", async () => {
  let calls = 0, time = 1000;
  const options = { now: () => time, fetcher: async () => ({ ok: true, json: async () => ({ count: ++calls }) }) };
  const [a, b] = await Promise.all([loadPublicData("/test-a", options), loadPublicData("/test-a", options)]);
  assert.deepEqual(a, b);
  await loadPublicData("/test-a", options);
  assert.equal(calls, 1);
  time += 30001;
  await loadPublicData("/test-a", options);
  assert.equal(calls, 2);
  await loadPublicData("/test-a", { ...options, force: true });
  assert.equal(calls, 3);
  invalidatePublicData("/test-a");
  await loadPublicData("/test-a", options);
  assert.equal(calls, 4);
});
test("failed requests can retry without browser storage", async () => {
  await assert.rejects(loadPublicData("/test-b", { fetcher: async () => ({ ok: false }) }));
  const data = await loadPublicData("/test-b", { fetcher: async () => ({ ok: true, json: async () => ({ items: [] }) }) });
  assert.deepEqual(data, { items: [] });
});
test("an invalidated in-flight request cannot overwrite newer data", async () => {
  let finish;
  const old = loadPublicData("/test-c", { fetcher: () => new Promise(resolve => { finish = resolve; }) });
  await Promise.resolve();
  await loadPublicData("/test-c", { force: true, fetcher: async () => ({ ok: true, json: async () => "new" }) });
  finish({ ok: true, json: async () => "old" });
  await old;
  assert.equal(await loadPublicData("/test-c"), "new");
});

test("a longer cache lifetime can serve a hot list without affecting the default lifetime", async () => {
  const path = "/test-hot-long-ttl";
  let time = 1000;
  let calls = 0;
  const options = {
    maxAge: 5 * 60 * 1000,
    now: () => time,
    fetcher: async () => ({ ok: true, json: async () => ({ status: "ready", sequence: ++calls }) }),
  };
  await loadPublicData(path, options);
  time += 31 * 1000;
  assert.deepEqual(readPublicData(path, { now: () => time, maxAge: options.maxAge }), { status: "ready", sequence: 1 });
  assert.equal(readPublicData(path, { now: () => time }), null, "the regular 30-second cache policy remains unchanged");
  await loadPublicData(path, options);
  assert.equal(calls, 1);
  time += 5 * 60 * 1000;
  await loadPublicData(path, options);
  assert.equal(calls, 2);
  invalidatePublicData(path);
});

test("conditional caching skips unavailable hot-list payloads and retries next time", async () => {
  const path = "/test-hot-unavailable";
  let calls = 0;
  const options = {
    cacheIf: (data) => data.status !== "unavailable",
    fetcher: async () => ({ ok: true, json: async () => (++calls === 1 ? { status: "unavailable" } : { status: "ready" }) }),
  };
  assert.deepEqual(await loadPublicData(path, options), { status: "unavailable" });
  assert.equal(readPublicData(path), null);
  assert.deepEqual(await loadPublicData(path, options), { status: "ready" });
  assert.equal(calls, 2);
  assert.deepEqual(readPublicData(path), { status: "ready" });
  invalidatePublicData(path);
});
