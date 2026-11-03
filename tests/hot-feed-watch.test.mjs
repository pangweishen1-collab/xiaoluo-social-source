import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({ entryPoints: [new URL("../app/hot-feed-watch.ts", import.meta.url).pathname], bundle: true, write: false, format: "esm", platform: "node" });
const { watchHotFeed, HOT_FEED_CHECK_MS } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const settle = () => new Promise(resolve => setImmediate(resolve));
const feed = date => ({ status: "ready", updatedAt: `${date}T00:00:00Z`, rankings: [1, 2, 3, 4].map(rank => ({ id: `${date}-${rank}`, rank })) });

function harness() {
  let time = Date.parse("2026-10-20T23:58:00+08:00");
  let cache = null;
  let expiry = 0;
  let tick;
  let next = feed("2026-10-20");
  let loader;
  let calls = 0;
  let errors = 0;
  let cleared = false;
  const received = [];
  const focus = new Map();
  const visibility = new Map();
  const clock = {
    setInterval(fn, ms) { assert.equal(ms, 60_000); tick = fn; return 1; },
    clearInterval(id) { assert.equal(id, 1); cleared = true; },
    addEventListener(name, fn) { focus.set(name, fn); },
    removeEventListener(name, fn) { if (focus.get(name) === fn) focus.delete(name); },
  };
  const page = {
    visibilityState: "visible",
    addEventListener(name, fn) { visibility.set(name, fn); },
    removeEventListener(name, fn) { if (visibility.get(name) === fn) visibility.delete(name); },
  };
  return {
    start: () => watchHotFeed({ clock, page, now: () => time,
      read: () => time < expiry ? cache : null,
      load: async () => { calls++; const value = loader ? await loader() : next; cache = value; expiry = time + 300_000; return value; },
      onFeed: value => received.push(value), onError: () => errors++,
    }),
    async advance(ms) { time += ms; tick(); await settle(); },
    async visible(value) { page.visibilityState = value ? "visible" : "hidden"; visibility.get("visibilitychange")?.(); await settle(); },
    async focus() { focus.get("focus")?.(); await settle(); },
    setNext(value) { next = value; },
    setLoader(fn) { loader = fn; },
    setCache(value) { cache = value; expiry = time + 300_000; },
    get calls() { return calls; }, get errors() { return errors; }, get received() { return received; },
    get cleaned() { return cleared && focus.size === 0 && visibility.size === 0; },
  };
}

test("an open homepage automatically adopts the next daily ranking when the shared cache expires", async () => {
  const h = harness(); const stop = h.start(); await settle();
  assert.equal(h.calls, 1);
  h.setNext(feed("2026-10-21"));
  for (let minute = 1; minute < 5; minute++) await h.advance(HOT_FEED_CHECK_MS);
  assert.equal(h.calls, 1, "checking cached data does not make an API request");
  assert.equal(h.received.at(-1).updatedAt, "2026-10-20T00:00:00Z");
  await h.advance(HOT_FEED_CHECK_MS);
  assert.equal(h.calls, 2);
  assert.deepEqual(h.received.at(-1).rankings.slice(0, 3).map(item => item.id), ["2026-10-21-1", "2026-10-21-2", "2026-10-21-3"]);
  stop();
});

test("another ranking view updating the cache synchronizes homepage rows without a new request", async () => {
  const h = harness(); const stop = h.start(); await settle();
  h.setCache(feed("2026-10-21"));
  await h.advance(HOT_FEED_CHECK_MS);
  assert.equal(h.calls, 1);
  assert.equal(h.received.at(-1).updatedAt, "2026-10-21T00:00:00Z");
  stop();
});

test("background pages pause requests and resume on visibility or focus", async () => {
  const h = harness(); const stop = h.start(); await settle();
  await h.visible(false); h.setNext(feed("2026-10-21"));
  await h.advance(86_400_000); await h.focus();
  assert.equal(h.calls, 1);
  await h.visible(true);
  assert.equal(h.calls, 2);
  assert.equal(h.received.at(-1).updatedAt, "2026-10-21T00:00:00Z");
  await h.advance(300_000);
  h.setCache(feed("2026-10-22")); await h.focus();
  assert.equal(h.received.at(-1).updatedAt, "2026-10-22T00:00:00Z");
  stop();
});

test("errors retain the last feed, throttle repeated focus and retry on the next minute", async () => {
  const h = harness(); const stop = h.start(); await settle();
  h.setLoader(async () => { throw new Error("offline"); });
  await h.advance(300_000);
  assert.equal(h.errors, 1);
  const last = h.received.at(-1);
  await h.focus(); await h.focus();
  assert.equal(h.calls, 2);
  assert.equal(h.received.at(-1), last);
  h.setLoader(null); h.setNext(feed("2026-10-21"));
  await h.advance(HOT_FEED_CHECK_MS);
  assert.equal(h.calls, 3);
  assert.equal(h.received.at(-1).updatedAt, "2026-10-21T00:00:00Z");
  stop();
});

test("cleanup prevents a late request or removed timer from updating an unmounted card", async () => {
  const h = harness(); let finish;
  h.setLoader(() => new Promise(resolve => { finish = resolve; }));
  const stop = h.start(); await settle();
  await h.focus(); assert.equal(h.calls, 1, "focus cannot duplicate an in-flight read");
  stop(); assert.equal(h.cleaned, true);
  finish(feed("2026-10-21")); await settle(); await h.advance(300_000);
  assert.equal(h.received.length, 0); assert.equal(h.calls, 1);
});

test("malformed responses never replace the last accepted ranking", async () => {
  const h = harness(); const stop = h.start(); await settle();
  h.setLoader(async () => ({ status: "ready", rankings: null }));
  await h.advance(300_000);
  assert.equal(h.errors, 1);
  assert.equal(h.received.at(-1).updatedAt, "2026-10-20T00:00:00Z");
  stop();
});
