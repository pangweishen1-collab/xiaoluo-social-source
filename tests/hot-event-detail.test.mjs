import assert from "node:assert/strict";
import test from "node:test";
import { buildHotQuoteCandidates, extractHotArticleEvidence, fetchHotEventDetail, readHotArticle, reviewHotEventDetail, validateHotEventDetail } from "../shared/hot-event-detail.mjs";

const NOW = new Date("2026-10-19T03:00:00Z");
const DATE = "2026-10-18T08:00:00.000Z";
const URL = "https://www.bigo.tv/news-events/bigo-news/voice-rooms";
const QUOTE = "BIGO LIVE is testing new voice rooms that let hosts approve invited speakers before they join.";
const TITLE = "BIGO LIVE tests voice rooms with speaker approval";
const BODY = `${QUOTE} The test is currently limited to selected markets. Hosts can invite speakers from the audience and decide who joins the conversation. The company has not reported a change in retention or revenue from this test. This release describes the room control mechanism rather than a worldwide release.`;
const STORY = { id: "voice-test", title: TITLE, topic: "BIGO LIVE", publishedAt: DATE, sources: [{ name: "BIGO LIVE 官方新闻", url: URL, kind: "official", publishedAt: DATE }] };
const DETAIL = { eligible: true, titleZh: "BIGO LIVE 测试需主持人批准的语音房", change: "BIGO LIVE 在部分市场测试新语音房，主持人可邀请并批准观众成为发言人。", whyItMatters: "可研究发言审批如何平衡互动参与和房间秩序，并比较主持人采用审批前后的新访客参与情况，具体留存效果仍需验证。", evidenceQuote: QUOTE };
const VERDICT = { approved: true, checks: { articleMatch: true, concreteChange: true, productIdentity: true, dateAccurate: true, numbersAccurate: true, chineseFactsSupported: true, analysisIsQualified: true, socialRelevance: true, evidenceSupportsChange: true }, confirmedTopic: "BIGO LIVE", evidenceQuote: QUOTE, reason: "原文支持测试范围、身份与具体变化，分析为待验证问题" };

function html({ date = DATE, body = BODY, title = TITLE } = {}) {
  return `<html><head><meta property="og:title" content="${title}"><meta property="article:published_time" content="${date}"></head><body><nav>Subscribe to the newsletter</nav><article><h1>${title}</h1><p>${body}</p></article><footer>Footer</footer></body></html>`;
}

function fixtures({ results = [DETAIL, VERDICT], generationResults, document = html() } = {}) {
  const calls = { fetch: [], ai: [] };
  let generationCount = 0;
  return {
    calls,
    fetcher: async (url, options) => { calls.fetch.push([url, options]); return new Response(document, { headers: { "content-type": "text/html; charset=utf-8" } }); },
    ai: { async run(model, input) {
      calls.ai.push({ model, input });
      const generation = input.response_format.json_schema.required.includes("eligible");
      const result = generation ? generationResults?.[generationCount++] ?? results[0] : results[1];
      return { response: JSON.stringify(result) };
    } },
  };
}

test("Chinese generation accepts Qwen chat output and uses a separate reviewer model with the current reference date", async () => {
  const fixture = fixtures();
  const original = fixture.ai.run;
  fixture.ai.run = async (model, input) => {
    const result = await original(model, input);
    return model.includes("qwen") ? { choices: [{ message: { content: result.response } }] } : result;
  };
  const result = await fetchHotEventDetail(STORY, { ...fixture, now: NOW });
  assert.equal(result.status, "ready");
  assert.equal(fixture.calls.ai[0].model, "@cf/qwen/qwen3-30b-a3b-fp8");
  assert.equal(fixture.calls.ai[1].model, "@cf/meta/llama-3.3-70b-instruct-fp8-fast");
  for (const call of fixture.calls.ai) assert.equal(JSON.parse(call.input.messages.at(-1).content).referenceDate, NOW.toISOString());
});

test("the reviewer judges the supplied exact quote without having to recopy it", async () => {
  const { evidenceQuote: ignored, ...verdict } = VERDICT;
  const fixture = fixtures({ results: [DETAIL, verdict] });
  assert.equal((await fetchHotEventDetail(STORY, { ...fixture, now: NOW })).status, "ready");
  for (const value of [false, undefined]) {
    const checks = { ...verdict.checks, evidenceSupportsChange: value };
    const rejected = fixtures({ results: [DETAIL, { ...verdict, checks }] });
    assert.equal((await fetchHotEventDetail(STORY, { ...rejected, now: NOW })).status, "rejected");
  }
});

test("a style-only repair cannot change actor, action or original quote before full semantic review", async () => {
  const fixture = fixtures({ generationResults: [{ ...DETAIL, whyItMatters: "提升用户体验。" }, { ...DETAIL, eligible: false, titleZh: "错误的新标题不可替换原事实", change: "错误的新正文不可替换原事实。" }] });
  const result = await fetchHotEventDetail(STORY, { ...fixture, now: NOW });
  assert.equal(result.status, "ready");
  assert.equal(result.titleZh, DETAIL.titleZh);
  assert.equal(result.change, DETAIL.change);
  assert.equal(result.evidenceQuote, QUOTE);
  assert.equal(fixture.calls.ai.length, 3, "the repaired complete proposal still receives an independent review");
});

test("a newly published article cannot relaunch an explicitly dated old event by choosing a different quote", async () => {
  const title = "BIGO LIVE launches new voice rooms";
  const fixture = fixtures({ document: html({ title, body: `BIGO LIVE launched new voice rooms in November 2025. ${BODY}` }) });
  const result = await fetchHotEventDetail({ ...STORY, title }, { ...fixture, now: NOW });
  assert.equal(result.reason, "detail_rejected_retrospective_event");
  assert.equal(fixture.calls.ai.length, 0, "the time gate precedes generation and cannot be hidden by selecting a newer-looking quote");
});

test("new official financial disclosures may report older metric periods without pretending those periods are new launches", () => {
  const quote = "BIGO LIVE livestreaming revenue increased 12.5% in May 2026 compared with the same period last year.";
  const proposed = { ...DETAIL, titleZh: "JOYY 披露 BIGO LIVE 直播收入增长", change: "JOYY 披露 BIGO LIVE 直播收入在该比较期间增长 12.5%，属于新披露的经营数据。", evidenceQuote: quote };
  assert.ok(validateHotEventDetail(proposed, { sourceUrl: "https://ir.joyy.com/release", title: "JOYY Reports Quarterly Financial Results", publishedAt: DATE, text: quote }, "JOYY"));
});

test("a pinned official results paragraph may identify the issuer through its article while quoting one concrete social metric", () => {
  const quote = "Revenues generated from chatting services in the second quarter of 2026 were US$47.4 million.";
  const article = { sourceUrl: "https://ir.yalla.com/2026-results", title: "Yalla Group Reports Financial Results", publishedAt: DATE, text: quote };
  const proposed = { ...DETAIL, titleZh: "Yalla Group 披露聊天服务季度收入", change: "Yalla Group 披露聊天服务季度收入为 US$47.4 million。", whyItMatters: "聊天收入需与游戏业务分开观察，关注付费用户与客单价的变化，避免只看总营收判断社交业务的经营情况。", evidenceQuote: quote };
  assert.ok(validateHotEventDetail(proposed, article, "Yalla Group"));
  assert.ok(buildHotQuoteCandidates(article, "Yalla Group").some((item) => item.text === quote));
  assert.equal(validateHotEventDetail(proposed, { ...article, sourceUrl: "https://techcrunch.com/results" }, "Yalla Group"), null);
  assert.equal(validateHotEventDetail({ ...proposed, evidenceQuote: "Hardware revenues reached US$47.4 million during the quarter." }, { ...article, text: "Hardware revenues reached US$47.4 million during the quarter." }, "Yalla Group"), null);
});

test("article extraction excludes scripts/navigation and retains original publication date", () => {
  const evidence = extractHotArticleEvidence(html({ body: `${BODY}<script>Injected irrelevant claims.</script>` }));
  assert.equal(evidence.title, TITLE);
  assert.equal(evidence.publishedAt, DATE);
  assert.ok(evidence.text.includes(QUOTE));
  assert.ok(!evidence.text.includes("Injected"));
  assert.ok(!evidence.text.includes("Subscribe"));
  assert.equal(extractHotArticleEvidence(`<head><title>${TITLE}</title></head><body><p>Only a short description.</p></body>`), null);
});

test("JSON-LD article body works without semantic article tags, excluding unrelated graph nodes", () => {
  const article = { "@type": "NewsArticle", headline: TITLE, datePublished: DATE, articleBody: BODY };
  const evidence = extractHotArticleEvidence(`<html><head><script type='application/ld+json'>${JSON.stringify({ "@graph": [{ "@type": "Organization", datePublished: "2001-01-01" }, article] })}</script></head><body><p>Small shell</p></body></html>`);
  assert.deepEqual(evidence, { title: TITLE, text: BODY, publishedAt: DATE });
});

test("dateModified and date-looking descriptions cannot supply a publication date", () => {
  const evidence = extractHotArticleEvidence(html().replace(/<meta property="article:published_time"[^>]+>/u, '<meta property="article:modified_time" content="2026-10-18T08:00:00Z">'));
  assert.equal(evidence.publishedAt, undefined);
});

test("BIGO's visible creation date is accepted but its update/event dates cannot masquerade as publication", () => {
  const document = html({ date: "" }).replace("<article>", '<div class="article-info"><div class="info-item info-item-create"><img src="icon.png"><div class="info">2026-10-18</div></div><div class="info-item info-item-update"><div>2026-10-19</div></div></div><article>');
  assert.equal(extractHotArticleEvidence(document).publishedAt, "2026-10-18T00:00:00.000Z");
  assert.equal(extractHotArticleEvidence(document.replace("info-item-create", "info-item-update")).publishedAt, undefined);
});

test("reader restricts hosts, redirects, media type and body size", async () => {
  const good = fixtures();
  assert.equal((await readHotArticle(URL, { fetcher: good.fetcher, allowedHosts: ["www.bigo.tv"] })).title, TITLE);
  for (const unsafe of ["http://www.bigo.tv/a", "https://127.0.0.1/a", "https://www.bigo.tv.evil.example/a", "https://user:pw@www.bigo.tv/a"]) {
    await assert.rejects(readHotArticle(unsafe, { allowedHosts: ["www.bigo.tv"], fetcher: good.fetcher }), /untrusted_article_url/u);
  }
  await assert.rejects(readHotArticle(URL, { allowedHosts: ["www.bigo.tv"], fetcher: async () => new Response(null, { status: 302, headers: { location: "https://metadata.internal/secrets" } }) }), /untrusted_article_redirect/u);
  await assert.rejects(readHotArticle(URL, { allowedHosts: ["www.bigo.tv"], fetcher: async () => new Response("pdf", { headers: { "content-type": "application/pdf" } }) }), /untrusted_pdf_source/u);
  await assert.rejects(readHotArticle(URL, { allowedHosts: ["www.bigo.tv"], maxBytes: 16, fetcher: good.fetcher }), /article_too_large/u);
});

test("JOYY newswire articles must identify JOYY as the issuer on the original page", async () => {
  const url = "https://www.globenewswire.com/news-release/2026/08/25/3351032/23553/en/joyy-results.html";
  for (const author of ["Another Company", "JOYY Inc."]) {
    const fetcher = async () => new Response(html().replace("</head>", `<meta name="author" content="${author}"></head>`), { headers: { "content-type": "text/html" } });
    const read = readHotArticle(url, { allowedHosts: ["www.globenewswire.com"], fetcher });
    if (author === "JOYY Inc.") assert.equal((await read).author, author);
    else await assert.rejects(read, /original_issuer_mismatch/u);
  }
});

test("only Yalla's fixed original CMS publication marker can supply its missing timestamp", async () => {
  const cases = [
    ["ir.yalla.com", "2026-08-17 17:00:00 EDT", "2026-08-17T21:00:00.000Z"],
    ["ir.yalla.com", "2026-01-17 17:00:00 EST", "2026-01-17T22:00:00.000Z"],
    ["www.bigo.tv", "2026-08-17 17:00:00 EDT", undefined],
    ["ir.yalla.com", "2026-02-30 17:00:00 EST", undefined],
    ["ir.yalla.com", "2026-08-17 17:00:00 EST", undefined],
  ];
  for (const [host, date, expected] of cases) {
    const fetcher = async () => new Response(html({ date: "" }).replace("</head>", `<!-- ITEMDATE: ${date} --></head>`), { headers: { "content-type": "text/html" } });
    const evidence = await readHotArticle(`https://${host}/release`, { allowedHosts: [host], fetcher });
    assert.equal(evidence.publishedAt, expected);
  }
});

test("detail is ready only after extraction and independent semantic review", async () => {
  const fixture = fixtures();
  const result = await fetchHotEventDetail(STORY, { ...fixture, now: NOW });
  assert.equal(result.status, "ready");
  assert.equal(result.titleZh, DETAIL.titleZh);
  assert.equal(result.change, DETAIL.change);
  assert.equal(result.whyItMatters, DETAIL.whyItMatters);
  assert.equal(result.evidenceQuote, QUOTE);
  assert.equal(result.sourcePublishedAt, DATE);
  assert.equal(fixture.calls.ai.length, 2);
  assert.equal(fixture.calls.fetch.length, 1);
  assert.ok(fixture.calls.ai.every(({ input }) => input.temperature === 0 && input.response_format.type === "json_schema"));
  assert.match(fixture.calls.ai[1].input.messages[0].content, /Independently verify/u);
});

test("invented quotes, unsupported numbers and wrong product identity are rejected before review", async () => {
  for (const change of [
    { evidenceQuote: "BIGO LIVE announced 20% higher retention across every country in the world." },
    { change: "BIGO LIVE 测试新语音房，已经使平台收入提升了 20%。" },
    { titleZh: "BIGO LIVE 全球推出语音房", whyItMatters: "这项功能必将大幅提升留存，并颠覆行业。" },
  ]) {
    const fixture = fixtures({ results: [{ ...DETAIL, ...change }, VERDICT] });
    const result = await fetchHotEventDetail(STORY, { ...fixture, now: NOW });
    assert.equal(result.status, "rejected");
    assert.equal(result.change, undefined);
    assert.equal(fixture.calls.ai.length, 2);
  }
  assert.equal(validateHotEventDetail(DETAIL, { title: TITLE, text: BODY }, "Yalla"), null);
});

test("source dates must be original, within the retention window and match discovery record", async () => {
  for (const [date, expected] of [["", "original_date_unverified"], ["2026-10-20T08:00:00Z", "original_date_unverified"], ["2026-05-18T08:00:00Z", "original_date_unverified"], ["2026-10-10T08:00:00Z", "original_date_mismatch"]]) {
    const fixture = fixtures({ document: html({ date }) });
    const result = await fetchHotEventDetail(STORY, { ...fixture, now: NOW });
    assert.equal(result.status, "unavailable");
    assert.equal(result.reason, expected);
    assert.equal(fixture.calls.ai.length, 0);
  }
});

test("a single failed independent check never exposes the proposed copy", async () => {
  const fixture = fixtures({ results: [DETAIL, { ...VERDICT, checks: { ...VERDICT.checks, dateAccurate: false } }] });
  const result = await fetchHotEventDetail(STORY, { ...fixture, now: NOW });
  assert.deepEqual(result, { status: "rejected", reason: "detail_review_rejected" });
});

test("model output is untrusted even when a verdict claims approved", async () => {
  for (const review of [
    { ...VERDICT, confirmedTopic: "Yalla" },
    { ...VERDICT, evidenceQuote: "A made-up quote describing the product update from another article." },
    { approved: true, checks: { articleMatch: true } },
  ]) {
    const fixture = fixtures({ results: [DETAIL, review] });
    assert.equal((await fetchHotEventDetail(STORY, { ...fixture, now: NOW })).status, "rejected");
  }
});

test("shared article cache avoids duplicate network reads without bypassing AI review", async () => {
  const fixture = fixtures();
  const articleCache = new Map([[URL, Promise.resolve({ sourceUrl: URL, title: TITLE, text: BODY, publishedAt: DATE })]]);
  const result = await fetchHotEventDetail(STORY, { ...fixture, articleCache, now: NOW });
  assert.equal(result.status, "ready");
  assert.equal(fixture.calls.fetch.length, 0);
  assert.equal(fixture.calls.ai.length, 2);
});

test("a legal publisher redirect preserves the original ranked source link in the public detail", async () => {
  const fixture = fixtures();
  const articleCache = new Map([[URL, { sourceUrl: `${URL}?canonical=1`, title: TITLE, text: BODY, publishedAt: DATE }]]);
  const result = await fetchHotEventDetail(STORY, { ...fixture, articleCache, now: NOW });
  assert.equal(result.status, "ready");
  assert.equal(result.sourceUrl, URL);
});

test("specific short official store release notes may be reviewed, while evergreen store copy cannot", async () => {
  const source = { name: "BIGO LIVE · App Store", url: "https://apps.apple.com/us/app/id1077137248", publishedAt: DATE, kind: "official" };
  const story = { ...STORY, sources: [source] };
  const text = `${QUOTE} Selected markets only.`;
  assert.ok(text.length >= 80 && text.length < 180);
  for (const [contentKind, expected, callCount] of [["release-notes", "ready", 2], ["description", "unavailable", 0]]) {
    const fixture = fixtures();
    const articleCache = new Map([[source.url, { title: TITLE, text, publishedAt: DATE, sourceUrl: source.url, contentKind }]]);
    const result = await fetchHotEventDetail(story, { ...fixture, articleCache, now: NOW });
    assert.equal(result.status, expected);
    assert.equal(fixture.calls.ai.length, callCount);
  }
});

test("AI outage returns unavailable rather than a headline-based fallback", async () => {
  const missing = await fetchHotEventDetail(STORY, { now: NOW });
  assert.deepEqual(missing, { status: "unavailable", reason: "detail_ai_unavailable" });
  const fixture = fixtures();
  const result = await fetchHotEventDetail(STORY, { ...fixture, ai: { async run() { throw new Error("detail_ai_unavailable"); } }, now: NOW });
  assert.equal(result.status, "unavailable");
  assert.equal(result.change, undefined);
});

test("provider quota exhaustion stops before attempting a second original source", async () => {
  const fixture = fixtures(); let calls = 0;
  const story = { ...STORY, sources: [...STORY.sources, { ...STORY.sources[0], url: `${URL}-second` }] };
  const result = await fetchHotEventDetail(story, { ...fixture, ai: { async run() { calls += 1; throw new Error("4006: free allocation of 10,000 neurons exhausted"); } }, now: NOW });
  assert.equal(result.status, "unavailable"); assert.match(result.reason, /4006/);
  assert.equal(calls, 1); assert.equal(fixture.calls.fetch.length, 1);
});

test("a long literal quote is shortened at an existing word boundary and reviewed again", async () => {
  const longQuote = `${QUOTE} The test is currently limited to selected markets.`;
  const fixture = fixtures({ results: [{ ...DETAIL, evidenceQuote: longQuote }, VERDICT] });
  const result = await fetchHotEventDetail(STORY, { ...fixture, now: NOW });
  assert.equal(result.status, "ready");
  assert.ok(result.evidenceQuote.split(/\s+/u).length <= 25);
  assert.ok(BODY.includes(result.evidenceQuote));
  assert.equal(fixture.calls.ai.length, 2);
  const reviewed = JSON.parse(fixture.calls.ai[1].input.messages[1].content).proposed;
  assert.equal(reviewed.evidenceQuote, result.evidenceQuote);
});

test("a reviewer can reject a shortened quote that does not prove the concrete change", async () => {
  const fixture = fixtures({ results: [{ ...DETAIL, evidenceQuote: `${QUOTE} The test is currently limited to selected markets.` }, { ...VERDICT, checks: { ...VERDICT.checks, concreteChange: false } }] });
  assert.equal((await fetchHotEventDetail(STORY, { ...fixture, now: NOW })).status, "rejected");
});

test("Facebook algorithm copy cannot borrow unrelated room/gifting analysis from the extraction prompt", async () => {
  const title = "Facebook gives users control over Feed and Reels recommendations";
  const text = "New AI-powered tools let you tell Facebook, in your own words, what you want to see in Feed and Reels. Users can tell the platform which topics to see more or less of, and can adjust the way recommendations respond to their interests. This feature uses written instructions to tune the content recommendation system.";
  const proposed = { eligible: true, titleZh: "Facebook 允许用户用自然语言调整信息流推荐", change: "Facebook 允许用户写下想多看或少看的内容主题，调整 Feed 和 Reels 中的信息推荐。", whyItMatters: "可关注这一功能如何影响入房门槛和礼物转化，以及算法的有效性。", evidenceQuote: "New AI-powered tools let you tell Facebook, in your own words, what you want to see in Feed and Reels" };
  const fixture = fixtures({ results: [proposed, { ...VERDICT, confirmedTopic: "Facebook" }], document: html({ title, body: text }) });
  const result = await fetchHotEventDetail({ ...STORY, title, topic: "Facebook" }, { ...fixture, now: NOW });
  assert.deepEqual(result, { status: "rejected", reason: "detail_rejected_analysis_unrelated" });
  assert.equal(fixture.calls.ai.length, 2);
});

test("an empty new-feature title is refused even when its summary is specific", async () => {
  const fixture = fixtures({ results: [{ ...DETAIL, titleZh: "BIGO LIVE 算法新功能" }, VERDICT] });
  const result = await fetchHotEventDetail(STORY, { ...fixture, now: NOW });
  assert.deepEqual(result, { status: "rejected", reason: "detail_rejected_title_vague" });
});

test("TikTok allegations must remain attributed in both the title and concrete-change sentence", async () => {
  const title = "New York alleges TikTok gave teens a placebo safety feature";
  const quote = "TikTok gave teens and children access to a placebo safety feature instead of a real one";
  const text = `A new lawsuit alleges that ${quote}. The complaint concerns a feature called Algo Refresh and says users believed it had changed the recommendations shown in their feeds. TikTok has disputed the complaint and the case has not established that the allegations are true.`;
  const proposed = { eligible: true, titleZh: "纽约州指控 TikTok 向青少年提供形同虚设的安全功能", change: "TikTok 向青少年提供了形同虚设的安全功能，信息流内容并未因该工具发生变化。", whyItMatters: "可关注平台如何解释安全工具的实际作用，以及用户能否验证推荐结果的变化。", evidenceQuote: quote };
  const fixture = fixtures({ results: [proposed, { ...VERDICT, confirmedTopic: "TikTok", evidenceQuote: quote }], document: html({ title, body: text }) });
  const result = await fetchHotEventDetail({ ...STORY, title, topic: "TikTok" }, { ...fixture, now: NOW });
  assert.deepEqual(result, { status: "rejected", reason: "detail_rejected_allegation_lost" });
  assert.equal(fixture.calls.ai.length, 2);
});

test("test and planned product changes cannot become completed releases", async () => {
  const testing = fixtures({ results: [{ ...DETAIL, change: "BIGO LIVE 已在部分市场推出新语音房，主持人可邀请并批准观众发言。" }, VERDICT] });
  assert.equal((await fetchHotEventDetail(STORY, { ...testing, now: NOW })).reason, "detail_rejected_testing_status_lost");
  const title = "BIGO LIVE plans to launch voice rooms with speaker approval";
  const planning = fixtures({ results: [{ ...DETAIL, titleZh: "BIGO LIVE 将推出发言审批语音房", change: "BIGO LIVE 已推出新语音房，主持人可邀请并批准观众成为发言人。", evidenceQuote: QUOTE.replace("is testing", "plans to launch") }, VERDICT], document: html({ title, body: BODY.replace("is testing", "plans to launch") }) });
  assert.equal((await fetchHotEventDetail({ ...STORY, title }, { ...planning, now: NOW })).reason, "detail_rejected_planned_status_lost");
});

test("diagnostic reason codes distinguish missing quotes and invented numbers without exposing copy", async () => {
  for (const [override, reason] of [[{ evidenceQuote: "This sentence never appeared in the original article body." }, "detail_rejected_quote_not_in_body"], [{ change: "BIGO LIVE 在部分市场测试新语音房，收入已经提升 20%。" }, "detail_rejected_numbers_unsupported"]]) {
    const fixture = fixtures({ results: [{ ...DETAIL, ...override }, VERDICT] });
    assert.deepEqual(await fetchHotEventDetail(STORY, { ...fixture, now: NOW }), { status: "rejected", reason: reason === "detail_rejected_numbers_unsupported" ? `${reason}[20]` : reason });
  }
});

test("literal promotional quotes cannot substitute for the subject and core event action", async () => {
  const title = "TikTok partners with a studio to produce creator-led micro-series";
  for (const [quote, reason] of [["Micro-series are pioneering a new language of storytelling", "detail_rejected_quote_subject_missing"], ["TikTok micro-series are pioneering a new language of storytelling", "detail_rejected_quote_core_action_missing"]]) {
    const proposed = { ...DETAIL, titleZh: "TikTok 与制片工作室合作制作创作者微剧", change: "TikTok 与制片工作室合作制作微剧，首批项目将围绕创作者和粉丝的互动展开。", evidenceQuote: quote };
    const fixture = fixtures({ results: [proposed, { ...VERDICT, confirmedTopic: "TikTok", evidenceQuote: quote }], document: html({ title, body: `${quote}. ${BODY}` }) });
    assert.deepEqual(await fetchHotEventDetail({ ...STORY, title, topic: "TikTok" }, { ...fixture, now: NOW }), { status: "rejected", reason });
    assert.equal(fixture.calls.ai.length, 2);
    const feedback = JSON.parse(fixture.calls.ai[1].input.messages[1].content).validationFeedback;
    assert.equal(feedback.code, reason.replace("detail_rejected_", ""));
    assert.ok(feedback.correction.length > 20);
  }
});

test("Orkut AI commentary does not prove the founder's revival plan", async () => {
  const title = "Remember Orkut? Its founder wants to bring it back";
  const quote = "Orkut says artificial intelligence is extraordinary technology, but it dissolves the premise that made social networking worth building";
  const proposed = { ...DETAIL, titleZh: "Orkut 创始人希望重启社交平台", change: "Orkut 创始人希望重启社交平台，并向旧用户发出支持新平台筹备工作的呼吁。", evidenceQuote: quote };
  const fixture = fixtures({ results: [proposed, { ...VERDICT, confirmedTopic: "Orkut", evidenceQuote: quote }], document: html({ title, body: `${quote}. ${BODY}` }) });
  assert.equal((await fetchHotEventDetail({ ...STORY, title, topic: "Orkut" }, { ...fixture, now: NOW })).reason, "detail_rejected_quote_core_action_missing");
});

test("a core-company result can quote its clearly identified product without inventing a second issuer", () => {
  const quote = "AI-generated interactive gifts accounted for 34.3% of virtual gift consumption on Bigo Live in May 2026";
  const value = { ...DETAIL, titleZh: "JOYY 披露 Bigo Live 的 AI 互动礼物消费占比", change: "JOYY 披露，2026 年五月 Bigo Live 的 AI 互动礼物占虚拟礼物消费的 34.3%。", whyItMatters: "可研究互动礼物的消费构成如何变化，并比较新礼物的使用频次与原有礼物，验证消费占比是否伴随新增付费行为。", evidenceQuote: quote };
  assert.ok(validateHotEventDetail(value, { title: "JOYY Reports Second Quarter 2026 Financial Results", text: `${quote}. JOYY disclosed operating results in its official report.` }, "JOYY"));
});

test("a launch headline cannot use a generic real-test opinion as evidence of the launch", () => {
  const title = "BBC News launches YouTube live stream as broadcasters test platform distribution";
  const fact = "BBC News began a 24-hour live stream on YouTube in the UK and US on October 15";
  const opinion = "The real test is whether going to YouTube actually solves the audience erosion problem, or whether it just relocates it.";
  const article = { title, text: `${fact}. News consumption has already shifted. ${opinion}` };
  const proposed = { eligible: true, titleZh: "BBC News 在 YouTube 推出全天直播流", change: "BBC News 在英国和美国推出 YouTube 全天直播流，新增平台内直播观看入口。", whyItMatters: "全天直播流把内容分发交给 YouTube 推荐，需观察新增观看是否来自年轻受众，而不是原有观众的入口迁移。", evidenceQuote: opinion };
  assert.equal(validateHotEventDetail(proposed, article, "YouTube"), null);
  assert.ok(validateHotEventDetail({ ...proposed, evidenceQuote: fact }, article, "YouTube"));
  const candidates = buildHotQuoteCandidates(article, "YouTube");
  assert.ok(candidates.some((candidate) => candidate.text.includes("began a 24-hour live stream")));
  assert.ok(!candidates.some((candidate) => candidate.text === opinion));
});

test("introduction evidence still accepts official invite and let capability wording", () => {
  for (const quote of ["With guest calling, you can now invite anyone to join a WhatsApp call.", "Guest calling lets anyone join a WhatsApp call without registering an account."]) {
    const article = { title: "WhatsApp introduces guest calling", text: `${quote} Guests do not need a WhatsApp account to join a call.` };
    const proposed = { eligible: true, titleZh: "WhatsApp 推出无需账户的访客通话", change: "WhatsApp 访客通话允许未注册账户的用户通过邀请加入通话。", whyItMatters: "通话邀请不再要求对方先注册账户，降低接通门槛；需观察临时访客的身份提示和骚扰拦截能否跟上。", evidenceQuote: quote };
    assert.ok(validateHotEventDetail(proposed, article, "WhatsApp"));
    assert.ok(buildHotQuoteCandidates(article, "WhatsApp").length);
  }
});

test("financial change copy rejects process commentary and repairs into supported metrics before review", async () => {
  const title = "Newborn Town Reports Interim Financial Results";
  const quote = "Newborn Town social networking revenue increased 25.0% to RMB1,000 million.";
  const document = html({ title, body: `${quote} ${"The report details the social products and their operating performance during the financial period. ".repeat(4)}` });
  const base = { eligible: true, titleZh: "Newborn Town 披露社交业务收入增长", change: "Newborn Town 社交业务收入增长 25.0%，达到 RMB1,000 million。", whyItMatters: "社交收入增长需结合付费用户与客单价观察，分清新增用户和既有用户付费变化，避免只凭总收入判断增长质量。", evidenceQuote: quote };
  const bad = { ...base, change: "社交业务收入数据来自当期财报，未提及具体测试或计划状态。" };
  assert.equal(validateHotEventDetail(bad, { title, text: quote }, "Newborn Town"), null);
  assert.ok(validateHotEventDetail(base, { title, text: quote }, "Newborn Town"));
  const fixture = fixtures({ document, generationResults: [bad, base], results: [base, { ...VERDICT, confirmedTopic: "Newborn Town", evidenceQuote: quote }] });
  const story = { ...STORY, title, topic: "Newborn Town" };
  const result = await fetchHotEventDetail(story, { ...fixture, now: NOW });
  assert.equal(result.status, "ready");
  assert.equal(result.change, base.change);
  assert.equal(fixture.calls.ai.length, 3);
  const retry = JSON.parse(fixture.calls.ai[1].input.messages.at(-1).content);
  assert.equal(retry.validationFeedback.code, "change_editorial_meta");
  assert.match(retry.validationFeedback.correction, /实质产品动作/u);
});

test("one targeted regeneration can repair a nonliteral quote and still requires independent review", async () => {
  const bad = { ...DETAIL, evidenceQuote: "BIGO LIVE now lets hosts approve every audience member for a new voice experience." };
  const fixture = fixtures({ generationResults: [bad, DETAIL] });
  const result = await fetchHotEventDetail(STORY, { ...fixture, now: NOW });
  assert.equal(result.status, "ready");
  assert.equal(fixture.calls.ai.length, 3);
  const request = JSON.parse(fixture.calls.ai[1].input.messages[1].content);
  assert.equal(request.validationFeedback.code, "quote_not_in_body");
  assert.match(request.validationFeedback.correction, /逐字/u);
  assert.deepEqual(request.previousProposal, bad);
  assert.ok(fixture.calls.ai[2].input.response_format.json_schema.required.includes("approved"));
});

test("repeated review failure is bounded to two generations and two reviews", async () => {
  const fixture = fixtures({ results: [DETAIL, { ...VERDICT, checks: { ...VERDICT.checks, chineseFactsSupported: false } }] });
  assert.equal((await fetchHotEventDetail(STORY, { ...fixture, now: NOW })).status, "rejected");
  assert.equal(fixture.calls.ai.length, 4);
  const request = JSON.parse(fixture.calls.ai[2].input.messages[1].content);
  assert.equal(request.validationFeedback.code, "detail_review_rejected");
  assert.deepEqual(request.validationFeedback.failedChecks, ["chineseFactsSupported"]);
});

test("generic industry reflection cannot satisfy a concrete operational why", async () => {
  const proposed = { ...DETAIL, whyItMatters: "值得观察这一产品是否能够成功挑战现有社交平台，并引发人们对社交媒体发展方向和故事讲述语言的重新思考。" };
  const fixture = fixtures({ results: [proposed, VERDICT] });
  assert.equal((await fetchHotEventDetail(STORY, { ...fixture, now: NOW })).reason, "detail_rejected_analysis_vague");
});

test("literal quote candidates retain names, punctuation and core actions rather than promotional views", () => {
  const title = "TikTok partners with Made By Us Studios to produce creator-led micro-series";
  const quote = "TikTok has entered a strategic partnership with Made By Us Studios™ to co-produce premium, creator-led vertical micro-series.";
  const text = `${quote} This new collaboration will feature creator-led stories. Micro-series are pioneering a new language of storytelling. The studio will work with TikTok on the production and distribution of the programs.`;
  const candidates = buildHotQuoteCandidates({ title, text }, "TikTok", title);
  assert.ok(candidates.length > 0);
  assert.equal(candidates[0].text, quote);
  assert.ok(candidates.every((item) => text.includes(item.text) && item.text.match(/[A-Za-z\d]+(?:['’-][A-Za-z\d]+)*/gu).length <= 25));
  assert.ok(candidates.every((item) => !item.text.startsWith("Micro-series are pioneering")));
});

test("the model selects an existing quote ID and the literal is filled without retyping", async () => {
  const article = extractHotArticleEvidence(html());
  const candidate = buildHotQuoteCandidates(article, STORY.topic, STORY.title)[0];
  const fixture = fixtures({ results: [{ ...DETAIL, quoteId: candidate.id, evidenceQuote: "The model paraphrased this incorrectly, but selected a valid original quote ID." }, VERDICT] });
  const result = await fetchHotEventDetail(STORY, { ...fixture, now: NOW });
  assert.equal(result.status, "ready");
  assert.equal(result.evidenceQuote, candidate.text);
  const input = JSON.parse(fixture.calls.ai[0].input.messages[1].content);
  assert.equal(input.quoteCandidates.find((item) => item.id === candidate.id).text, candidate.text);
  assert.equal(input.sourceStatusRequirements.testingRequired, true);
});

test("planned-state repair identifies the missing field instead of repeating a blind prompt", async () => {
  const title = "BIGO LIVE plans to launch voice rooms with speaker approval";
  const quote = QUOTE.replace("is testing", "plans to launch");
  const bad = { ...DETAIL, titleZh: "BIGO LIVE 将推出发言审批语音房", change: "BIGO LIVE 已推出新语音房，主持人可邀请并批准观众成为发言人。", evidenceQuote: quote };
  const good = { ...bad, change: "BIGO LIVE 将推出新语音房，主持人可邀请并批准观众成为发言人。" };
  const fixture = fixtures({ generationResults: [bad, good], results: [DETAIL, { ...VERDICT, evidenceQuote: quote }], document: html({ title, body: BODY.replace("is testing", "plans to launch") }) });
  const result = await fetchHotEventDetail({ ...STORY, title }, { ...fixture, now: NOW });
  assert.equal(result.status, "ready");
  const repair = JSON.parse(fixture.calls.ai[1].input.messages[1].content);
  assert.equal(repair.sourceStatusRequirements.plannedRequired, true);
  assert.deepEqual(repair.validationFeedback.missingFields, ["change"]);
  assert.equal(repair.validationFeedback.requiredInEachField, "将/计划/希望");
});

test("a source without a named concrete event exposes an empty candidate list", () => {
  assert.deepEqual(buildHotQuoteCandidates({ title: "Thoughts on AI", text: "Artificial intelligence is extraordinary technology and micro-series are a new language of storytelling." }, "TikTok"), []);
});

test("exact decimal currency scale translations are supported without rounding or exchange rates", () => {
  const article = { title: TITLE, text: `${BODY} BIGO LIVE reported revenue of US$422.7 million from its social business.` };
  const change = (amount) => ({ ...DETAIL, change: `BIGO LIVE 在部分市场测试新语音房，并披露社交业务收入为 ${amount}。` });
  for (const amount of ["4.227亿美元", "42,270万美元", "422700000美元", "USD 0.4227 billion"]) {
    assert.ok(validateHotEventDetail(change(amount), article, STORY.topic), amount);
  }
  for (const amount of ["4.228亿美元", "4.23亿美元", "4.227亿元人民币", "人民币4.227亿元", "4.227亿港元", "4.227%", "4.227亿用户"]) {
    assert.equal(validateHotEventDetail(change(amount), article, STORY.topic), null, amount);
  }
});

test("generic counts may translate explicit million/thousand units but never inherit a monetary quantity", () => {
  const article = { title: TITLE, text: `${BODY} BIGO LIVE reported 42.27 million users and US$422.7 million in revenue.` };
  const change = (count) => ({ ...DETAIL, change: `BIGO LIVE 在部分市场测试新语音房，平台有 ${count}。` });
  for (const count of ["4227万用户", "0.4227亿用户", "42,270千用户"]) assert.ok(validateHotEventDetail(change(count), article, STORY.topic), count);
  for (const count of ["4228万用户", "4.227亿用户", "0.4227亿美元"]) assert.equal(validateHotEventDetail(change(count), article, STORY.topic), null, count);
});

test("HKD and RMB exact scaling stays inside its original currency", () => {
  const article = { title: TITLE, text: `${BODY} BIGO LIVE recorded HK$123.45 million and RMB67.89 million for the stated categories.` };
  const change = (amount) => ({ ...DETAIL, change: `BIGO LIVE 在部分市场测试新语音房，披露有关类别的收入为 ${amount}。` });
  assert.ok(validateHotEventDetail(change("1.2345亿港元"), article, STORY.topic));
  assert.ok(validateHotEventDetail(change("6789万元人民币"), article, STORY.topic));
  assert.equal(validateHotEventDetail(change("1.2345亿美元"), article, STORY.topic), null);
  assert.equal(validateHotEventDetail(change("6789万美元"), article, STORY.topic), null);
});

test("exact decimal scaling does not round large coefficients or change negative signs", () => {
  const article = { title: TITLE, text: `${BODY} BIGO LIVE recorded US$9007199254.740993 million and a change of -US$422.7 million.` };
  const change = (amount) => ({ ...DETAIL, change: `BIGO LIVE 在部分市场测试新语音房，披露有关类别的数据为 ${amount}。` });
  assert.ok(validateHotEventDetail(change("90071992.54740993亿美元"), article, STORY.topic));
  assert.equal(validateHotEventDetail(change("90071992.54740994亿美元"), article, STORY.topic), null);
  assert.ok(validateHotEventDetail(change("-4.227亿美元"), article, STORY.topic));
  assert.equal(validateHotEventDetail(change("4.227亿美元"), article, STORY.topic), null);
});

const REVIEW_PROPOSAL = { ...DETAIL, status: "ready", sourceUrl: URL, sourceName: STORY.sources[0].name, sourcePublishedAt: DATE };

test("review-only re-reads the exact original and makes one reviewer call with no generation or rewriting", async () => {
  const fixture = fixtures();
  const proposal = { ...REVIEW_PROPOSAL, eligible: false, sourceTitle: "Untrusted supplied metadata", verifiedAt: "2000-01-01T00:00:00Z" };
  const result = await reviewHotEventDetail(STORY, proposal, { ...fixture, now: NOW, articleCache: new Map([[URL, { sourceUrl: URL, title: "Fake cached title", text: "Fake cached body", publishedAt: DATE }]]) });
  assert.equal(result.status, "ready");
  assert.equal(result.titleZh, DETAIL.titleZh);
  assert.equal(result.change, DETAIL.change);
  assert.equal(result.whyItMatters, DETAIL.whyItMatters);
  assert.equal(result.evidenceQuote, QUOTE);
  assert.equal(result.sourceTitle, STORY.title);
  assert.equal(result.sourcePublishedAt, DATE);
  assert.equal(result.verifiedAt, NOW.toISOString());
  assert.equal(fixture.calls.fetch.length, 1);
  assert.equal(fixture.calls.fetch[0][0], URL);
  assert.equal(fixture.calls.ai.length, 1);
  assert.ok(fixture.calls.ai[0].input.response_format.json_schema.required.includes("approved"));
  assert.ok(!fixture.calls.ai[0].model.includes("qwen"));
  assert.match(fixture.calls.ai[0].input.messages[0].content, /optional versus mandatory/u);
  assert.match(JSON.parse(fixture.calls.ai[0].input.messages[1].content).originalArticleText, /new voice rooms/u);
});

test("review-only blocks wrong source, original date, quote and new numeric claims before review", async () => {
  for (const [override, reason, fetched] of [
    [{ sourceUrl: "https://about.fb.com/an-unlisted-source" }, "detail_rejected_source_mismatch", 0],
    [{ sourcePublishedAt: "2026-10-17T08:00:00.000Z" }, "detail_rejected_source_date_mismatch", 1],
    [{ evidenceQuote: "BIGO LIVE made up a completely different feature unavailable in this original article." }, "detail_rejected_quote_not_in_body", 1],
    [{ change: "BIGO LIVE 在部分市场测试新语音房，房间收入提升了 20%。" }, "detail_rejected_numbers_unsupported", 1],
  ]) {
    const fixture = fixtures();
    const result = await reviewHotEventDetail(STORY, { ...REVIEW_PROPOSAL, ...override }, { ...fixture, now: NOW });
    assert.deepEqual(result, { status: "rejected", reason });
    assert.equal(fixture.calls.fetch.length, fetched);
    assert.equal(fixture.calls.ai.length, 0);
  }
});

test("review-only ignores a previously cached article and cannot switch to another source on mismatch", async () => {
  const fixture = fixtures({ document: html({ body: BODY.replace(QUOTE, "BIGO LIVE introduced another version of its feature, without the quoted sentence being present on this page.") }) });
  const story = { ...STORY, sources: [...STORY.sources, { name: "Meta Newsroom", url: "https://about.fb.com/another-article", publishedAt: DATE }] };
  const articleCache = new Map([[URL, { sourceUrl: URL, title: TITLE, text: BODY, publishedAt: DATE }]]);
  assert.equal((await reviewHotEventDetail(story, REVIEW_PROPOSAL, { ...fixture, articleCache, now: NOW })).reason, "detail_rejected_quote_not_in_body");
  assert.equal(fixture.calls.fetch.length, 1);
  assert.equal(fixture.calls.fetch[0][0], URL);
  assert.equal(fixture.calls.ai.length, 0);
});

test("review-only fails closed after one independent rejection without exposing the proposed copy", async () => {
  const fixture = fixtures({ results: [DETAIL, { ...VERDICT, checks: { ...VERDICT.checks, chineseFactsSupported: false } }] });
  assert.deepEqual(await reviewHotEventDetail(STORY, REVIEW_PROPOSAL, { ...fixture, now: NOW }), { status: "rejected", reason: "detail_review_rejected" });
  assert.equal(fixture.calls.ai.length, 1);
  assert.equal(fixture.calls.fetch.length, 1);
});

test("review-only detects a repackaged old event before an alternate quote can conceal its date", async () => {
  const title = "TikTok removes Instagram links from profiles";
  const old = "TikTok removed Instagram links in November 2025, leaving one website field for creators.";
  const alternative = "TikTok now provides only one website field for creator profiles.";
  const fixture = fixtures({ document: html({ title, body: `${old} ${alternative} ${BODY}` }) });
  const proposal = { ...REVIEW_PROPOSAL, titleZh: "TikTok 移除主页中的 Instagram 外链", change: "TikTok 移除主页中的 Instagram 外链，仅保留一个网站字段。", evidenceQuote: alternative };
  assert.deepEqual(await reviewHotEventDetail({ ...STORY, title, topic: "TikTok" }, proposal, { ...fixture, now: NOW }), { status: "rejected", reason: "detail_rejected_retrospective_event" });
  assert.equal(fixture.calls.ai.length, 0);
});

const PDF_URL = "https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0825/2026082501387.pdf";
const PDF_SOURCE = { name: "赤子城科技投资者关系", url: PDF_URL, publishedAt: "2026-08-25" };
const PDF_QUOTE = "Newborn Town social networking revenue increased 25.0% to RMB1,000 million.";
const PDF_MARKDOWN = `# NEWBORN TOWN INC.\n(Stock Code: 9911)\n# ANNOUNCEMENT OF INTERIM RESULTS FOR THE SIX MONTHS ENDED 30 JUNE 2026\n${PDF_QUOTE}\n${"The company describes social business operating results and user activity for the reporting period. ".repeat(240)}\nBy order of the Board\nNewborn Town Inc.\nLIU Chunhe\nChairman\nBeijing, 25 August 2026`;
const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\nmock-document\n%%EOF");

test("registered HKEX PDF conversion validates full issuer/footer before keeping a bounded article body", async () => {
  let conversionCalls = 0;
  const article = await readHotArticle(PDF_URL, {
    allowedHosts: ["www1.hkexnews.hk"], source: PDF_SOURCE,
    fetcher: async () => new Response(PDF_BYTES, { headers: { "content-type": "application/pdf" } }),
    pdfConverter: async ({ name, blob }) => {
      conversionCalls += 1;
      assert.equal(name, "2026082501387.pdf");
      assert.equal(blob.type, "application/pdf");
      assert.equal(blob.size, PDF_BYTES.byteLength);
      return PDF_MARKDOWN;
    },
  });
  assert.equal(conversionCalls, 1);
  assert.equal(article.author, "Newborn Town Inc.");
  assert.equal(article.publishedAt, "2026-08-25T00:00:00.000Z");
  assert.match(article.title, /ENDED 30 JUNE 2026/u);
  assert.equal(article.contentKind, "article");
  assert.equal(article.text.length, 18_000);
  assert.ok(article.text.includes(PDF_QUOTE));
  assert.ok(!article.text.includes("By order of the Board"));
});

test("HKEX PDF rejects wrong issuer, stock code, signing date and missing signing block", async () => {
  for (const [markdown, reason] of [
    [PDF_MARKDOWN.replaceAll("NEWBORN TOWN INC.", "OTHER COMPANY INC.").replaceAll("Newborn Town Inc.", "Other Company Inc."), "pdf_issuer_mismatch"],
    [PDF_MARKDOWN.replace("Stock Code: 9911", "Stock Code: 1234"), "pdf_issuer_mismatch"],
    [PDF_MARKDOWN.replace("Beijing, 25 August 2026", "Beijing, 26 August 2026"), "pdf_publication_date_mismatch"],
    [PDF_MARKDOWN.replace("By order of the Board", "Other date information"), "pdf_publication_date_mismatch"],
    [PDF_MARKDOWN.replace("Beijing, 25 August 2026", "Beijing, 30 June 2026"), "pdf_publication_date_mismatch"],
  ]) {
    await assert.rejects(readHotArticle(PDF_URL, { allowedHosts: ["www1.hkexnews.hk"], source: PDF_SOURCE, fetcher: async () => new Response(PDF_BYTES, { headers: { "content-type": "application/pdf" } }), pdfConverter: async () => markdown }), new RegExp(reason, "u"));
  }
});

test("HKEX PDF permits only the registered issuer feed and a calendar-valid URL matching its feed day", async () => {
  for (const [url, source] of [[PDF_URL, { ...PDF_SOURCE, name: "BIGO LIVE 官方新闻" }], [PDF_URL, { ...PDF_SOURCE, publishedAt: "2026-08-26" }], [PDF_URL.replace("2026/0825/", "2026/0826/"), PDF_SOURCE], [PDF_URL.replace("0825/20260825", "0230/20260230"), PDF_SOURCE]]) {
    let calls = 0;
    await assert.rejects(readHotArticle(url, { allowedHosts: ["www1.hkexnews.hk"], source: { ...source, url }, fetcher: async () => { calls += 1; throw new Error("must_not_fetch"); }, pdfConverter: async () => PDF_MARKDOWN }), /untrusted_pdf_source/u);
    assert.equal(calls, 0);
  }
});

test("HKEX PDF rejects non-PDF bytes, oversized streams and conversion failures", async () => {
  const options = { allowedHosts: ["www1.hkexnews.hk"], source: PDF_SOURCE, pdfConverter: async () => PDF_MARKDOWN };
  await assert.rejects(readHotArticle(PDF_URL, { ...options, fetcher: async () => new Response("<html>not a PDF</html>", { headers: { "content-type": "application/pdf" } }) }), /invalid_pdf_document/u);
  await assert.rejects(readHotArticle(PDF_URL, { ...options, fetcher: async () => new Response(PDF_BYTES, { headers: { "content-type": "application/pdf", "content-length": String(2 * 1024 * 1024 + 1) } }) }), /article_too_large/u);
  await assert.rejects(readHotArticle(PDF_URL, { ...options, fetcher: async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1), { headers: { "content-type": "application/pdf" } }) }), /article_too_large/u);
  await assert.rejects(readHotArticle(PDF_URL, { ...options, fetcher: async () => new Response(PDF_BYTES, { headers: { "content-type": "application/pdf" } }), pdfConverter: async () => { throw new Error("converter_down"); } }), /pdf_conversion_failed/u);
  await assert.rejects(readHotArticle(PDF_URL, { ...options, fetcher: async () => new Response(PDF_BYTES, { headers: { "content-type": "application/pdf" } }), pdfConverter: async () => new Promise(() => {}), pdfConversionTimeoutMs: 5 }), /pdf_conversion_timeout/u);
});

test("fresh review-only supports the same bounded PDF converter and still makes one independent review", async () => {
  const story = { title: "Newborn Town announces interim results", topic: "Newborn Town", publishedAt: "2026-08-25", sources: [{ ...PDF_SOURCE, kind: "official" }] };
  const proposal = { sourceUrl: PDF_URL, sourcePublishedAt: "2026-08-25T00:00:00.000Z", titleZh: "赤子城披露中期社交业务收入增长", change: "赤子城披露社交业务收入增长 25.0%，达到 RMB1,000 million。", whyItMatters: "社交收入增速反映经营规模变化，仍需观察收入增长是否来自付费用户增加或单个用户消费提升。", evidenceQuote: PDF_QUOTE };
  let aiCalls = 0;
  let conversionCalls = 0;
  const result = await reviewHotEventDetail(story, proposal, {
    now: NOW, fetcher: async () => new Response(PDF_BYTES, { headers: { "content-type": "application/pdf" } }),
    pdfConverter: async () => { conversionCalls += 1; return PDF_MARKDOWN; },
    ai: { async run(model, input) { aiCalls += 1; assert.ok(!model.includes("qwen")); assert.equal(JSON.parse(input.messages[1].content).originalArticleText.length, 18_000); return { response: { ...VERDICT, confirmedTopic: "Newborn Town", evidenceQuote: PDF_QUOTE } }; } },
  });
  assert.equal(result.status, "ready");
  assert.equal(result.sourcePublishedAt, "2026-08-25T00:00:00.000Z");
  assert.equal(aiCalls, 1);
  assert.equal(conversionCalls, 1);
});

test("bounded anchor windows retain late official social metrics even when the sentence omits the issuer", () => {
  const quote = "Revenues from chatting were US$47.4 million during the reporting period, compared with US$50.0 million for the prior period.";
  const padding = "The report describes operating context, reporting methods and ordinary business background without identifying a social metric. ";
  const text = `${"Yalla Group financial report. "}${padding.repeat(116)}${quote} ${padding.repeat(15)}`.slice(0, 18_000);
  assert.ok(text.indexOf(quote) > 14_000);
  const article = { sourceUrl: "https://ir.yalla.com/financial-results", title: "Yalla Group reports interim financial results", text, publishedAt: DATE };
  const candidates = buildHotQuoteCandidates(article, "Yalla Group", article.title);
  assert.ok(candidates.some((item) => /chatting/u.test(item.text) && item.text.includes("US$47.4 million")));
  assert.ok(candidates.every((item) => text.includes(item.text)));
  assert.ok(candidates.every((item) => (item.text.match(/[A-Za-z\d]+(?:['’-][A-Za-z\d]+)*/gu)?.length ?? 0) <= 25));
});

test("Chinese no-space bodies keep literal bounded subject/action spans without scanning every character window", () => {
  const event = "赤子城公布社交业务收入增长，语音社交产品推出新的互动礼物，用户可在语音房内赠送礼物并参与多人讨论。";
  const text = `${"这是没有产品和指标的行业背景介绍。".repeat(700)}${event}${"后续为一般经营背景说明。".repeat(80)}`.slice(0, 18_000);
  const candidates = buildHotQuoteCandidates({ title: "赤子城披露社交业务结果", text, sourceUrl: PDF_URL }, "Newborn Town");
  assert.ok(candidates.some((item) => item.text.includes("赤子城") && item.text.includes("推出")));
  assert.ok(candidates.every((item) => text.includes(item.text) && (item.text.match(/[\u3400-\u9fff]/gu)?.length ?? 0) <= 70));
});
