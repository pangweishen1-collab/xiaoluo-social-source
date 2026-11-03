import assert from "node:assert/strict";
import test from "node:test";
import { buildHotList, PREVIOUSLY_REVIEWED_EVENT } from "../shared/hot-list.mjs";

const NOW = new Date("2026-10-19T15:00:00Z");
const article = (title, index, sourceId = "techcrunch") => ({ sourceId, title, url: sourceId === "bigo-news" ? `https://www.bigo.tv/news-events/event-${index}` : `https://techcrunch.com/event-${index}`,
  publishedAt: "2026-10-19T10:00:00Z" });

test("third-party channel launches do not count as a host platform product change", () => {
  const titles = [
    "BBC News launches 24/7 YouTube stream as legacy broadcasters test whether platform distribution can recapture younger audiences",
    "National broadcaster launches a YouTube channel for live news",
    "Regional news publisher starts a 24-hour YouTube stream",
  ];
  const result = buildHotList(titles.map((title, index) => article(title, index)), NOW);
  assert.equal(result.rankings.length, 0);
  const previouslyReviewed = { ...article(titles[0], 100), [PREVIOUSLY_REVIEWED_EVENT]: true };
  assert.equal(buildHotList([previouslyReviewed], NOW).rankings.length, 0, "an older reviewed snapshot cannot bypass the clarified relevance boundary");
});

test("actual chat mechanisms and platform-led launches remain eligible", () => {
  const titles = [
    "YouTube launches new live chat controls for channels",
    "BBC News launches a YouTube channel with new interactive chat permissions",
    "BIGO LIVE hosts new creator watch parties in MENA",
    "YouTube launches a new social app with voice chat rooms",
    "Independent developer launches a new YouTube-style voice chat app",
  ];
  for (const [index, title] of titles.entries()) {
    const result = buildHotList([article(title, index, index === 2 ? "bigo-news" : "techcrunch")], NOW);
    assert.equal(result.rankings[0]?.title, title);
  }
});
