import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { buildHotList, HOT_FEEDS, parseBigoNewsHtml, parseNewbornDisclosuresJson, parseNewbornNewsJson, parseRssFeed, RANKING_WINDOW_MS, RANKING_BACKFILL_WINDOW_MS, RANKING_ARCHIVE_WINDOW_MS } from "../shared/hot-list.mjs";
import { reviewedTitleZh } from "../shared/hot-translations.mjs";

const NOW = Date.parse("2026-10-12T08:00:00Z");
const published = (hoursAgo) => new Date(NOW - hoursAgo * 60 * 60 * 1000).toUTCString();
const article = (sourceId, title, path, hoursAgo = 1) => {
  const source = HOT_FEEDS.find((feed) => feed.id === sourceId);
  return { sourceId, title, url: `https://${source.hosts[0]}/${path}`, publishedAt: published(hoursAgo) };
};
const rss = (items = []) => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Test feed</title>${items.map((item) => `<item><title>${item.title.replaceAll("&", "&amp;")}</title><link>${item.url.replaceAll("&", "&amp;")}</link><pubDate>${item.publishedAt}</pubDate></item>`).join("")}</channel></rss>`;
const sourceResponse = (source, items = []) => {
  if (source.format === "apple-lookup") return Response.json({ resultCount: 0, results: [] });
  if (source.format === "globe-company-html") return new Response('<div class="recentNewsH"><li class="row"><div class="date-source"><span>August 25, 2025 19:00 ET</span><span>Source: <a class="sourceLink">JOYY Inc.</a></span></div><div class="mainLink"><a href="/news-release/2025/08/25/3000000/23553/en/joyy-reports-old-financial-results.html">JOYY Reports Old Financial Results</a></div></li></div>');
  if (source.format === "bigo-html") return new Response('<div class="blog-item"><a href="/news-events/old-story" class="title">BIGO LIVE launches an old feature</a><div class="time">2025-01-01</div></div>');
  if (source.format === "newborn-json") return new Response(JSON.stringify({ code: 0, data: { list: { website_hk_news: [] } } }));
  if (source.format === "newborn-news-json") return new Response(JSON.stringify({ code: 0, data: { list: [] } }));
  return new Response(rss(items));
};

function memoryEdgeCache() {
  const entries = new Map();
  const key = (request) => typeof request === "string" ? request : request.url;
  return {
    entries,
    async match(request) { return entries.get(key(request))?.clone(); },
    async put(request, response) { entries.set(key(request), response.clone()); },
  };
}

function memorySnapshotDb() {
  let row = null;
  return {
    get row() { return row; },
    setRow(value) { row = value; },
    prepare(sql) {
      if (sql.startsWith("SELECT")) return { async first() { return row; } };
      if (sql.startsWith("INSERT")) return {
        bind(updatedAt, payloadJson) {
          return {
            async run() {
              if (row && row.updated_at >= updatedAt) return { meta: { changes: 0 } };
              row = { updated_at: updatedAt, payload_json: payloadJson };
              return { meta: { changes: 1 } };
            },
          };
        },
      };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

test("RSS ingestion reads metadata only and rejects malformed XML", () => {
  const xml = rss([{ title: "Facebook & Messenger launches a feature", url: "https://about.fb.com/news/test", publishedAt: published(1) }]);
  assert.deepEqual(parseRssFeed(xml), [{ title: "Facebook & Messenger launches a feature", url: "https://about.fb.com/news/test", publishedAt: published(1) }]);
  assert.throws(() => parseRssFeed("<html>not an RSS feed</html>"), /RSS/);
  assert.throws(() => parseRssFeed("<rss><channel><item>"), /XML/);
});

test("BIGO official news and Newborn Town disclosures expose only dated, original metadata", () => {
  const html = '<div class="blog-item"><a text="BIGO LIVE &amp; friends" href="/news-events/voice-chat" class="title">BIGO LIVE &amp; friends launch voice rooms</a><div class="time">2026-10-12</div></div>';
  assert.deepEqual(parseBigoNewsHtml(html), [{ title: "BIGO LIVE & friends launch voice rooms", url: "https://www.bigo.tv/news-events/voice-chat", publishedAt: "2026-10-12" }]);
  assert.throws(() => parseBigoNewsHtml("<html>No news</html>"), /BIGO/);
  const disclosure = (title, file_name, release_time, file_url) => ({ title, file_name, release_time, file_url });
  const json = JSON.stringify({ code: 0, data: { list: { website_hk_news: [
    disclosure("Next Day Disclosure Returns - [Share Buyback]", "Next Day Disclosure Return", "2026-10-12", "https://www1.hkexnews.hk/buyback.pdf"),
    disclosure("Announcements and Notices - [Other - Trading Update / Inside Information]", "UNAUDITED OPERATING DATA AND REVENUE INFORMATION", "2026-10-11", "https://www1.hkexnews.hk/results.pdf"),
    disclosure("Financial Statements/ESG Information", "Environmental, Social and Governance Report", "2026-10-10", "https://www1.hkexnews.hk/esg.pdf"),
  ] } } });
  assert.deepEqual(parseNewbornDisclosuresJson(json), [{ title: "UNAUDITED OPERATING DATA AND REVENUE INFORMATION", url: "https://www1.hkexnews.hk/results.pdf", publishedAt: "2026-10-11", category: "Announcements and Notices - [Other - Trading Update / Inside Information]" }]);
  assert.throws(() => parseNewbornDisclosuresJson("{}"), /disclosures/);
});

test("Newborn Town news center uses article dates and original article URLs", () => {
  const json = JSON.stringify({ code: 0, data: { list: [
    { ID: 41, title: "赤子城科技旗下 YoHo 上线语聊新功能", day: "2026-10-11", content: "not used" },
    { ID: 3, title: "赤子城科技披露历史业绩", day: "2025-10-23", content: "not used" },
    { ID: "unsafe", title: "不可用链接", day: "2026-10-12" },
  ] } });
  assert.deepEqual(parseNewbornNewsJson(json), [
    { title: "赤子城科技旗下 YoHo 上线语聊新功能", url: "https://www.newborntown.com/news/41?lang=zh", publishedAt: "2026-10-11" },
    { title: "赤子城科技披露历史业绩", url: "https://www.newborntown.com/news/3?lang=zh", publishedAt: "2025-10-23" },
  ]);
  assert.throws(() => parseNewbornNewsJson("{}"), /news/);
});

test("two Newborn Town channels remain one independent publisher", () => {
  const title = "YoHo launches new voice chat rooms";
  const result = buildHotList([
    article("newborn-ir", title, "yoho-rooms.pdf", 3),
    article("newborn-news", title, "news/41?lang=zh", 4),
  ], new Date(NOW));
  assert.equal(result.rankings.length, 1);
  assert.equal(result.rankings[0].sourceCount, 1);
  assert.equal(result.rankings[0].verification, "single-source");
});

test("niche social products outrank generic news without accepting homonyms or stock-market noise", () => {
  const result = buildHotList([
    article("bigo-news", "BIGO LIVE brings new creator watch parties to MENA", "news-events/watch-parties", 2),
    article("techcrunch", "Instagram launches new creator profiles", "instagram-profiles", 2),
    article("techcrunch", "YoHo Group launches a grocery service", "yoho-grocery", 1),
    article("techcrunch", "YoHo Group launches a grocery app", "yoho-grocery-app", 1),
    article("engadget", "Yalla launches a food delivery app", "yalla-delivery", 1),
    article("engadget", "IMO launches a new tax tool", "imo-tax", 1),
    article("techcrunch", "BIGO LIVE featured across global app stores", "bigo-promotion", 1),
    article("yalla", "Yalla Group to announce third-quarter financial results", "results-preview", 1),
    { ...article("newborn-ir", "INTERIM RESULTS 2026", "results.pdf", 1), publishedAt: "2026-10-12", category: "Announcements and Notices - [Interim Results]" },
    { ...article("newborn-ir", "Next Day Disclosure Return", "buyback.pdf", 1), publishedAt: "2026-10-12", category: "Next Day Disclosure Returns - [Share Buyback]" },
  ], new Date(NOW));
  assert.deepEqual(result.rankings.map((item) => item.topic), ["BIGO LIVE", "Instagram"]);
});

test("generic platform coverage needs a current social-product event", () => {
  const result = buildHotList([
    article("techcrunch", "Instagram Reels speed launched 18 months ago", "instagram-retrospective", 1),
    article("techcrunch", "TikTok launches a travel booking service", "tiktok-travel", 1),
    article("techcrunch", "TikTok travel push turns creator discovery into booking revenue", "tiktok-booking", 1),
    article("techcrunch", "X expands its sports hub for baseball", "x-sports", 1),
    article("techcrunch", "Discord Halloween cosmetics campaign tests FOMO mechanics", "discord-campaign", 1),
    article("techcrunch", "Instagram launches creator chat controls", "instagram-chats", 2),
  ], new Date(NOW));
  assert.deepEqual(result.rankings.map((item) => item.title), ["Instagram launches creator chat controls"]);
});

test("TikTok LIVE and messaging product changes qualify, but static topic pages do not", () => {
  const result = buildHotList([
    article("techcrunch", "TikTok LIVE adds virtual gifts to multi-guest rooms", "tiktok-live-gifts", 2),
    article("social-media-today", "TikTok rolls out in-app direct messages", "tiktok-direct-messages", 3),
    article("techcrunch-tiktok", "TikTok comments are getting more interactive with voice comments, polls, and more", "tiktok-voice-comments", 4),
    article("techcrunch", "TikTok Safety Center", "tiktok-safety-center", 1),
    article("social-media-today", "TikTok moderation tools", "tiktok-moderation-tools", 1),
    article("techcrunch-tiktok", "TikTok rolls out an AI shopping assistant and one-click checkout", "tiktok-shopping", 1),
  ], new Date(NOW));
  assert.deepEqual(new Set(result.rankings.map((item) => item.title)), new Set([
    "TikTok LIVE adds virtual gifts to multi-guest rooms",
    "TikTok rolls out in-app direct messages",
    "TikTok comments are getting more interactive with voice comments, polls, and more",
  ]));
});

test("the TikTok-specific RSS feed stays media and does not double-count TechCrunch", () => {
  const dedicated = HOT_FEEDS.find((source) => source.id === "techcrunch-tiktok");
  const broad = HOT_FEEDS.find((source) => source.id === "techcrunch");
  assert.equal(dedicated?.url, "https://techcrunch.com/tag/tiktok/feed/");
  assert.equal(dedicated?.kind, "media");
  assert.equal(dedicated?.owner, broad?.owner);
  const title = "TikTok LIVE adds virtual gifts to multi-guest rooms";
  const result = buildHotList([
    article("techcrunch-tiktok", title, "tiktok-live-gifts", 2),
    article("techcrunch", title, "broader-techcrunch-coverage", 3),
    article("social-media-today", title, "news/tiktok-live-gifts", 4),
    article("techcrunch-tiktok", "TikTok Safety Center", "tiktok-safety-center", 1),
    article("techcrunch-tiktok", "TikTok LIVE Spotlights Creators at Community Fest Event", "tiktok-live-community-fest", 1),
    article("techcrunch-tiktok", "TikTok launches a travel booking service", "tiktok-travel-booking", 1),
  ], new Date(NOW));
  assert.deepEqual(result.rankings.map((item) => item.title), [title]);
  assert.equal(result.rankings[0].sourceCount, 2, "two TechCrunch feeds are still one publisher");
  assert.equal(result.rankings[0].verification, "multi-source");
  assert.equal(result.rankings[0].sources.filter((source) => source.name === dedicated.name || source.name === broad.name).length, 1);
});

test("specific chat and live product events rank ahead of generic platform policy at comparable times", () => {
  const result = buildHotList([
    article("techcrunch", "TikTok LIVE adds virtual gifts to multi-guest rooms", "tiktok-live-gifts", 2),
    article("techcrunch", "TikTok rolls out in-app direct messages", "tiktok-direct-messages", 2),
    article("techcrunch", "Facebook changes teen privacy policy", "facebook-privacy-policy", 2),
  ], new Date(NOW));
  const titles = result.rankings.map((item) => item.title);
  assert.equal(titles.length, 3);
  assert(titles.indexOf("TikTok LIVE adds virtual gifts to multi-guest rooms") < titles.indexOf("Facebook changes teen privacy policy"));
  assert(titles.indexOf("TikTok rolls out in-app direct messages") < titles.indexOf("Facebook changes teen privacy policy"));
});

test("date-only update headings and vague feature announcements do not fill the ranking", () => {
  const result = buildHotList([
    article("discord", "Discord Patch Notes: October 6, 2026", "blog/discord-patch-notes-october-6", 2),
    article("discord", "Discord Update: September 25, 2026", "blog/discord-update-september-25", 3),
    article("discord", "Discord Update: August 11, 2026 Changelog", "blog/discord-august-changelog", 3),
    article("discord", "Discord Update", "blog/discord-update", 4),
    article("newborn-news", "YoHo 更新：2026 年 10 月 12 日", "news/yoho-update?lang=zh", 5),
    article("newborn-news", "YoHo 上线新功能", "news/yoho-new-feature?lang=zh", 6),
    article("newborn-news", "YoHo launches new features", "news/yoho-new-features?lang=zh", 7),
    article("discord", "Adding the Discord Updates YOU Want to See", "blog/updates-you-want", 7),
    article("discord", "Discord Update: Everything You Need to Know", "blog/everything-to-know", 7),
    article("discord", "Discord Update: New voice room controls", "blog/voice-room-controls", 8),
    article("newborn-news", "YoHo 上线语聊新功能", "news/yoho-voice-chat?lang=zh", 9),
    article("techcrunch", "Facebook launches group chat controls — Update: October 6, 2026", "facebook-group-chat-controls", 10),
  ], new Date(NOW));
  assert.deepEqual(result.rankings.map((item) => item.title).sort(), [
    "Discord Update: New voice room controls",
    "Facebook launches group chat controls — Update: October 6, 2026",
    "YoHo 上线语聊新功能",
  ].sort());
  assert.equal(result.rankings.length, 3, "the list must not pad with content-free updates");
});

test("a listed company report needs an actual result, not just a report period", () => {
  const category = "Announcements and Notices - [Interim Results]";
  const result = buildHotList([
    { ...article("newborn-ir", "INTERIM RESULTS 2026", "interim-results.pdf", 2), category },
    { ...article("newborn-ir", "ANNOUNCEMENT OF INTERIM RESULTS FORTHE SIX MONTHS ENDED 30 JUNE 2026", "announcement.pdf", 3), category },
    article("yalla", "Yalla Group Announces Second Quarter 2026 Financial Results", "q2-announcement", 4),
    { ...article("newborn-ir", "INTERIM RESULTS 2026: REVENUE RISES 20%", "revenue-results.pdf", 5), category },
    article("yalla", "Yalla Group revenue rises 15% in 2026 interim results", "q2-growth", 6),
  ], new Date(NOW));
  assert.deepEqual(result.rankings.map((item) => item.title).sort(), [
    "INTERIM RESULTS 2026: REVENUE RISES 20%",
    "Yalla Group revenue rises 15% in 2026 interim results",
  ].sort());
});

test("advice and guides are not product events, while a real safety-control launch is", () => {
  const result = buildHotList([
    article("techcrunch", "TikTok safety tips for teens", "teen-safety-tips", 1),
    article("techcrunch", "Instagram privacy guide for creators", "creator-privacy-guide", 1),
    article("techcrunch", "TikTok launches new teen safety controls", "teen-safety-controls", 2),
  ], new Date(NOW));
  assert.deepEqual(result.rankings.map((item) => item.title), ["TikTok launches new teen safety controls"]);
});

test("generic AI search chatbot is not mistaken for social chat", () => {
  const result = buildHotList([
    article("techcrunch", "YouTube rolls out AI search chatbot to all US users", "youtube-ai-search-chatbot", 1),
    article("techcrunch", "YouTube rolls out group chats for live creators", "youtube-live-group-chats", 2),
  ], new Date(NOW));
  assert.deepEqual(result.rankings.map((item) => item.title), ["YouTube rolls out group chats for live creators"]);
});

test("an uncorroborated platform algorithm claim does not outrank verified product news", () => {
  const result = buildHotList([
    article("socialday", "TikTok's 48-hour follower test kills broad reach for creators with disengaged audiences", "features/tiktok-follower-test", 1),
    article("techcrunch", "TikTok launches new group chat controls", "tiktok-group-chat-controls", 2),
  ], new Date(NOW));
  assert.deepEqual(result.rankings.map((item) => item.title), ["TikTok launches new group chat controls"]);
});

test("reviewed WhatsApp calling and Facebook algorithm headlines pair only their independent reports", () => {
  const at = new Date("2026-10-15T03:30:00.000Z");
  const result = buildHotList([
    {
      sourceId: "meta", title: "Now You Can Invite Anyone to a WhatsApp Call",
      url: "https://about.fb.com/news/2026/10/introducing-whatsapp-guest-calling/",
      publishedAt: "Wed, 14 Oct 2026 14:24:37 +0000",
    },
    {
      sourceId: "social-media-today", title: "WhatsApp provides chat guest links for non-users",
      url: "https://www.socialmediatoday.com/news/whatsapp-provides-chat-guest-links-for-non-users/833058/",
      publishedAt: "Wed, 14 Oct 2026 16:51:35 -0400",
    },
    {
      sourceId: "meta", title: "Your Algorithm, Your Words: New Ways to Shape What You See on Facebook",
      url: "https://about.fb.com/news/2026/10/introducing-your-algorithm-facebook/",
      publishedAt: "Tue, 13 Oct 2026 16:00:29 +0000",
    },
    {
      sourceId: "techcrunch", title: "Facebook is giving users more control over their algorithm",
      url: "https://techcrunch.com/2026/10/13/facebook-is-giving-users-more-control-over-their-algorithm/",
      publishedAt: "Tue, 13 Oct 2026 18:05:24 +0000",
    },
    article("meta", "WhatsApp provides new features", "news/2026/10/generic-whatsapp-features", 1),
    article("techcrunch", "Facebook is giving users more options", "2026/10/14/generic-facebook-options", 1),
    article("meta", "Facebook Update: October 14, 2026", "news/2026/10/generic-facebook-update", 1),
  ], at);
  assert.equal(result.rankings.length, 2, "generic titles must not fill the list");
  assert.equal(result.stories.length, 2, "each event has two independent publishers within 48 hours");
  const byTopic = new Map(result.rankings.map((item) => [item.topic, item]));
  assert.deepEqual(new Set(byTopic.keys()), new Set(["WhatsApp", "Facebook"]));
  assert.equal(byTopic.get("WhatsApp").title, "Now You Can Invite Anyone to a WhatsApp Call");
  assert.equal(byTopic.get("Facebook").title, "Your Algorithm, Your Words: New Ways to Shape What You See on Facebook");
  for (const story of result.rankings) {
    assert.equal(story.sourceCount, 2);
    assert.equal(story.verification, "multi-source");
    assert.equal(story.backfillWindowDays, null);
    assert.equal(new Set(story.sources.map((source) => source.name)).size, 2);
  }
});

test("a listed social company's product event can rank without being a financial result", () => {
  const result = buildHotList([
    article("yalla", "Yalla Group launches a new voice chat platform", "voice-chat-platform", 2),
    article("newborn-news", "赤子城科技推出海外语聊新功能", "news/42?lang=zh", 3),
    article("yalla", "Yalla Group publishes a general corporate guide", "corporate-guide", 1),
  ], new Date(NOW));
  assert.deepEqual(new Set(result.rankings.map((item) => item.topic)), new Set(["Yalla Group", "Newborn Town"]));
});

test("a strict hot story needs two independent publishers; one-source items remain separate leads", () => {
  const items = [
    article("techcrunch", "Facebook tests Reels-first feed in India", "facebook-reels-test", 2),
    article("social-media-today", "Facebook testing Reels-first feed in India", "news/facebook-reels-test", 3),
    article("discord", "Discord launches new voice rooms for creators", "voice-rooms", 4),
  ];
  const result = buildHotList(items, new Date(NOW));
  assert.equal(result.stories.length, 1);
  assert.equal(result.stories[0].sourceCount, 2);
  assert.equal(result.stories[0].topic, "Facebook");
  assert.deepEqual(result.stories[0].sources.map((source) => source.kind), ["media", "media"]);
  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0].topic, "Discord");
  assert.equal(result.rankings.length, 2);
  assert.deepEqual(result.rankings.map((item) => item.rank), [1, 2]);
  assert.deepEqual(result.rankings.map((item) => item.verification), ["multi-source", "single-source"]);
  assert.equal("score" in result.stories[0], false);
  assert.equal("score" in result.rankings[0], false);
  assert.equal("_heat" in result.stories[0], false);
});

test("the Top 10 prioritizes seven-day clusters without requiring two outlets or padding empty places", () => {
  assert.equal(RANKING_WINDOW_MS, 168 * 60 * 60 * 1000);
  assert.equal(RANKING_BACKFILL_WINDOW_MS, 30 * 24 * 60 * 60 * 1000);
  assert.equal(RANKING_ARCHIVE_WINDOW_MS, 90 * 24 * 60 * 60 * 1000);
  const result = buildHotList([
    article("techcrunch", "Facebook tests Reels-first feed in India", "facebook-reels", 6),
    article("social-media-today", "Facebook testing Reels-first feed in India", "news/facebook-reels", 7),
    article("discord", "Discord launches new voice rooms for creators", "voice-rooms", 0.5),
    article("engadget", "WhatsApp users may soon be able to schedule messages", "whatsapp-schedule", 30),
  ], new Date(NOW));
  assert.equal(result.rankings.length, 3);
  assert.deepEqual(result.rankings.map((item) => item.rank), [1, 2, 3]);
  assert.equal(result.rankings[0].topic, "Facebook", "two fresh independent reports outrank a single newer report");
  assert.equal(result.rankings[1].topic, "Discord");
  assert.equal(result.rankings[2].topic, "WhatsApp");
  assert.equal(result.rankings[2].verification, "single-source");
  assert.equal(result.rankings[2].sourceCount, 1);
  assert(result.rankings.every((item) => item.backfillWindowDays === null));
  assert.deepEqual(result.rankings[2].sources.map((source) => source.url), ["https://www.engadget.com/whatsapp-schedule"]);
});

test("ten recent events need no fallback, while a short week fills from 30 then 90 days", () => {
  const topics = ["Discord", "Facebook", "Instagram", "WhatsApp", "Threads", "TikTok", "Snapchat", "Reddit", "Twitch", "Bluesky", "Telegram", "YouTube"];
  const events = topics.map((topic, index) => article("techcrunch", `${topic} launches new social chat controls`, `social-controls-${index}`, index < 6 ? index + 1 : index < 9 ? 10 * 24 + index : 45 * 24 + index));
  const ranked = buildHotList(events, new Date(NOW)).rankings;
  assert.equal(ranked.length, 10);
  assert.deepEqual(ranked.map((item) => item.backfillWindowDays), [null, null, null, null, null, null, 30, 30, 30, 90]);
  assert.deepEqual(ranked.map((item) => item.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(new Set(ranked.map((item) => item.sources[0].url)).size, 10);
  assert.equal(buildHotList(events.map((item, index) => ({ ...item, publishedAt: published(index + 1) })), new Date(NOW)).rankings.every((item) => item.backfillWindowDays === null), true);
});

test("a genuine shortage stays visible instead of duplicating, inventing, or accepting over-90-day news", () => {
  const events = [
    article("techcrunch", "Discord launches new voice chat controls", "discord-controls", 1),
    article("meta", "Instagram launches new creator chat controls", "instagram-controls", 40 * 24),
    article("discord", "Discord releases new voice chat features", "voice-features", 91 * 24),
  ];
  const ranked = buildHotList(events, new Date(NOW)).rankings;
  assert.equal(ranked.length, 2);
  assert.deepEqual(ranked.map((item) => item.backfillWindowDays), [null, 90]);
});

test("ranked headlines show only reviewed Chinese translations and retain the exact English original", () => {
  const english = "WhatsApp users may soon be able to schedule messages";
  const result = buildHotList([
    article("engadget", english, "whatsapp-schedule", 2),
    article("discord", "Discord launches new voice rooms for creators", "voice-rooms", 3),
  ], new Date(NOW));
  const translated = result.rankings.find((item) => item.topic === "WhatsApp");
  const unknown = result.rankings.find((item) => item.topic === "Discord");
  assert.equal(translated.titleZh, "WhatsApp 用户或将很快可以定时发送消息");
  assert.equal(translated.title, english, "the feed's original English title must not be replaced");
  assert.equal(unknown.titleZh, null, "unreviewed headlines must not receive guessed translations");
  assert.equal(unknown.title, "Discord launches new voice rooms for creators");
  assert.equal(reviewedTitleZh("  WHATSAPP   users may soon be able to schedule messages  "), translated.titleZh);
  assert.equal(reviewedTitleZh("WhatsApp users may soon be able to schedule calls"), null);
});

test("reviewed translations preserve important allegations and original headline punctuation", () => {
  assert.equal(reviewedTitleZh("TikTok, Vertical Studio Made By Us Studios™ Partner to Produce Creator-Led Micro-Series"), "TikTok 与竖屏制作公司 Made By Us Studios 合作，计划制作创作者主导的微短剧");
  assert.equal(reviewedTitleZh("TikTok, Vertical Studio Made By Us Studios™ Release Creator-Led Micro-Series"), null, "a production partnership must not match a completed release");
  assert.equal(reviewedTitleZh("BBC News launches 24/7 YouTube stream as legacy broadcasters test whether platform distribution can recapture younger audiences"), "BBC 新闻在 YouTube 开设全天候直播，探索能否重新吸引年轻观众");
  assert.equal(reviewedTitleZh("Facebook tests going Reels-first in India"), "Facebook 在印度测试优先展示 Reels 的界面");
  assert.equal(
    reviewedTitleZh("New York alleges TikTok gave teens, children a placebo safety feature instead of a real one"),
    "纽约州指控 TikTok 向青少年和儿童提供形同虚设的安全功能，而非真正有效的功能",
  );
  assert.equal(
    reviewedTitleZh("A YouTube test brought creator analytics directly into brands’ YouTube Studio dashboards"),
    "YouTube 曾测试在品牌方的 YouTube Studio 后台直接展示创作者数据",
  );
  assert.equal(
    reviewedTitleZh("X expands its ‘Gametime’ sports hub beyond the NFL, starting with MLB"),
    "X 将 Gametime 体育专区扩展至 NFL 之外的赛事，首先接入 MLB",
  );
  assert.equal(reviewedTitleZh("X rebuilds its third-party usage showcase"), reviewedTitleZh("X re-builds its third-party usage showcase"));
  assert.equal(
    reviewedTitleZh("TikTok comments are getting more interactive with voice comments, polls, and more"),
    "TikTok 评论区新增语音评论、投票等互动方式",
  );
  assert.equal(
    reviewedTitleZh("TikTok explores peer-to-peer payments via DMs, report says"),
    "报道称 TikTok 正探索通过私信进行用户间支付",
  );
  assert.equal(
    reviewedTitleZh("TikTok removes Instagram and YouTube profile links, forcing creators onto Linktree as platform tightens ecosystem control"),
    "TikTok 移除个人主页中的 Instagram、YouTube 链接；文章称创作者转向 Linktree",
  );
});

test("related social-product launch and expansion headlines merge without counting article volume as publisher independence", () => {
  const result = buildHotList([
    article("social-media-today", "X launches creator community voice rooms", "news/x-voice-rooms", 4),
    article("techcrunch", "X expands its creator community voice rooms", "x-voice-rooms", 30),
    article("techcrunch", "X expands its creator community voice rooms", "x-voice-rooms-followup", 29),
  ], new Date(NOW));
  assert.equal(result.rankings.length, 1);
  assert.equal(result.rankings[0].sourceCount, 2);
  assert.equal(result.rankings[0].verification, "multi-source");
});

test("bilingual reports of the same voice-chat feature merge conservatively", () => {
  const result = buildHotList([
    article("newborn-news", "赤子城科技旗下 YoHo 上线语聊新功能", "news/voice-chat?lang=zh", 3),
    article("techcrunch", "YoHo launches new voice chat feature", "yoho-voice-chat", 4),
  ], new Date(NOW));
  assert.equal(result.rankings.length, 1);
  assert.equal(result.rankings[0].sourceCount, 2);
  assert.equal(result.rankings[0].verification, "multi-source");
});

test("separate regional launches and different bilingual features do not merge", () => {
  const result = buildHotList([
    article("techcrunch", "TikTok launches creator chat controls in India", "india-chat-controls", 3),
    article("social-media-today", "TikTok launches creator chat controls in Brazil", "brazil-chat-controls", 4),
    article("newborn-news", "YoHo 上线语聊新功能", "news/voice-chat?lang=zh", 3),
    article("techcrunch", "YoHo launches new voice chat gifting feature", "yoho-gifting", 4),
  ], new Date(NOW));
  assert.equal(result.rankings.length, 4);
  assert(result.rankings.every((item) => item.sourceCount === 1));
});

test("Beijing date-only official news remains eligible before 08:00 and future days do not", () => {
  const at = Date.parse("2026-10-12T16:30:00Z"); // 2026-10-13 00:30 in Beijing
  const result = buildHotList([
    { ...article("bigo-news", "BIGO LIVE launches voice chat rooms", "news-events/rooms"), publishedAt: "2026-10-13" },
    { ...article("newborn-news", "YoHo 上线语聊新功能", "news/43?lang=zh"), publishedAt: "2026-10-14" },
  ], new Date(at));
  assert.equal(result.rankings.length, 1);
  assert.equal(result.rankings[0].publishedAt, "2026-10-13");
  assert.equal(result.rankings[0].sources[0].publishedAt, "2026-10-13");
});

test("speculative revival stories rank below a similarly fresh paid product change", () => {
  const result = buildHotList([
    article("techcrunch", "Orkut founder wants to bring it back", "orkut-wants-revival", 2),
    article("socialday", "Instagram charges creators for new AI live tools", "instagram-ai-live-payment", 30),
  ], new Date(NOW));
  assert.deepEqual(result.rankings.map((item) => item.topic), ["Instagram", "Orkut"]);
});

test("a ranking never pads beyond ten real events and excludes generic creator behavior", () => {
  const topics = ["Discord", "Facebook", "Instagram", "WhatsApp", "Threads", "TikTok", "Snapchat", "Reddit", "Twitch", "Bluesky", "Telegram", "YouTube"];
  const result = buildHotList([
    ...topics.map((topic, index) => article("techcrunch", `${topic} launches a new chat experience in ${index + 1} regions`, `launch-${index}`, index + 1)),
    article("netinfluencer", "Some TikTok users trust medical influencers more than their doctors", "users-medical", 1),
  ], new Date(NOW));
  assert.equal(result.rankings.length, 10);
  assert.deepEqual(result.rankings.map((item) => item.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert(result.rankings.every((item) => item.verification === "single-source"));
  assert(!result.rankings.some((item) => item.title.includes("medical influencers")));
});

test("independent reports contribute to recency-weighted heat and unrelated stories do not merge", () => {
  const result = buildHotList([
    article("meta", "Facebook tests Reels-first feed in India", "news/reels-feed", 40),
    article("techcrunch", "Facebook testing Reels-first feed in India", "reels-feed", 40),
    article("social-media-today", "Facebook tests Reels-first feed in India", "news/reels-feed", 40),
    article("discord", "Discord launches new voice rooms for creators", "voice-rooms", 1),
    article("techcrunch", "Discord launches new voice rooms for creators", "discord-voice-rooms", 1),
    article("social-media-today", "Facebook tests privacy controls for teens", "news/facebook-privacy", 1),
  ], new Date(NOW));
  assert.equal(result.stories.length, 2);
  assert.equal(result.stories[0].topic, "Discord", "fresh independent reporting can outrank three older reports");
  assert.equal(result.stories[1].topic, "Facebook");
  assert.equal(result.stories[1].sourceCount, 3);
  assert(result.leads.some((lead) => lead.title.includes("privacy controls")));
});

test("old, future, undated, off-domain, and insecure links are not promoted", () => {
  const valid = article("techcrunch", "Threads launches community chat controls", "threads-controls", 6 * 24);
  const bad = [
    { ...valid, url: "http://techcrunch.com/insecure" },
    { ...valid, url: "https://evil.example/redirect" },
    { ...valid, publishedAt: "2026-10-12 05:00:00" },
    { ...valid, publishedAt: published(91 * 24) },
    { ...valid, publishedAt: new Date(NOW + 1000).toUTCString() },
    { ...valid, sourceId: "unknown" },
    article("techcrunch", "A new data center opens", "data-center", 1),
  ];
  const result = buildHotList([valid, ...bad], new Date(NOW));
  assert.equal(result.stories.length, 0);
  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0].sources[0].url, valid.url);
});

test("duplicate URLs and one publisher's repeated coverage do not invent independent sources", () => {
  const one = article("techcrunch", "TikTok launches new creator community features", "tiktok-community", 2);
  const result = buildHotList([one, one, { ...one, url: "https://techcrunch.com/tiktok-community?utm_source=rss" }], new Date(NOW));
  assert.equal(result.stories.length, 0);
  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0].sourceCount, 1);
});

test("worker serves a warm cached result and retains stale data when feeds fail", async () => {
  const bundled = await build({
    entryPoints: [new URL("../worker/hot-list.ts", import.meta.url).pathname],
    bundle: true, format: "esm", platform: "browser", write: false,
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`;
  const { createHotListHandler } = await import(moduleUrl);
  let clock = NOW;
  let fail = false;
  let calls = 0;
  const feedItems = {
    techcrunch: [article("techcrunch", "Facebook tests Reels-first feed in India", "facebook-reels-test", 2)],
    "social-media-today": [article("social-media-today", "Facebook testing Reels-first feed in India", "news/facebook-reels-test", 3)],
  };
  const fetcher = async (url) => {
    calls += 1;
    if (fail) throw new Error("network unavailable");
    const source = HOT_FEEDS.find((feed) => feed.url === url);
    return sourceResponse(source, feedItems[source.id] ?? []);
  };
  const handle = createHotListHandler({ fetcher, now: () => clock });
  const request = new Request("https://example.com/api/hot-list");
  const first = await (await handle(request)).json();
  assert.equal(first.status, "ready");
  assert.equal(first.windowHours, 48);
  assert.equal(first.stories.length, 1);
  assert.equal(first.sources.length, HOT_FEEDS.length);
  assert.equal(first.rankingWindowHours, 168);
  assert.equal(first.fallbackWindowHours, 2160);
  assert.equal(first.methodVersion, 9);
  assert.equal(first.rankings.length, 1);
  assert.equal(calls, HOT_FEEDS.length);

  clock += 4 * 60 * 1000;
  await handle(request);
  assert.equal(calls, HOT_FEEDS.length);

  clock += 61 * 1000;
  fail = true;
  const stale = await (await handle(request)).json();
  assert.equal(stale.status, "unavailable");
  assert.equal(stale.stale, true);
  assert.equal(stale.failedSources.length, HOT_FEEDS.length);
  assert.deepEqual(stale.stories, first.stories);
  assert.deepEqual(stale.rankings, first.rankings);
  assert.equal(stale.updatedAt, first.updatedAt);
  assert.equal(calls, HOT_FEEDS.length * 2);
  await handle(request);
  assert.equal(calls, HOT_FEEDS.length * 2);

  clock += 49 * 60 * 60 * 1000;
  const expired = await (await handle(request)).json();
  assert.equal(expired.status, "unavailable");
  assert.equal(expired.stories.length, 0, "expired events must not remain on the 48-hour list");
  assert.equal(expired.leads.length, 0, "expired multi-source events must not turn into single-source leads");
  assert.equal(expired.rankings.length, 1, "the real event remains within the seven-day ranking window");

  clock += 90 * 24 * 60 * 60 * 1000;
  const fullyExpired = await (await handle(request)).json();
  assert.equal(fullyExpired.status, "unavailable");
  assert.equal(fullyExpired.rankings.length, 0, "stale cache cannot keep events beyond the fallback window");
});

test("one unavailable feed still yields ten sourced stories through layered fallback", async () => {
  const bundled = await build({ entryPoints: [new URL("../worker/hot-list.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "browser", write: false });
  const { createHotListHandler } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
  const rows = {
    techcrunch: ["Reddit", "TikTok", "Snapchat", "YouTube"].map((topic, index) => article("techcrunch", `${topic} launches new social chat controls`, `recent-${index}`, index + 1)),
    meta: ["Facebook", "Instagram", "Threads", "WhatsApp"].map((topic, index) => article("meta", `${topic} launches new social chat controls`, `backfill-${index}`, 10 * 24 + index)),
    discord: ["Discord", "Twitch", "Bluesky", "Telegram"].map((topic, index) => article("discord", `${topic} launches new social chat controls`, `archive-${index}`, 40 * 24 + index)),
  };
  const fetcher = async (url) => {
    const source = HOT_FEEDS.find((feed) => feed.url === url);
    if (source.id === "socialday") throw new Error("feed unavailable");
    return sourceResponse(source, rows[source.id] ?? []);
  };
  const result = await (await createHotListHandler({ fetcher, now: () => NOW })(new Request("https://example.com/api/hot-list"))).json();
  assert.equal(result.status, "ready");
  assert.equal(result.stale, true);
  assert.deepEqual(result.failedSources, ["SocialDay"]);
  assert.equal(result.rankings.length, 10);
  assert.deepEqual(result.rankings.map((item) => item.backfillWindowDays), [null, null, null, null, 30, 30, 30, 30, 90, 90]);
  assert.equal(new Set(result.rankings.map((item) => item.sources[0].url)).size, 10);
});

test("worker ingests official HTML and disclosure JSON without exposing the private-looking feed endpoint", async () => {
  const bundled = await build({
    entryPoints: [new URL("../worker/hot-list.ts", import.meta.url).pathname],
    bundle: true, format: "esm", platform: "browser", write: false,
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`;
  const { createHotListHandler } = await import(moduleUrl);
  const fetched = [];
  const fetcher = async (url, options) => {
    fetched.push({ url, accept: options.headers.Accept });
    const source = HOT_FEEDS.find((feed) => feed.url === url);
    if (source.id === "bigo-news") return new Response('<div class="blog-item"><a href="/news-events/voice-rooms" class="title">BIGO LIVE launches creator voice rooms</a><div class="time">2026-10-12</div></div>');
    if (source.id === "newborn-ir") return new Response(JSON.stringify({ code: 0, padding: "x".repeat(300 * 1024), data: { list: { website_hk_news: [
      { title: "Announcements and Notices - [Interim Results]", file_name: "INTERIM RESULTS 2026: REVENUE RISES 20%", release_time: "2026-10-12", file_url: "https://www1.hkexnews.hk/listedco/listconews/sehk/2026/1012/results.pdf" },
    ] } } }));
    if (source.id === "newborn-news") return new Response(JSON.stringify({ code: 0, data: { list: [
      { ID: 41, title: "YoHo 上线语聊新功能", day: "2026-10-11" },
    ] } }));
    return new Response(rss());
  };
  const result = await (await createHotListHandler({ fetcher, now: () => NOW })(new Request("https://example.com/api/hot-list"))).json();
  assert.deepEqual(result.rankings.map((item) => item.topic), ["BIGO LIVE", "Newborn Town", "YoHo"]);
  assert.equal(result.sources.find((source) => source.name === "赤子城科技投资者关系").url, "https://ir.newborntown.com/");
  assert.equal(result.sources.find((source) => source.name === "赤子城科技新闻中心").url, "https://www.newborntown.com/news?lang=zh");
  assert.equal(fetched.find((item) => item.url.includes("beijingqianji.com")).accept, "application/json");
  assert.equal(HOT_FEEDS.find((source) => source.id === "newborn-ir").maxBytes, 512 * 1024, "growing issuer disclosures must fit past the default RSS size limit");
  assert.equal(fetched.find((item) => item.url.includes("bigo.tv")).accept, "text/html");
  assert.equal(fetched.find((item) => item.url.includes("getNewsCenterList")).accept, "application/json");
  assert.equal(result.rankings[1].sources[0].url, "https://www1.hkexnews.hk/listedco/listconews/sehk/2026/1012/results.pdf");
  assert.equal(result.rankings[2].sources[0].url, "https://www.newborntown.com/news/41?lang=zh");
});

test("edge cache reuses a completed ranking across independent worker handlers", async () => {
  const bundled = await build({
    entryPoints: [new URL("../worker/hot-list.ts", import.meta.url).pathname],
    bundle: true, format: "esm", platform: "browser", write: false,
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`;
  const { createHotListHandler, handleEdgeCachedHotList } = await import(moduleUrl);
  let fetches = 0;
  const feedItems = {
    techcrunch: [article("techcrunch", "Facebook tests Reels-first feed in India", "facebook-reels-test", 2)],
    "social-media-today": [article("social-media-today", "Facebook testing Reels-first feed in India", "news/facebook-reels-test", 3)],
  };
  const fetcher = async (url) => {
    fetches += 1;
    const source = HOT_FEEDS.find((feed) => feed.url === url);
    return sourceResponse(source, feedItems[source.id] ?? []);
  };
  const cache = memoryEdgeCache();
  const background = [];
  const waitUntil = (promise) => { background.push(promise); };
  const request = new Request("https://example.com/api/hot-list");
  const first = await (await handleEdgeCachedHotList(request, {
    cache, waitUntil, handler: createHotListHandler({ fetcher, now: () => NOW }),
  })).json();
  await Promise.all(background.splice(0));
  assert.equal(first.status, "ready");
  assert.equal(fetches, HOT_FEEDS.length);
  assert.equal(cache.entries.size, 1);
  assert.match([...cache.entries.values()][0].headers.get("Cache-Control"), /max-age=300/);

  const second = await (await handleEdgeCachedHotList(request, {
    cache, waitUntil, handler: createHotListHandler({ fetcher, now: () => NOW + 1000 }),
  })).json();
  assert.equal(fetches, HOT_FEEDS.length, "a fresh worker instance should not refetch every RSS feed");
  assert.equal(second.updatedAt, first.updatedAt);
  assert.deepEqual(second.rankings, first.rankings);
});

test("edge cache stores valid empty lists but never stores unavailable results", async () => {
  const bundled = await build({
    entryPoints: [new URL("../worker/hot-list.ts", import.meta.url).pathname],
    bundle: true, format: "esm", platform: "browser", write: false,
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`;
  const { createHotListHandler, handleEdgeCachedHotList } = await import(moduleUrl);
  const request = new Request("https://example.com/api/hot-list");
  const background = [];
  const waitUntil = (promise) => { background.push(promise); };
  const emptyCache = memoryEdgeCache();
  let emptyFetches = 0;
  const emptyFetcher = async (url) => { emptyFetches += 1; return sourceResponse(HOT_FEEDS.find((feed) => feed.url === url)); };
  const empty = await (await handleEdgeCachedHotList(request, {
    cache: emptyCache, waitUntil, handler: createHotListHandler({ fetcher: emptyFetcher, now: () => NOW }),
  })).json();
  await Promise.all(background.splice(0));
  assert.equal(empty.status, "empty");
  assert.equal(emptyCache.entries.size, 1);
  await handleEdgeCachedHotList(request, {
    cache: emptyCache, waitUntil, handler: createHotListHandler({ fetcher: emptyFetcher, now: () => NOW + 1000 }),
  });
  assert.equal(emptyFetches, HOT_FEEDS.length, "a valid empty feed should be reused from the edge cache");

  const unavailableCache = memoryEdgeCache();
  const unavailable = await handleEdgeCachedHotList(request, {
    cache: unavailableCache, waitUntil,
    handler: createHotListHandler({ fetcher: async () => { throw new Error("offline"); }, now: () => NOW }),
  });
  await Promise.all(background.splice(0));
  assert.equal((await unavailable.json()).status, "unavailable");
  assert.equal(unavailableCache.entries.size, 0, "failed RSS refreshes must not poison the shared cache");
  assert.equal(unavailable.headers.get("Cache-Control"), "no-store");
  const recovered = await (await handleEdgeCachedHotList(request, {
    cache: unavailableCache, waitUntil,
    handler: createHotListHandler({ fetcher: emptyFetcher, now: () => NOW + 1000 }),
  })).json();
  assert.equal(recovered.status, "empty", "a later worker should retry after an unavailable result");
});

test("daily scheduled crawl writes a durable snapshot and the public API serves it without refetching", async () => {
  const [dailyBundle, apiBundle] = await Promise.all([
    build({ entryPoints: [new URL("../worker/hot-daily.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "browser", write: false }),
    build({ entryPoints: [new URL("../worker/hot-list.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "browser", write: false }),
  ]);
  const daily = await import(`data:text/javascript;base64,${Buffer.from(dailyBundle.outputFiles[0].text).toString("base64")}`);
  const api = await import(`data:text/javascript;base64,${Buffer.from(apiBundle.outputFiles[0].text).toString("base64")}`);
  const db = memorySnapshotDb();
  const feedItems = {
    techcrunch: [
      article("techcrunch", "Facebook tests Reels-first feed in India", "facebook-reels-test", 2),
      ...["Discord", "Instagram", "WhatsApp", "Threads", "TikTok", "Snapchat", "Reddit", "Twitch", "Bluesky"]
        .map((topic, index) => article("techcrunch", `${topic} launches new social chat controls`, `daily-${index}`, 3 + index)),
    ],
    "social-media-today": [article("social-media-today", "Facebook testing Reels-first feed in India", "news/facebook-reels-test", 3)],
  };
  let fetches = 0;
  const fetcher = async (url) => {
    fetches += 1;
    const source = HOT_FEEDS.find((feed) => feed.url === url);
    return sourceResponse(source, feedItems[source.id] ?? []);
  };
  const written = await daily.publishDailyHotList(db, { fetcher, now: () => NOW });
  assert.deepEqual(written, { updatedAt: new Date(NOW).toISOString(), status: "ready", rankings: 10, detailsReady: 0, failedSources: [], written: true });
  assert.equal(fetches, HOT_FEEDS.length);
  let liveCalls = 0;
  const live = async () => { liveCalls += 1; return Response.json({ fallback: true }); };
  const request = new Request("https://example.com/api/hot-list");
  const response = await api.handleDurableHotList(request, { db, now: () => NOW + 60 * 60 * 1000, handler: live });
  assert.equal((await response.json()).rankings.length, 10);
  assert.equal(liveCalls, 0);
  const head = await api.handleDurableHotList(new Request(request.url, { method: "HEAD" }), { db, now: () => NOW + 1000, handler: live });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal(liveCalls, 0);
  const expired = await api.handleDurableHotList(request, { db, now: () => NOW + 25 * 60 * 60 * 1000, handler: live });
  assert.deepEqual(await expired.json(), { fallback: true });
  assert.equal(liveCalls, 1);
});

test("a prior-method durable snapshot cannot hide the expanded ten-item fallback", async () => {
  const bundled = await build({ entryPoints: [new URL("../worker/hot-list.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "browser", write: false });
  const { handleDurableHotList } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
  const db = memorySnapshotDb();
  const oldPayload = { methodVersion: 6, updatedAt: new Date(NOW).toISOString(), status: "ready", rankings: [{ rank: 1 }], stories: [], leads: [], sources: [] };
  db.setRow({ updated_at: oldPayload.updatedAt, payload_json: JSON.stringify(oldPayload) });
  let liveCalls = 0;
  const result = await handleDurableHotList(new Request("https://example.com/api/hot-list"), {
    db, now: () => NOW + 1000,
    handler: async () => { liveCalls += 1; return Response.json({ methodVersion: 9, rankings: Array.from({ length: 10 }, (_, index) => ({ rank: index + 1 })) }); },
  });
  assert.equal((await result.json()).rankings.length, 10);
  assert.equal(liveCalls, 1);
});

test("a fresh but short D1 snapshot does not prevent recovery to ten live stories", async () => {
  const bundled = await build({ entryPoints: [new URL("../worker/hot-list.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "browser", write: false });
  const { handleDurableHotList } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
  const topics = ["Discord", "Facebook", "Instagram", "WhatsApp", "Threads", "TikTok", "Snapchat", "Reddit", "Twitch", "Bluesky"];
  const items = topics.map((topic, index) => article("techcrunch", `${topic} launches new social chat controls`, `fresh-${index}`, index + 1));
  const updatedAt = new Date(NOW).toISOString();
  const base = { methodVersion: 9, updatedAt, status: "ready", stale: false, windowHours: 48, rankingWindowHours: 168, fallbackWindowHours: 2160, failedSources: [], sources: [] };
  const db = memorySnapshotDb();
  db.setRow({ updated_at: updatedAt, payload_json: JSON.stringify({ ...base, ...buildHotList(items.slice(0, 4), new Date(NOW)) }) });
  let liveCalls = 0;
  const result = await handleDurableHotList(new Request("https://example.com/api/hot-list"), {
    db, now: () => NOW + 60 * 60 * 1000,
    handler: async () => { liveCalls += 1; return Response.json({ ...base, ...buildHotList(items, new Date(NOW + 60 * 60 * 1000)) }); },
  });
  assert.equal((await result.json()).rankings.length, 10);
  assert.equal(liveCalls, 1);
});

test("saved Newborn Town financial disclosure keeps its category when revalidated", async () => {
  const bundled = await build({ entryPoints: [new URL("../worker/hot-list.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "browser", write: false });
  const { mergeSavedHotList } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
  const original = buildHotList([{ ...article("newborn-ir", "INTERIM RESULTS 2026: REVENUE RISES 20%", "results.pdf", 1), category: "Announcements and Notices - [Interim Results]" }], new Date(NOW));
  assert.equal(original.rankings.length, 1);
  const base = { methodVersion: 9, updatedAt: new Date(NOW).toISOString(), status: "ready", stale: false, windowHours: 48, rankingWindowHours: 168, fallbackWindowHours: 2160, failedSources: [], sources: [] };
  const current = { ...base, updatedAt: new Date(NOW + 25 * 60 * 60 * 1000).toISOString(), ...buildHotList([], new Date(NOW + 25 * 60 * 60 * 1000)) };
  const result = mergeSavedHotList(current, { ...base, ...original }, NOW + 25 * 60 * 60 * 1000);
  assert.equal(result.rankings.length, 1);
  assert.equal(result.rankings[0].topic, "Newborn Town");
  assert.equal(result.rankings[0].sources[0].category, "Announcements and Notices - [Interim Results]");
});

test("a cold worker revalidates an expired D1 snapshot when all feeds fail", async () => {
  const bundled = await build({ entryPoints: [new URL("../worker/hot-list.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "browser", write: false });
  const { createHotListHandler, handleDurableHotList } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
  const topics = ["Discord", "Facebook", "Instagram", "WhatsApp", "Threads", "TikTok", "Snapchat", "Reddit", "Twitch", "Bluesky"];
  const original = buildHotList(topics.map((topic, index) => article("techcrunch", `${topic} launches new social chat controls`, `saved-${index}`, 5 * 24 + index)), new Date(NOW));
  const updatedAt = new Date(NOW).toISOString();
  const saved = { methodVersion: 9, updatedAt, status: "ready", stale: false, windowHours: 48, rankingWindowHours: 168, fallbackWindowHours: 2160, failedSources: [], sources: [], ...original };
  const db = memorySnapshotDb();
  db.setRow({ updated_at: updatedAt, payload_json: JSON.stringify(saved) });
  const at = NOW + 25 * 60 * 60 * 1000;
  const offline = createHotListHandler({ fetcher: async () => { throw new Error("offline"); }, now: () => at });
  const response = await handleDurableHotList(new Request("https://example.com/api/hot-list"), { db, now: () => at, handler: offline });
  const result = await response.json();
  assert.equal(result.status, "unavailable");
  assert.equal(result.stale, true);
  assert.equal(result.usedSavedSnapshot, true);
  assert.equal(result.updatedAt, updatedAt);
  assert.equal(result.rankings.length, 10);
  assert.equal(response.headers.get("Cache-Control"), "no-store");

  const tooOldAt = NOW + 91 * 24 * 60 * 60 * 1000;
  const expired = await (await handleDurableHotList(new Request("https://example.com/api/hot-list"), {
    db, now: () => tooOldAt,
    handler: createHotListHandler({ fetcher: async () => { throw new Error("offline"); }, now: () => tooOldAt }),
  })).json();
  assert.equal(expired.rankings.length, 0, "an old saved ranking cannot live past the 90-day boundary");
});

test("a partial scheduled crawl merges valid saved stories instead of overwriting ten with a short list", async () => {
  const bundled = await build({ entryPoints: [new URL("../worker/hot-daily.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "browser", write: false });
  const { publishDailyHotList } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
  const db = memorySnapshotDb();
  const topics = ["Discord", "Facebook", "Instagram", "WhatsApp", "Threads", "TikTok", "Snapchat", "Reddit", "Twitch", "Bluesky"];
  const original = topics.map((topic, index) => article("techcrunch", `${topic} launches new social chat controls`, `saved-${index}`, 5 * 24 + index));
  const firstFetcher = async (url) => {
    const source = HOT_FEEDS.find((feed) => feed.url === url);
    return sourceResponse(source, source.id === "techcrunch" ? original : []);
  };
  const first = await publishDailyHotList(db, { fetcher: firstFetcher, now: () => NOW });
  assert.equal(first.rankings, 10);
  const at = NOW + 24 * 60 * 60 * 1000;
  const secondFetcher = async (url) => {
    const source = HOT_FEEDS.find((feed) => feed.url === url);
    if (source.id === "socialday") throw new Error("offline");
    return sourceResponse(source, source.id === "techcrunch" ? [article("techcrunch", "Telegram launches new social chat controls", "new-telegram", 1)] : []);
  };
  const second = await publishDailyHotList(db, { fetcher: secondFetcher, now: () => at });
  assert.equal(second.rankings, 10);
  const payload = JSON.parse(db.row.payload_json);
  assert.equal(payload.usedSavedSnapshot, true);
  assert.equal(payload.stale, true);
  assert.equal(payload.rankings.length, 10);
  assert(payload.rankings.some((item) => item.topic === "Telegram"));
});

test("daily crawl preserves the previous D1 snapshot when all feeds fail or a late run finishes older", async () => {
  const bundled = await build({ entryPoints: [new URL("../worker/hot-daily.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "browser", write: false });
  const { publishDailyHotList } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
  const db = memorySnapshotDb();
  const good = async (url) => sourceResponse(HOT_FEEDS.find((feed) => feed.url === url));
  await publishDailyHotList(db, { fetcher: good, now: () => NOW });
  const original = db.row;
  await assert.rejects(publishDailyHotList(db, { fetcher: async () => { throw new Error("offline"); }, now: () => NOW + 24 * 60 * 60 * 1000 }), /previous D1 snapshot was preserved/);
  assert.deepEqual(db.row, original);
  const older = await publishDailyHotList(db, { fetcher: good, now: () => NOW - 1000 });
  assert.equal(older.written, false);
  assert.deepEqual(db.row, original);
});

test("the daily hot-list Worker retains its Beijing crawl and backs up the daily report", async () => {
  const config = JSON.parse(await readFile(new URL("../wrangler.hot.json", import.meta.url), "utf8"));
  const migration = await readFile(new URL("../drizzle/0003_hot_list_snapshot.sql", import.meta.url), "utf8");
  assert.deepEqual(config.triggers.crons, ["0 0 * * *", "15 3 * * *"]);
  assert.equal(config.d1_databases[0].binding, "DB");
  assert.deepEqual(config.services, [
    { binding: "DAILY_GENERATOR", service: "xiaoluo-daily-generator" },
    { binding: "HOT_DETAIL", service: "xiaoluo-hot-detail" },
  ]);
  assert.equal(config.ai, undefined, "model calls run in the isolated per-story detail service");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS hot_list_snapshot/);
});

test("worker rejects oversized feeds, invalid methods, and unsupported redirects", async () => {
  const bundled = await build({
    entryPoints: [new URL("../worker/hot-list.ts", import.meta.url).pathname],
    bundle: true, format: "esm", platform: "browser", write: false,
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`;
  const { createHotListHandler } = await import(moduleUrl);
  const oversized = createHotListHandler({
    fetcher: async () => new Response("x".repeat(256 * 1024 + 1)),
    now: () => NOW,
  });
  const unavailable = await (await oversized(new Request("https://example.com/api/hot-list"))).json();
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.updatedAt, null);
  const badMethod = await oversized(new Request("https://example.com/api/hot-list", { method: "POST" }));
  assert.equal(badMethod.status, 405);
  const redirect = createHotListHandler({
    fetcher: async () => {
      const response = new Response(rss());
      Object.defineProperty(response, "url", { value: "https://evil.example/feed" });
      return response;
    },
    now: () => NOW,
  });
  assert.equal((await (await redirect(new Request("https://example.com/api/hot-list"))).json()).status, "unavailable");

  let unsafeFetches = 0;
  const unsafeRedirect = createHotListHandler({
    fetcher: async () => {
      unsafeFetches += 1;
      return new Response(null, { status: 302, headers: { Location: "https://internal.example/feed" } });
    },
    now: () => NOW,
  });
  assert.equal((await (await unsafeRedirect(new Request("https://example.com/api/hot-list"))).json()).status, "unavailable");
  assert.equal(unsafeFetches, HOT_FEEDS.length, "redirects outside the publisher must never be fetched");
});
