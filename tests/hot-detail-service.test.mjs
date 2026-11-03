import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const bundle = await build({ entryPoints: [new URL("../worker/hot-detail.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "browser", write: false });
const { createHotDetailService } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const NOW = new Date("2026-10-19T03:00:00Z");
const DATE = "2026-10-18T08:00:00.000Z";
const ARTICLE_URL = "https://www.bigo.tv/news-events/bigo-news/speaker-approval";
const TITLE = "BIGO LIVE tests speaker approval in voice rooms";
const QUOTE = "BIGO LIVE is testing voice rooms where hosts approve invited speakers before they join.";
const BODY = `${QUOTE} This test is limited to selected markets. The feature allows hosts to invite speakers from the audience and decide who participates in the conversation. The company has not released a measured retention or revenue impact of the test.`;
const DETAIL = { eligible: true, titleZh: "BIGO LIVE 测试主持人审批发言的新语音房", change: "BIGO LIVE 在部分市场测试语音房，主持人可邀请观众并审批谁能参与发言。", whyItMatters: "可研究发言审批对参与门槛和房间秩序的影响，具体效果仍需验证。", evidenceQuote: QUOTE };
const checks = { articleMatch: true, concreteChange: true, productIdentity: true, dateAccurate: true, numbersAccurate: true, chineseFactsSupported: true, analysisIsQualified: true, socialRelevance: true, evidenceSupportsChange: true };
const input = () => ({ story: { id: "speaker-approval", title: TITLE, topic: "BIGO LIVE", publishedAt: DATE, sources: [{ name: "BIGO LIVE 官方新闻", url: ARTICLE_URL, kind: "official", publishedAt: DATE }] } });
const request = (body, options = {}) => new Request("https://remote-preview.example/detail", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), ...options });

function fixture({ approved = true } = {}) {
  const calls = { fetch: 0, ai: [] };
  const handle = createHotDetailService({ now: () => NOW, fetcher: async (url) => {
    calls.fetch += 1;
    assert.equal(String(url), ARTICLE_URL);
    return new Response(`<html><head><meta property="og:title" content="${TITLE}"><meta property="article:published_time" content="${DATE}"></head><body><article><h1>${TITLE}</h1><p>${BODY}</p></article></body></html>`, { headers: { "content-type": "text/html" } });
  } });
  const env = { AI: { async run(model, value) {
    calls.ai.push({ model, value });
    return { response: JSON.stringify(calls.ai.length % 2 === 1 ? DETAIL : { approved, checks: { ...checks, chineseFactsSupported: approved }, confirmedTopic: "BIGO LIVE", evidenceQuote: QUOTE, reason: "Independent original-article review." }) };
  } } };
  return { calls, handle, env };
}

test("private detail service reads one original and returns copy only after extraction plus independent review", async () => {
  const { calls, handle, env } = fixture();
  const response = await handle(request(input()), env);
  const detail = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(detail.status, "ready");
  assert.equal(detail.change, DETAIL.change);
  assert.equal(detail.whyItMatters, DETAIL.whyItMatters);
  assert.equal(detail.sourceUrl, ARTICLE_URL);
  assert.equal(calls.fetch, 1);
  assert.equal(calls.ai.length, 2);
  assert.match(calls.ai[1].value.messages[0].content, /Independently verify/);
  assert.doesNotMatch(JSON.stringify(detail), /originalArticleText|company has not released/);
});

test("trusted preloaded originals are reused while feed descriptions and unrelated cache entries are rejected", async () => {
  const ready = fixture();
  const payload = input();
  payload.articles = [{ sourceUrl: ARTICLE_URL, title: TITLE, text: BODY, publishedAt: DATE, contentKind: "article" }];
  const detail = await (await ready.handle(request(payload), ready.env)).json();
  assert.equal(detail.status, "ready");
  assert.equal(ready.calls.fetch, 0);
  assert.equal(ready.calls.ai.length, 2);
  for (const change of [{ contentKind: "feed" }, { sourceUrl: "https://www.bigo.tv/unrelated" }, { text: "x".repeat(18_001) }]) {
    const invalid = fixture();
    const copy = structuredClone(payload);
    Object.assign(copy.articles[0], change);
    assert.equal((await invalid.handle(request(copy), invalid.env)).status, 400);
    assert.equal(invalid.calls.fetch + invalid.calls.ai.length, 0);
  }
});

test("service rejects unsafe source hosts, mismatched store identities and a different wire issuer before fetching", async () => {
  const invalidSources = [
    { name: "BIGO LIVE 官方新闻", url: "http://www.bigo.tv/insecure", kind: "official" },
    { name: "BIGO LIVE 官方新闻", url: "https://www.bigo.tv.evil.example/fake", kind: "official" },
    { name: "BIGO LIVE 官方新闻", url: "https://user:pw@www.bigo.tv/fake", kind: "official" },
    { name: "BIGO LIVE 官方新闻", url: "https://127.0.0.1/private", kind: "official" },
    { name: "BIGO LIVE · App Store", url: "https://apps.apple.com/us/app/id123", kind: "official" },
    { name: "JOYY 官方新闻稿", url: "https://www.globenewswire.com/news-release/2026/10/18/123/99999/en/other-issuer.html", kind: "official" },
  ];
  for (const source of invalidSources) {
    const { calls, handle, env } = fixture();
    const payload = input(); payload.story.sources = [{ ...source, publishedAt: DATE }];
    assert.equal((await handle(request(payload), env)).status, 400);
    assert.equal(calls.fetch + calls.ai.length, 0);
  }
});

test("pinned App Store release notes can be reviewed from cache without accepting evergreen descriptions", async () => {
  const { calls, handle, env } = fixture();
  const url = "https://apps.apple.com/us/app/id1077137248";
  const payload = input();
  payload.story.sources = [{ name: "BIGO LIVE · App Store", url, kind: "official", publishedAt: DATE }];
  payload.articles = [{ sourceUrl: url, title: TITLE, text: BODY, publishedAt: DATE, contentKind: "release-notes" }];
  assert.equal((await (await handle(request(payload), env)).json()).status, "ready");
  assert.equal(calls.fetch, 0);
  assert.equal(calls.ai.length, 2);
  payload.articles[0].contentKind = "article";
  assert.equal((await handle(request(payload), env)).status, 400);
});

test("service bounds JSON bytes and source count, implements only POST detail, and rejects malformed input", async () => {
  const { calls, handle, env } = fixture();
  assert.equal((await handle(new Request("https://preview.example/detail"), env)).status, 405);
  assert.equal((await handle(new Request("https://preview.example/anything"), env)).status, 404);
  assert.equal((await handle(new Request("https://preview.example/detail", { method: "POST", body: "{}" }), env)).status, 415);
  assert.equal((await handle(request({}, { body: "{" }), env)).status, 400);
  assert.equal((await handle(request({ padding: "x".repeat(128 * 1024) }), env)).status, 413);
  assert.equal((await handle(request(input(), { headers: { "content-type": "application/json", "content-length": String(128 * 1024 + 1) } }), env)).status, 413);
  const tooMany = input(); tooMany.story.sources = Array(4).fill(tooMany.story.sources[0]);
  assert.equal((await handle(request(tooMany), env)).status, 400);
  assert.equal(calls.fetch + calls.ai.length, 0);
});

test("a failed semantic review exposes no proposed Chinese fact", async () => {
  const { handle, env } = fixture({ approved: false });
  const response = await handle(request(input()), env);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(result, { status: "rejected", reason: "detail_review_rejected" });
  assert.ok(!JSON.stringify(result).includes(DETAIL.change));
});

test("review-only endpoint rereads the original and invokes one reviewer without generating replacement copy", async () => {
  const { calls, handle } = fixture();
  const proposal = { ...DETAIL, status: "ready", sourceUrl: ARTICLE_URL, sourceName: "BIGO LIVE 官方新闻", sourcePublishedAt: DATE,
    sourceTitle: TITLE, sourceFeedPublishedAt: DATE, verifiedAt: "2026-10-18T10:00:00.000Z" };
  delete proposal.eligible;
  const payload = { ...input(), proposedDetail: proposal, articles: [{ sourceUrl: ARTICLE_URL, title: TITLE, text: BODY, publishedAt: DATE, contentKind: "article" }] };
  const reviewCalls = [];
  const env = { AI: { async run(model, value) {
    reviewCalls.push({ model, value });
    assert.equal(value.response_format.json_schema.properties.eligible, undefined, "review route must never ask for generated copy");
    return { response: JSON.stringify({ approved: true, checks, confirmedTopic: "BIGO LIVE", evidenceQuote: QUOTE, reason: "The original supports the curated copy." }) };
  } } };
  const response = await handle(new Request("https://remote-preview.example/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }), env);
  const detail = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(detail.status, "ready");
  assert.equal(detail.change, proposal.change);
  assert.equal(detail.whyItMatters, proposal.whyItMatters);
  assert.equal(detail.verifiedAt, NOW.toISOString());
  assert.equal(calls.fetch, 1, "review-only must independently reread the original even if a cached article is supplied");
  assert.equal(reviewCalls.length, 1);
});

test("review-only rejection never returns the submitted copy and invalid proposals do no work", async () => {
  const { calls, handle } = fixture();
  const proposal = { ...DETAIL, status: "ready", sourceUrl: ARTICLE_URL, sourcePublishedAt: DATE };
  delete proposal.eligible;
  let reviews = 0;
  const env = { AI: { async run() { reviews += 1; return { response: JSON.stringify({ approved: false, checks: { ...checks, chineseFactsSupported: false }, confirmedTopic: "BIGO LIVE", reason: "Original does not support the submitted copy." }) }; } } };
  const reviewRequest = (proposedDetail) => new Request("https://preview.example/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...input(), proposedDetail }) });
  const response = await handle(reviewRequest(proposal), env);
  const detail = await response.json();
  assert.equal(response.status, 200);
  assert.equal(detail.status, "rejected");
  assert.ok(!JSON.stringify(detail).includes(proposal.change));
  assert.ok(!JSON.stringify(detail).includes(proposal.whyItMatters));
  assert.equal(reviews, 1);
  assert.equal(calls.fetch, 1);
  for (const invalid of [null, "not an object", { ...proposal, status: "unavailable" }, { ...proposal, sourceUrl: "https://www.bigo.tv/unrelated" }]) {
    assert.equal((await handle(reviewRequest(invalid), env)).status, 400);
  }
  assert.equal(reviews, 1);
  assert.equal(calls.fetch, 1);
});

const PDF_URL = "https://www1.hkexnews.hk/listedco/listconews/sehk/2026/0825/2026082501387.pdf";
const PDF_DATE = "2026-08-25T00:00:00.000Z";
const PDF_QUOTE = "Newborn Town social networking revenue increased 25.0% to RMB1,000 million.";
const PDF_MARKDOWN = `# Newborn Town Inc.\n(Stock Code: 9911)\nANNOUNCEMENT OF INTERIM RESULTS\nFOR THE SIX MONTHS ENDED 30 JUNE 2026\n${PDF_QUOTE}\nThe social networking business provides products for overseas users. These results describe the reported financial period rather than an independently measured product feature effect.\nBy order of the Board\nNewborn Town Inc.\nChairman\nHong Kong, 25 August 2026`;
const pdfSource = () => ({ name: "赤子城科技投资者关系", url: PDF_URL, publishedAt: PDF_DATE });
const pdfRequest = (source = pdfSource()) => new Request("https://preview.example/article", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source }) });

test("private article endpoint converts only registered Newborn Town PDF originals without a model call", async () => {
  let fetches = 0; let conversions = 0; let modelCalls = 0;
  const handle = createHotDetailService({ now: () => NOW, fetcher: async (url) => {
    fetches += 1; assert.equal(String(url), PDF_URL);
    return new Response("%PDF-1.7\nfixture issuer report", { headers: { "content-type": "application/pdf" } });
  } });
  const env = { AI: { async run() { modelCalls += 1; throw new Error("The article route must not call a generative model"); }, async toMarkdown(file, options) {
    conversions += 1; assert.ok(file.name.endsWith(".pdf")); assert.ok(file.blob.size > 5);
    assert.deepEqual(options, { conversionOptions: { pdf: { metadata: false, images: { convert: false } } } });
    return { format: "markdown", data: PDF_MARKDOWN };
  } } };
  const response = await handle(pdfRequest(), env);
  const article = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(article.sourceUrl, PDF_URL);
  assert.equal(article.contentKind, "article");
  assert.equal(article.publishedAt, PDF_DATE);
  assert.ok(article.text.includes(PDF_QUOTE));
  assert.equal(fetches, 1); assert.equal(conversions, 1); assert.equal(modelCalls, 0);
  for (const source of [
    { ...pdfSource(), name: "BIGO LIVE 官方新闻" },
    { ...pdfSource(), url: "https://www1.hkexnews.hk/private/file.pdf" },
    { ...pdfSource(), url: PDF_URL.replace("www1.hkexnews.hk", "www1.hkexnews.hk.evil.example") },
  ]) assert.equal((await handle(pdfRequest(source), env)).status, 400);
  assert.equal(fetches, 1);
});

test("PDF conversion errors and oversized PDFs fail closed without returning a fabricated article", async () => {
  let conversions = 0;
  const env = { AI: { async run() { throw new Error("unexpected model"); }, async toMarkdown() { conversions += 1; return { format: "error", error: "Conversion failed" }; } } };
  const handle = createHotDetailService({ fetcher: async () => new Response("%PDF-1.7\nfixture", { headers: { "content-type": "application/pdf" } }) });
  const conversionFailed = await handle(pdfRequest(), env);
  assert.equal(conversionFailed.status, 422);
  assert.deepEqual(await conversionFailed.json(), { status: "unavailable", reason: "pdf_article_unavailable" });
  assert.equal(conversions, 1);
  const oversized = createHotDetailService({ fetcher: async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1), { headers: { "content-type": "application/pdf" } }) });
  assert.equal((await oversized(pdfRequest(), env)).status, 422);
  assert.equal(conversions, 1, "oversized files must fail before conversion");
  assert.equal((await handle(pdfRequest(), { AI: { async run() { throw new Error("unexpected model"); } } })).status, 503);
});

test("review-only route freshly converts a PDF rather than trusting preloaded or submitted article text", async () => {
  let fetches = 0; let conversions = 0; let reviews = 0;
  const handle = createHotDetailService({ now: () => NOW, fetcher: async () => {
    fetches += 1; return new Response("%PDF-1.7\nfixture", { headers: { "content-type": "application/pdf" } });
  } });
  const proposal = { status: "ready", sourceUrl: PDF_URL, sourcePublishedAt: PDF_DATE,
    titleZh: "赤子城科技披露上半年社交业务收入增长", change: "赤子城科技披露社交业务收入同比增长25.0%，达到RMB1,000 million。",
    whyItMatters: "社交业务收入变化可作为付费表现的观察入口，具体产品贡献与用户付费结构仍需结合分项数据验证。", evidenceQuote: PDF_QUOTE };
  const story = { title: "INTERIM RESULTS ANNOUNCEMENT FOR THE SIX MONTHS ENDED 30 JUNE 2026", topic: "Newborn Town", publishedAt: PDF_DATE,
    sources: [{ ...pdfSource(), kind: "official" }] };
  const env = { AI: { async toMarkdown(_file, options) { conversions += 1; assert.deepEqual(options, { conversionOptions: { pdf: { metadata: false, images: { convert: false } } } }); return { format: "markdown", data: PDF_MARKDOWN }; }, async run(_model, value) {
    reviews += 1;
    assert.equal(value.response_format.json_schema.properties.eligible, undefined);
    return { response: JSON.stringify({ approved: true, checks, confirmedTopic: "Newborn Town", evidenceQuote: PDF_QUOTE, reason: "Original issuer report supports the proposed statement." }) };
  } } };
  const response = await handle(new Request("https://preview.example/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ story, proposedDetail: proposal }) }), env);
  const result = await response.json();
  assert.equal(result.status, "ready");
  assert.equal(result.whyItMatters, proposal.whyItMatters);
  assert.equal(fetches, 1); assert.equal(conversions, 1); assert.equal(reviews, 1);
});

test("detail Worker has AI only and no database, public route, schedule, or publishing service", async () => {
  const config = JSON.parse(await readFile(new URL("../wrangler.hot-detail.json", import.meta.url), "utf8"));
  assert.equal(config.name, "xiaoluo-hot-detail");
  assert.equal(config.main, "worker/hot-detail.ts");
  assert.equal(config.workers_dev, false);
  assert.deepEqual(config.ai, { binding: "AI" });
  for (const binding of ["routes", "route", "triggers", "d1_databases", "services", "kv_namespaces", "vars", "secrets_store_secrets"]) assert.equal(config[binding], undefined);
});
