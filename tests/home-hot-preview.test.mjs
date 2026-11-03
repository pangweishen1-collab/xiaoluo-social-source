import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const result = await build({
  entryPoints: [new URL("../app/home-hot-preview.tsx", import.meta.url).pathname],
  bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic",
  external: ["react", "react/jsx-runtime"],
});
const mod = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
const render = rankings => renderToStaticMarkup(createElement(mod.exports.HomeHotStories, { rankings }));
const hotBundle = await build({
  entryPoints: [new URL("../app/hot-list.tsx", import.meta.url).pathname],
  bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic",
  external: ["react", "react/jsx-runtime"],
});
const fullRanking = { exports: {} };
new Function("require", "module", "exports", hotBundle.outputFiles[0].text)(createRequire(import.meta.url), fullRanking, fullRanking.exports);
const story = (index, extra = {}) => ({
  id: `story-${index}`, rank: index, title: `Original title ${index}`, titleZh: `已核实的中文标题 ${index}`,
  publishedAt: "2026-10-19T23:30:00Z", topic: "Yalla", sourceCount: 1,
  sources: [{ name: "Yalla Group", url: `https://example.com/${index}`, publishedAt: "2026-10-19T23:30:00Z", kind: "official" }], ...extra,
});

test("homepage displays exactly the first three published rankings with Chinese headlines and original links", () => {
  const html = render([1, 2, 3, 4].map(index => story(index)));
  assert.equal((html.match(/<li>/g) || []).length, 3);
  assert.match(html, /aria-label="热点榜前三名"/);
  assert.match(html, /aria-label="第 1 名 · 金杯"/);
  assert.match(html, /aria-label="第 3 名 · 铜杯"/);
  assert.doesNotMatch(html, /中文标题 4|Original title/);
  assert.match(html, /href="https:\/\/example.com\/1" target="_blank" rel="noopener noreferrer" lang="zh-CN"/);
  assert.match(html, /Yalla Group/);
  assert.match(html, /dateTime="2026-10-19T23:30:00Z">10\/20<\/time>/, "dates are Beijing time rather than UTC");
});

test("top-three ranks use distinct gold, silver and bronze vector trophies with readable numbers", () => {
  const html = render([1, 2, 3].map(index => story(index)));
  for (const [rank, metal, label] of [[1, "gold", "金杯"], [2, "silver", "银杯"], [3, "bronze", "铜杯"]]) {
    assert.match(html, new RegExp(`class="home-hot-rank is-${metal}" role="img" aria-label="第 ${rank} 名 · ${label}"`));
    assert.match(html, new RegExp(`class="home-hot-trophy-number">${rank}</text>`));
  }
  assert.equal((html.match(/class="home-hot-trophy"/g) || []).length, 3);
  assert.equal((html.match(/aria-hidden="true" focusable="false"/g) || []).length, 3);
  const gradientIds = [...html.matchAll(/<linearGradient id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(gradientIds).size, 3, "each trophy has a unique paint ID");
  assert.doesNotMatch(html, /<img|🏆/);
});

test("a short ranking is not padded and historical entries retain their context", () => {
  const html = render([story(1, { backfillWindowDays: 30 })]);
  assert.equal((html.match(/<li>/g) || []).length, 1);
  assert.match(html, /持续观察/);
  assert.doesNotMatch(html, /第 2 名|等待今日更新/);
  assert.equal((render([]).match(/<li>/g) || []).length, 0);
});

test("Reddit cached English headlines display the same reviewed Chinese title on home and full ranking", () => {
  const original = "Reddit's Developer Platform adds wiki access, closing the last gap forcing moderation bots to stay on the old API";
  const chinese = "Reddit 开发者平台新增 Wiki 访问功能，补齐版主管理机器人迁移至新 API 的最后一项缺口";
  for (const extra of [
    { titleZh: null },
    { titleZh: original, detail: { status: "ready", titleZh: original } },
    { titleZh: " ", detail: { status: "rejected", titleZh: "不能使用的未核验标题" } },
  ]) {
    const entry = story(1, { title: original, topic: "Reddit", ...extra });
    const home = render([entry]);
    const full = renderToStaticMarkup(createElement(fullRanking.exports.HotRankedStories, { rankings: [entry] }));
    assert.match(home, new RegExp(`lang="zh-CN">${chinese}</a>`));
    assert.match(full, new RegExp(`<h3 lang="zh-CN"><a[^>]*>${chinese}</a></h3>`));
    assert.match(full, /class="hot-story-original" lang="en">Reddit&#x27;s Developer Platform/);
    assert.doesNotMatch(home, /Reddit&#x27;s Developer Platform|不能使用的未核验标题/);
    assert.doesNotMatch(full, /不能使用的未核验标题/);
  }
});

test("verified detail titles and primary links match the full hot list, while missing links fall back to the ranking page", () => {
  const html = render([
    story(1, { detail: { status: "ready", titleZh: "正文核验后的中文标题", sourceUrl: "https://example.com/verified" } }),
    story(2, { sources: [], publishedAt: "unknown" }),
  ]);
  assert.match(html, /href="https:\/\/example.com\/verified"[^>]*>正文核验后的中文标题/);
  assert.match(html, /href="\/\?view=hot" lang="zh-CN"/);
  assert.match(html, /时间待核实/);
  assert.doesNotMatch(html, /undefined|Invalid Date/);
});

test("headlines are escaped and the preview exposes a real complete-ranking link", () => {
  const html = render([story(1, { titleZh: '<img src=x onerror="alert(1)">中文' })]);
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /&lt;img/);
  const card = renderToStaticMarkup(createElement(mod.exports.default));
  assert.match(card, /href="\/\?view=hot">查看榜单/);
  assert.match(card, /role="status">正在加载热点/);
});

test("browser cache does not change the first hydration render compared with SSR", async () => {
  const { loadPublicData, invalidatePublicData } = await import("../app/public-data-cache.mjs");
  const path = "/api/hot-list?method=9";
  const cached = { status: "ready", rankings: [story(1)] };
  await loadPublicData(path, { fetcher: async () => ({ ok: true, json: async () => cached }) });
  const originalStorage = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem: key => key.endsWith(path) ? JSON.stringify({ at: Date.now(), data: cached }) : null };
  try {
    const card = renderToStaticMarkup(createElement(mod.exports.default));
    assert.match(card, /role="status">正在加载热点/);
    assert.doesNotMatch(card, /class="home-hot-list"/);
  } finally {
    if (originalStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = originalStorage;
    invalidatePublicData(path);
  }
});
