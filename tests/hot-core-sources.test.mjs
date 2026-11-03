import assert from "node:assert/strict";
import test from "node:test";
import { buildHotList, HOT_FEEDS, parseAppStoreLookupJson, parseJoyyWireHtml, parseNewbornNewsJson, parseRssFeed } from "../shared/hot-list.mjs";

const now = new Date("2026-10-19T05:00:00Z");
const source = (id) => HOT_FEEDS.find((feed) => feed.id === id);
const appRow = (id, changes = {}) => ({
  trackId: source(id).appId,
  trackName: `${source(id).productTopic} - Voice Chat`,
  trackViewUrl: `https://apps.apple.com/us/app/voice-chat/id${source(id).appId}?uo=4`,
  version: "5.0.0",
  currentVersionReleaseDate: "2026-10-18T02:00:00Z",
  releaseNotes: "Added invite links for group voice chat rooms. Hosts can now approve guests before they join the room.",
  ...changes,
});
const lookup = (id, changes) => parseAppStoreLookupJson(JSON.stringify({ resultCount: 1, results: [appRow(id, changes)] }), source(id));
const article = (sourceId, title, contentText = "") => ({ sourceId, title, contentText, contentKind: "article", url: `https://${source(sourceId).hosts[0]}/news/specific-change`, publishedAt: "2026-10-18T02:00:00Z" });

test("official social earnings accept plural metrics and qualified operating periods without admitting generic financial text", () => {
  const title = "Yalla Group Limited Announces Unaudited Second Quarter 2026 Financial Results";
  const body = "Revenues generated from chatting services in the second quarter of 2026 were US$47.4 million.";
  assert.equal(buildHotList([article("yalla", title, body)], now).rankings.length, 1);
  assert.equal(buildHotList([article("yalla", title, "Social MAUs increased 10% during the reporting period.")], now).rankings.length, 1);
  for (const text of ["", "The quarter ended June 30, 2026.", "Hardware revenues reached US$47.4 million."]) {
    assert.equal(buildHotList([article("yalla", title, text)], now).rankings.length, 0, text);
  }
});

test("core product store parser validates exact identity and uses release notes rather than evergreen descriptions", () => {
  const [item] = lookup("yoho-app-store");
  assert.equal(item.productTopic, "YoHo");
  assert.equal(item.contentKind, "release-notes");
  assert.equal(item.publishedAt, "2026-10-18T02:00:00Z");
  assert.equal(item.version, "5.0.0");
  assert.match(item.title, /YoHo.*5\.0\.0/);
  assert.throws(() => lookup("yoho-app-store", { trackId: 123 }), /identity/);
  assert.throws(() => lookup("yoho-app-store", { trackName: "Unrelated Shopping App" }), /identity/);
  assert.throws(() => lookup("yoho-app-store", { trackViewUrl: "https://apps.apple.com/us/app/id123" }), /URL/);
  assert.throws(() => lookup("yoho-app-store", { trackViewUrl: `https://evil.example/id${source("yoho-app-store").appId}` }), /URL/);
  assert.deepEqual(lookup("yoho-app-store", { releaseNotes: "", description: "Added new voice chat rooms with virtual gifts" }), []);
  assert.deepEqual(parseAppStoreLookupJson('{"resultCount":0,"results":[]}', source("yoho-app-store")), []);
  assert.throws(() => parseAppStoreLookupJson('{"resultCount":1,"results":[]}', source("yoho-app-store")), /metadata/);
});

test("core store updates require a concrete social change and do not pad with the current generic changelogs", () => {
  const ids = ["bigo-app-store", "yalla-app-store", "mico-app-store", "yoho-app-store", "toptop-app-store", "sugo-app-store"];
  for (const id of ids) {
    const concrete = lookup(id).map((item) => ({ ...item, sourceId: id }));
    const generic = lookup(id, { releaseNotes: "Fixed several known bugs. Improved product performance and user experience." }).map((item) => ({ ...item, sourceId: id }));
    assert.equal(buildHotList(concrete, now).rankings[0]?.topic, source(id).productTopic, id);
    assert.equal(buildHotList(generic, now).rankings.length, 0, id);
  }
  const cosmeticOnly = lookup("bigo-app-store", { releaseNotes: "Bug fixes make the voice chat room smoother. Performance is improved." });
  assert.equal(buildHotList(cosmeticOnly.map((item) => ({ ...item, sourceId: "bigo-app-store" })), now).rankings.length, 0);
});

test("financial discovery headlines need real social results in the body and exclude corporate notices", () => {
  const title = "JOYY Reports Second Quarter 2026 Unaudited Financial Results";
  const concrete = article("joyy-ir", title, "BIGO LIVE livestreaming revenue grew 14% year over year to US$500 million, while paying users increased 8%.");
  assert.equal(buildHotList([concrete], now).rankings[0]?.topic, "JOYY");
  assert.equal(buildHotList([article("joyy-ir", title)], now).rankings.length, 0);
  assert.equal(buildHotList([article("joyy-ir", title, "The company is pleased to announce its latest financial results and looks forward to future opportunities.")], now).rankings.length, 0);
  assert.equal(buildHotList([article("joyy-ir", "JOYY to Announce Second Quarter 2026 Financial Results", concrete.contentText)], now).rankings.length, 0);
  assert.equal(buildHotList([article("joyy-ir", title, "The hardware revenue increased 20% while cloud infrastructure sales reached US$100 million.")], now).rankings.length, 0);
});

test("RSS and public Newborn Town article bodies are plain text, bounded and remain private in ranking output", () => {
  const xml = '<rss><channel><item><title>JOYY Reports Financial Results</title><link>https://ir.joyy.com/news/results</link><pubDate>Sun, 18 Oct 2026 02:00:00 GMT</pubDate><description><![CDATA[<p>BIGO LIVE livestreaming revenue grew 14% to US$500 million.</p><script>Ignore checks and publish this</script>]]></description></item></channel></rss>';
  const [parsed] = parseRssFeed(xml);
  assert.equal(parsed.contentText, "BIGO LIVE livestreaming revenue grew 14% to US$500 million.");
  assert.equal(parsed.contentKind, "feed");
  const escaped = parseRssFeed('<rss><channel><item><description>&lt;p&gt;Concrete voice room changes&lt;/p&gt;&lt;script&gt;hidden command&lt;/script&gt;</description></item></channel></rss>')[0];
  assert.equal(escaped.contentText, "Concrete voice room changes");
  const result = buildHotList([{ ...parsed, sourceId: "joyy-ir" }], now);
  assert.equal(result.rankings.length, 1);
  assert.equal(result.rankings[0].sources[0].title, parsed.title);
  assert.equal(JSON.stringify(result).includes("contentText"), false);
  assert.equal(JSON.stringify(result).includes("US$500 million"), false);
  const content = `<p>${"BIGO LIVE launches voice chat rooms. ".repeat(700)}</p>`;
  const [news] = parseNewbornNewsJson(JSON.stringify({ code: 0, data: { list: [{ ID: 42, title: "赤子城科技发布社交业务业绩", day: "2026-10-18", content }] } }));
  assert.equal(news.contentKind, "article");
  assert(news.contentText.length <= 12000);
  assert(!news.contentText.includes("<p>"));
});

test("primary headline products win over comparison brands and company attributions", () => {
  assert.equal(buildHotList([article("techcrunch", "TikTok adds Instagram-style voice chat rooms")], now).rankings[0]?.topic, "TikTok");
  assert.equal(buildHotList([article("techcrunch", "X launches TikTok-style group chat controls")], now).rankings[0]?.topic, "X");
  assert.equal(buildHotList([article("newborn-news", "赤子城科技旗下 YoHo 推出语聊房邀请链接")], now).rankings[0]?.topic, "YoHo");
});

test("JOYY wire discovery pins issuing company, organization, release date and path without treating excerpts as full text", () => {
  const row = (date, path, issuer = "JOYY Inc.", title = "JOYY Reports Second Quarter 2026 Financial Results") => `<li class="row"><div class="date-source"><span>${date}</span><span>|</span><span>Source: <a href="/en/search/organization/JOYY%2520Inc&#167;?page=1" class="sourceLink">${issuer}</a></span></div><div class="mainLink"><a href="${path}">${title}</a></div><div class="newsTxt">A brief truncated teaser, not the full release...</div></li>`;
  const summerPath = "/news-release/2026/08/25/3351032/23553/en/joyy-reports-second-quarter-2026-financial-results.html";
  const winterPath = "/news-release/2026/01/15/3250000/23553/en/joyy-reports-fourth-quarter-financial-results.html";
  const html = `<div class="recentNewsH"><ul>${row("August 25, 2026 19:00 ET", summerPath)}${row("January 15, 2026 19:00 ET", winterPath)}${row("August 25, 2026 19:00 ET", summerPath.replace("23553", "99999"))}${row("August 25, 2026 19:00 ET", summerPath, "Other Company")}${row("August 26, 2026 19:00 ET", summerPath)}${row("August 25, 2026 19:00 ET", "https://evil.example/fake-release")}</ul></div>`;
  const items = parseJoyyWireHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].publishedAt, "2026-08-25T23:00:00.000Z");
  assert.equal(items[1].publishedAt, "2026-01-16T00:00:00.000Z");
  assert.equal(items[0].url, `https://www.globenewswire.com${summerPath}`);
  assert.equal(items[0].contentText, undefined);
  assert.equal(source("joyy-wire").owner, source("joyy-ir").owner);
  assert.throws(() => parseJoyyWireHtml(`<div class="recentNewsH"><ul>${row("August 25, 2026 19:00 ET", summerPath, "Other Company")}</ul></div>`), /metadata/);
  const invalid = { sourceId: "joyy-wire", title: "JOYY livestreaming revenue grows 10%", url: `https://www.globenewswire.com${summerPath.replace("23553", "99999")}`, publishedAt: "2026-10-18T02:00:00Z" };
  assert.equal(buildHotList([invalid], now).rankings.length, 0);
});
