import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const result = await build({
  entryPoints: [new URL("../app/hot-list.tsx", import.meta.url).pathname],
  bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic",
  external: ["react", "react/jsx-runtime"],
});
const mod = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
const renderStories = (rankings) => renderToStaticMarkup(createElement(mod.exports.HotRankedStories, { rankings }));
const sourceUrl = "https://example.com/yalla/voice-invitations";
const story = (overrides = {}) => ({
  id: "yalla-invitations", rank: 1, topic: "Yalla", title: "Yalla introduces guest invitations for voice rooms",
  titleZh: "旧版中文标题", publishedAt: "2026-10-19T00:30:00Z", sourceCount: 1, verification: "single-source",
  sources: [{ name: "Yalla Group", url: sourceUrl, kind: "official", publishedAt: "2026-10-19T00:30:00Z" }],
  ...overrides,
});

test("reviewed article details render facts, analysis, original evidence and provenance", () => {
  const html = renderStories([story({ detail: {
    status: "ready", titleZh: "Yalla 推出语音房访客邀请", market: "中东市场",
    change: "访客获得邀请后，可以通过浏览器加入语音房。",
    whyItMatters: "值得观察访客邀请是否能降低入房门槛，实际转化仍需验证。",
    evidenceQuote: "Guests can join the voice room from their browser.", sourceUrl,
  } })]);
  assert.match(html, /<h3 lang="zh-CN"><a[^>]*>Yalla 推出语音房访客邀请<\/a><\/h3>/);
  assert.doesNotMatch(html, /旧版中文标题/);
  assert.match(html, /<dt>具体变化<\/dt><dd>访客获得邀请后，可以通过浏览器加入语音房。<\/dd>/);
  assert.match(html, /<dt>关注理由<\/dt><dd>值得观察访客邀请是否能降低入房门槛，实际转化仍需验证。<\/dd>/);
  assert.match(html, /<details[^>]*><summary>原文与依据<\/summary>/);
  assert.match(html, /<p class="hot-story-original" lang="en">Yalla introduces guest invitations for voice rooms<\/p>/);
  assert.match(html, /<blockquote>Guests can join the voice room from their browser\.<\/blockquote>/);
  assert.match(html, /中东市场/);
  assert.match(html, /1 个发布者/);
  assert.match(html, /href="https:\/\/example\.com\/yalla\/voice-invitations"/);
  assert.match(html, /<time[^>]*dateTime="2026-10-19T00:30:00Z"[^>]*>发布于 10\/19 08:30<\/time>/);
  assert.doesNotMatch(html, /独立来源|正文暂未完成核验|沿用已核验摘要/);
});

test("unavailable, rejected and incomplete details cannot manufacture a change or attention claim", () => {
  for (const detail of [
    undefined,
    { status: "unavailable", change: "不能展示的变化", whyItMatters: "不能展示的关注理由", reason: "Private extraction failure" },
    { status: "rejected", change: "不能展示的变化", whyItMatters: "不能展示的关注理由", reason: "Private review failure" },
    { status: "ready", change: "", whyItMatters: "不能展示的关注理由" },
  ]) {
    const html = renderStories([story({ detail })]);
    assert.match(html, /正文暂未完成核验，先查看原文/);
    assert.doesNotMatch(html, /<dt>具体变化|<dt>关注理由|不能展示的|Private/);
    assert.match(html, /旧版中文标题/);
  }
});

test("retained summaries disclose the last verification time without leaking a machine reason", () => {
  const html = renderStories([story({ detail: {
    status: "ready", titleZh: "语音房访客邀请功能已获核验", change: "访客获得邀请后，可以通过浏览器加入语音房。",
    whyItMatters: "可关注访客邀请对入房门槛的影响，实际效果仍需验证。",
    retained: true, verifiedAt: "2026-10-18T01:20:00.000Z", reason: "Private transport failure",
  } })]);
  assert.match(html, /沿用已核验摘要 · 核验于 <time dateTime="2026-10-18T01:20:00\.000Z">10\/18 09:20<\/time>/);
  assert.doesNotMatch(html, /Private transport failure/);
});

test("product context is accessible but adds no visible row without a real market or historical label", () => {
  const recent = renderStories([story()]);
  assert.match(recent, /aria-label="Yalla 资讯"/);
  assert.doesNotMatch(recent, /class="hot-story-context"/);
  const historical = renderStories([story({ backfillWindowDays: 30 })]);
  assert.match(historical, /class="hot-story-context"><span class="hot-backfill-label">持续观察 · 近 30 日<\/span>/);
  assert.doesNotMatch(historical, /<span>Yalla<\/span>/);
});

test("recent stories and historical observation remain separate within one ten-story ranking", () => {
  const items = Array.from({ length: 12 }, (_, index) => story({
    id: `story-${index + 1}`, rank: index + 1,
    backfillWindowDays: index > 1 ? 30 : null,
  }));
  const html = renderStories(items);
  assert.equal((html.match(/<article /g) || []).length, 10);
  assert.match(html, /id="hot-group-recent">近期事件<span>2<\/span>/);
  assert.match(html, /id="hot-group-watch">持续观察<span>8<\/span>/);
  assert.match(html, /data-rank="10"/);
  assert.doesNotMatch(html, /data-rank="11"|data-rank="12"/);
  assert.match(html, /持续观察 · 近 30 日/);
});

test("article excerpts remain escaped text and are not injected as HTML", () => {
  const html = renderStories([story({ detail: {
    status: "ready", titleZh: "带有正文依据的产品变化", change: "新增访客邀请。", whyItMatters: "可观察入房转化。",
    evidenceQuote: '<img src=x onerror="alert(1)">',
  } })]);
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
});

test("cached English headlines use reviewed Chinese copy without upgrading rejected body verification", () => {
  const title = "TikTok, Vertical Studio Made By Us Studios™ Partner to Produce Creator-Led Micro-Series";
  const html = renderStories([story({ title, titleZh: null, topic: "TikTok", detail: { status: "rejected", titleZh: "不能展示的未通过标题" } })]);
  assert.match(html, /<h3 lang="zh-CN"><a[^>]*>TikTok 与竖屏制作公司 Made By Us Studios 合作，计划制作创作者主导的微短剧<\/a><\/h3>/);
  assert.match(html, /<p class="hot-story-original" lang="en">TikTok, Vertical Studio Made By Us Studios™ Partner to Produce Creator-Led Micro-Series<\/p>/);
  assert.match(html, /正文暂未完成核验，先查看原文/);
  assert.doesNotMatch(html, /不能展示的未通过标题|<dt>具体变化/);
});

test("English or blank values in Chinese fields cannot mask an available Chinese title", () => {
  for (const detailTitle of ["English title in the wrong field", "   "]) {
    const html = renderStories([story({ detail: { status: "ready", titleZh: detailTitle } })]);
    assert.match(html, /<h3 lang="zh-CN"><a[^>]*>旧版中文标题<\/a><\/h3>/);
  }
  const html = renderStories([story({ title: "WhatsApp users may soon be able to schedule messages", titleZh: "An English cached value" })]);
  assert.match(html, /<h3 lang="zh-CN"><a[^>]*>WhatsApp 用户或将很快可以定时发送消息<\/a><\/h3>/);
});

test("unknown English headlines remain exact and Chinese originals are not duplicated", () => {
  const english = "Yalla introduces a completely new unreviewed feature";
  const html = renderStories([story({ title: english, titleZh: null })]);
  assert.match(html, new RegExp(`<h3 lang="en"><a[^>]*>${english}</a></h3>`));
  assert.doesNotMatch(html, /hot-story-original/);
  const chinese = renderStories([story({ title: "Yalla 测试语音房访客邀请", titleZh: null })]);
  assert.match(chinese, /<h3 lang="zh-CN">/);
  assert.doesNotMatch(chinese, /hot-story-original/);
});
