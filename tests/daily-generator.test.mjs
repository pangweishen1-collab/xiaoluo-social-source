import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  allowedOriginalUrl,
  beijingReportDate,
  extractArticleEvidence,
  isSubstantiveSocialStory,
  withinDays,
} from "../worker/daily-automation/source.mjs";
import { runDailyGeneration } from "../worker/daily-automation/generator.mjs";

const NOW = new Date("2026-10-14T03:00:00.000Z");
const ARTICLE_URL = "https://www.bigo.tv/news-events/bigo-news/voice-room-gifting";
const SOURCE_NAME = "BIGO LIVE 官方新闻";
const QUOTE = "BIGO LIVE introduced new voice chat rooms and a gift collection tool for hosts and listeners.";
const ARTICLE_TEXT = `${QUOTE} The feature is available to listeners in selected markets and allows hosts to manage gifts during live rooms. The company says that the new room controls are already available in its application. The release specifies the product, rollout and audience without asking readers to infer a broader trend.`;
const ARTICLE_HTML = `<!doctype html><html><head><meta property="og:title" content="BIGO LIVE introduces voice rooms and gift collection"/><meta property="article:published_time" content="2026-10-13T22:00:00Z"/></head><body><article><h1>BIGO LIVE introduces voice rooms and gift collection</h1><p>${ARTICLE_TEXT}</p></article></body></html>`;
const STORY = {
  rank: 1,
  id: "story-123",
  title: "BIGO LIVE introduces voice chat rooms with gift collection tools",
  topic: "BIGO LIVE",
  publishedAt: "2026-10-13T22:00:00.000Z",
  sources: [{ name: SOURCE_NAME, url: ARTICLE_URL, kind: "official", publishedAt: "2026-10-13T22:00:00.000Z" }],
};

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function fixture({ hot = { status: "ready", updatedAt: NOW.toISOString(), rankings: [STORY] }, article = ARTICLE_HTML, aiResult = { eligible: true, titleZh: "BIGO LIVE 推出语聊房及礼物收集工具", summaryZh: "BIGO LIVE 为主播和听众推出语聊房与礼物收集工具。", quote: QUOTE } } = {}) {
  const calls = { urls: [], ai: 0, review: [] };
  const fetcher = async (url) => {
    calls.urls.push(String(url));
    if (String(url) === "https://xiaoluo-social.pages.dev/api/hot-list") return jsonResponse(hot);
    if (String(url) === ARTICLE_URL) return new Response(article, { headers: { "content-type": "text/html; charset=utf-8" } });
    throw new Error(`Unexpected fetch ${url}`);
  };
  const env = {
    AI: { async run(_model, request) { calls.ai += 1; assert.equal(request.temperature, 0); assert.equal(request.response_format.type, "json_schema"); return { response: aiResult }; } },
    REVIEWER: { async fetch(request) {
      const envelope = await request.json();
      calls.review.push(envelope);
      return envelope.candidates.length
        ? jsonResponse({ status: "verified", publisher: { status: "published" } })
        : jsonResponse({ status: "rejected", reason: envelope.failure, publisher: { status: "rejected" } });
    } },
  };
  return { calls, fetcher, env };
}

test("Beijing schedule date and six-day original-publication window", () => {
  assert.equal(beijingReportDate(new Date("2026-10-13T16:10:00Z")), "2026-10-14");
  assert.equal(withinDays("2026-10-08T15:06:17Z", "2026-10-14"), true);
  assert.equal(withinDays("2026-10-07T15:06:17Z", "2026-10-14"), false);
  assert.equal(withinDays("2026-10-15T01:00:00Z", "2026-10-14"), false);
});

test("story prefilter rejects generic AI search and empty update, keeps social product events", () => {
  assert.equal(isSubstantiveSocialStory({ title: "YouTube rolls out AI search chatbot to all US users", topic: "YouTube" }), false);
  assert.equal(isSubstantiveSocialStory({ title: "Discord Update: September 25, 2026", topic: "Discord" }), false);
  assert.equal(isSubstantiveSocialStory({ title: "Remember Orkut? Its founder wants to bring it back", topic: "Orkut" }), false);
  assert.equal(isSubstantiveSocialStory({ title: "New York alleges TikTok gave teens a placebo safety feature", topic: "TikTok" }), false);
  assert.equal(isSubstantiveSocialStory({ title: "Meta will charge for Instagram AI after daily caps, putting production cost on creators for first time", topic: "Instagram" }), false);
  assert.equal(isSubstantiveSocialStory(STORY), true);
});

test("daily prefilter shares only the four reviewed social-product headlines with the hot list", () => {
  for (const [title, topic] of [
    ["Now You Can Invite Anyone to a WhatsApp Call", "WhatsApp"],
    ["WhatsApp provides chat guest links for non-users", "WhatsApp"],
    ["Your Algorithm, Your Words: New Ways to Shape What You See on Facebook", "Facebook"],
    ["Facebook is giving users more control over their algorithm", "Facebook"],
  ]) assert.equal(isSubstantiveSocialStory({ title, topic }), true, title);

  // Topic identity and the exact publisher headline both matter. Generic
  // announcements cannot inherit a reviewed event's approval by similarity.
  assert.equal(isSubstantiveSocialStory({ title: "Now You Can Invite Anyone to a WhatsApp Call", topic: "Facebook" }), false);
  assert.equal(isSubstantiveSocialStory({ title: "WhatsApp provides new features", topic: "WhatsApp" }), false);
  assert.equal(isSubstantiveSocialStory({ title: "Facebook is giving users more control over their algorithm — AI search assistant", topic: "Facebook" }), false);
  assert.equal(isSubstantiveSocialStory({ title: "Discord Update: September 25, 2026", topic: "Discord" }), false);
});

test("original URLs are HTTPS and restricted to the named publisher", () => {
  assert.equal(allowedOriginalUrl("https://www.bigo.tv/news-events/a?utm_source=test&id=42", SOURCE_NAME), "https://www.bigo.tv/news-events/a?id=42");
  assert.equal(allowedOriginalUrl("https://127.0.0.1/private", SOURCE_NAME), null);
  assert.equal(allowedOriginalUrl("http://www.bigo.tv/news-events/a", SOURCE_NAME), null);
  assert.equal(allowedOriginalUrl("https://www.bigo.tv.evil.example/news", SOURCE_NAME), null);
  assert.equal(allowedOriginalUrl("https://user:pass@www.bigo.tv/news", SOURCE_NAME), null);
});

test("article evidence uses original-page publication metadata and substantive body", () => {
  assert.deepEqual(extractArticleEvidence(ARTICLE_HTML), {
    title: "BIGO LIVE introduces voice rooms and gift collection",
    publishedAt: "2026-10-13T22:00:00.000Z",
    text: `BIGO LIVE introduces voice rooms and gift collection ${ARTICLE_TEXT}`,
  });
  assert.equal(extractArticleEvidence(ARTICLE_HTML.replace(/<meta property="article:published_time"[^>]*>/, "")), null);
});

test("generator submits at most evidenced candidates to independent reviewer", async () => {
  const { calls, fetcher, env } = fixture();
  const result = await runDailyGeneration(env, { fetcher, now: NOW });
  assert.equal(result.reportDate, "2026-10-14");
  assert.equal(result.candidateCount, 1);
  assert.equal(calls.ai, 1);
  assert.equal(calls.review.length, 1);
  assert.equal(calls.review[0].candidates[0].sourcePublishedAt, "2026-10-13T22:00:00.000Z");
  assert.equal(calls.review[0].candidates[0].quote, QUOTE);
  assert.match(calls.review[0].candidates[0].eventKey, /^social-[0-9a-f]{24}$/);
  assert.equal(calls.review[0].candidates[0].sourceUrl, ARTICLE_URL);
});

test("unavailable hot list still produces a rejected-review envelope", async () => {
  const { calls, env } = fixture();
  const result = await runDailyGeneration(env, { now: NOW, fetcher: async () => jsonResponse({ status: "unavailable", updatedAt: NOW.toISOString(), rankings: [] }) });
  assert.equal(result.candidateCount, 0);
  assert.equal(result.review.status, "rejected");
  assert.equal(calls.review.length, 1);
  assert.equal(calls.review[0].failure, "hot_list_unavailable");
  assert.deepEqual(calls.review[0].candidates, []);
});

test("reviewer transport success without persisted publication or rejection is not accepted", async () => {
  const { fetcher, env } = fixture();
  env.REVIEWER.fetch = async () => jsonResponse({ status: "verified", publisher: { status: "rejected" } });
  await assert.rejects(() => runDailyGeneration(env, { fetcher, now: NOW }), /persisted outcome/u);
});

test("inaccessible or undated original cannot become a factual candidate", async () => {
  const { calls, fetcher, env } = fixture({ article: ARTICLE_HTML.replace(/<meta property="article:published_time"[^>]*>/, "") });
  const result = await runDailyGeneration(env, { fetcher, now: NOW });
  assert.equal(result.candidateCount, 0);
  assert.equal(calls.ai, 0);
  assert.equal(calls.review[0].failure, "original_source_or_ai_unavailable");
});

test("feed freshness cannot override an old date on the original article", async () => {
  const { calls, fetcher, env } = fixture({ article: ARTICLE_HTML.replace("2026-10-13T22:00:00Z", "2026-09-28T22:00:00Z") });
  const result = await runDailyGeneration(env, { fetcher, now: NOW });
  assert.equal(result.candidateCount, 0);
  assert.equal(calls.ai, 0);
  assert.equal(calls.review[0].failure, "original_source_or_ai_unavailable");
});

test("article redirects outside the publisher are not fetched", async () => {
  const { calls, env } = fixture();
  const fetcher = async (url) => String(url).endsWith("/api/hot-list")
    ? jsonResponse({ status: "ready", updatedAt: NOW.toISOString(), rankings: [STORY] })
    : new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } });
  const result = await runDailyGeneration(env, { fetcher, now: NOW });
  assert.equal(result.candidateCount, 0);
  assert.equal(calls.ai, 0);
  assert.equal(calls.review[0].failure, "original_source_or_ai_unavailable");
});

test("AI output without an exact original quote is not forwarded as verified evidence", async () => {
  const { calls, fetcher, env } = fixture({ aiResult: { eligible: true, titleZh: "BIGO LIVE 上线全新聊天功能", summaryZh: "文章称该功能现已对全球用户上线。", quote: "This fabricated quotation is not present in the original article body." } });
  const result = await runDailyGeneration(env, { fetcher, now: NOW });
  assert.equal(result.candidateCount, 0);
  assert.deepEqual(calls.review[0].candidates, []);
});

test("generator Wrangler config contains only scheduler, AI and reviewer bindings", async () => {
  const config = JSON.parse(await readFile(new URL("../wrangler.daily-generator.json", import.meta.url), "utf8"));
  assert.deepEqual(config.triggers.crons, ["0 3 * * *"]);
  assert.equal(config.workers_dev, false);
  assert.equal(config.ai.binding, "AI");
  assert.deepEqual(config.services, [{ binding: "REVIEWER", service: "xiaoluo-daily-reviewer" }]);
  assert.equal(config.d1_databases, undefined);
});
