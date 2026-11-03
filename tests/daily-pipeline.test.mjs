import test from 'node:test';
import assert from 'node:assert/strict';
import { runDailyGeneration } from '../worker/daily-automation/generator.mjs';
import { createDailyReviewer } from '../worker/daily-automation/reviewer.mjs';
import { publishSubmission } from '../worker/daily-automation/publisher.mjs';

const now = new Date('2026-10-14T03:00:00.000Z');
const articleUrl = 'https://www.bigo.tv/news-events/bigo-news/voice-room-gifting';
const quote = 'BIGO LIVE introduced new voice chat rooms and a gift collection tool for hosts and listeners.';
const body = `${quote} The new product feature is available to listeners in selected markets and allows hosts to manage gifts during live rooms. The company says these controls are already available to users of the BIGO LIVE application.`;
const html = `<html><head><title>BIGO LIVE introduces voice rooms and gifting</title><meta property="article:published_time" content="2026-10-13T22:00:00Z"></head><body><article><h1>BIGO LIVE introduces voice rooms and gifting</h1><p>${body}</p></article></body></html>`;
const hot = { status: 'ready', updatedAt: now.toISOString(), rankings: [{
  title: 'BIGO LIVE introduces voice chat rooms with gift collection tools', topic: 'BIGO LIVE',
  publishedAt: '2026-10-13T22:00:00.000Z',
  sources: [{ name: 'BIGO LIVE 官方新闻', url: articleUrl, kind: 'official', publishedAt: '2026-10-13T22:00:00.000Z' }],
}] };

function db() {
  const reports = new Map();
  const runs = new Map();
  return {
    reports, runs,
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return sql.includes('FROM daily_reports WHERE report_date=?') ? reports.get(args[0]) ?? null : null; },
        async all() { return { results: [] }; },
        async run() {
          if (sql.includes('INSERT INTO daily_reports')) {
            if (reports.has(args[0])) return { meta: { changes: 0 } };
            reports.set(args[0], { title: args[1], body: args[2], edition_json: args[5] });
            return { meta: { changes: 1 } };
          }
          if (sql.includes('INSERT INTO daily_automation_runs')) {
            runs.set(args[0], { status: args[2], reason: args[3], draft_json: args[4] });
            return { meta: { changes: 1 } };
          }
          throw new Error(`Unknown SQL: ${sql}`);
        },
      };
    },
    async batch(statements) { return Promise.all(statements.map(statement => statement.run())); },
  };
}

async function pipeline(generationResult, reviewResult) {
  const database = db();
  const fetcher = async url => String(url).includes('/api/hot-list')
    ? Response.json(hot)
    : new Response(html, { headers: { 'content-type': 'text/html' } });
  const reviewer = createDailyReviewer({ fetcher, now: () => now.getTime() });
  const publisher = { async fetch(_url, init) {
    const result = await publishSubmission(database, JSON.parse(init.body), now);
    return Response.json(result);
  } };
  const environment = {
    AI: { async run() { return { response: generationResult }; } },
    REVIEWER: { async fetch(request) {
      return reviewer(request, { AI: { async run() { return { response: reviewResult }; } }, PUBLISHER: publisher });
    } },
  };
  const result = await runDailyGeneration(environment, { fetcher, now });
  return { result, database };
}

test('generator, independent reviewer and private publisher agree on one evidence-backed article', async () => {
  const generated = { eligible: true, titleZh: 'BIGO LIVE 推出新的语聊房与礼物收集工具', summaryZh: 'BIGO LIVE 为主播和听众推出新语聊房和礼物收集工具。', quote };
  const reviewed = { approved: true, checks: {
    originalArticleMatch: true, substantiveUpdate: true, productIdentity: true,
    eventDate: true, chineseCopySupported: true, socialVoiceLiveRelevance: true,
  }, confirmedTopic: 'BIGO LIVE', confirmedAppIdentity: 'BIGO LIVE', evidenceExcerpt: quote, reason: '原文支持' };
  const { result, database } = await pipeline(generated, reviewed);
  assert.equal(result.review.status, 'verified');
  assert.equal(result.review.publisher.status, 'published');
  assert.equal(database.reports.size, 1);
  const publicReport = database.reports.get('2026-10-14');
  assert.match(publicReport.body, /BIGO LIVE 推出新的语聊房/);
  assert.equal(JSON.parse(publicReport.edition_json).sections[2].items[0].sourceUrls[0], articleUrl);
  assert.equal(database.runs.get('2026-10-14').status, 'published');
});

test('an uncertain independent AI check persists a private draft but leaves public reports unchanged', async () => {
  const generated = { eligible: true, titleZh: 'BIGO LIVE 推出新的语聊房与礼物收集工具', summaryZh: 'BIGO LIVE 为主播和听众推出新语聊房和礼物收集工具。', quote };
  const reviewed = { approved: false, checks: {}, reason: '无法判断产品身份' };
  const { result, database } = await pipeline(generated, reviewed);
  assert.equal(result.review.status, 'rejected');
  assert.equal(result.review.publisher.status, 'rejected');
  assert.equal(database.reports.size, 0);
  assert.equal(database.runs.get('2026-10-14').status, 'rejected');
});
