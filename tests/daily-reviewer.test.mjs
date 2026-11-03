import assert from 'node:assert/strict';
import test from 'node:test';
import { createDailyReviewer, originalPublicationDate, publicHttpsUrl, readOriginalArticle } from '../worker/daily-automation/reviewer.mjs';
import { extractArticleEvidence } from '../worker/daily-automation/source.mjs';

const REQUESTED_AT = '2026-10-14T03:00:00Z';
const SOURCE_DATE = '2026-10-13T14:00:00.000Z';
const QUOTE = 'BIGO LIVE introduced new voice rooms with multi guest audio chat and updated room moderation controls for creators.';
const BODY = `${QUOTE} The new room tools let hosts invite speakers and remove disruptive guests directly from live sessions. The company also updated audio discovery, making creator-hosted conversations easier for existing users to find.`;

function article({ date = SOURCE_DATE, body = BODY, title = 'BIGO LIVE adds voice rooms and moderation' } = {}) {
  return `<!doctype html><html><head><title>${title}</title><meta property="article:published_time" content="${date}"></head><body><article><h1>${title}</h1><p>${body}</p></article></body></html>`;
}

function candidate(overrides = {}) {
  return {
    eventKey: 'bigo-live-voice-rooms-2026-10-13',
    topic: 'BIGO LIVE',
    sourceName: 'BIGO LIVE News',
    sourceUrl: 'https://www.bigo.tv/news-events/voice-rooms',
    sourceTitle: 'BIGO LIVE adds voice rooms and moderation',
    sourcePublishedAt: SOURCE_DATE,
    titleZh: 'BIGO LIVE 推出新语音房和主持管理功能',
    summaryZh: '新语音房支持多人聊天，主持人可移除扰乱房间的用户。',
    quote: QUOTE,
    ...overrides,
  };
}

function request(candidates = [candidate()], overrides = {}) {
  return new Request('https://reviewer.internal/review', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ schemaVersion: 1, reportDate: '2026-10-14', requestedAt: REQUESTED_AT, candidates, ...overrides }),
  });
}

function environment({ aiResult, publisherStatus = 200 } = {}) {
  const calls = { ai: [], publisher: [] };
  const verdict = aiResult ?? {
    approved: true,
    checks: {
      originalArticleMatch: true, substantiveUpdate: true, productIdentity: true,
      eventDate: true, chineseCopySupported: true, socialVoiceLiveRelevance: true,
    },
    confirmedTopic: 'BIGO LIVE', confirmedAppIdentity: 'BIGO LIVE',
    evidenceExcerpt: QUOTE, reason: '原文支持',
  };
  return {
    calls,
    env: {
      AI: { async run(model, input) { calls.ai.push({ model, input }); return { response: JSON.stringify(verdict) }; } },
      PUBLISHER: { async fetch(url, init) {
        calls.publisher.push({ url, body: JSON.parse(init.body) });
        return Response.json({ saved: publisherStatus === 200 }, { status: publisherStatus });
      } },
    },
  };
}

test('private reviewer fetches original source, runs separate AI and submits verified evidence', async () => {
  const { env, calls } = environment();
  const fetched = [];
  const reviewer = createDailyReviewer({
    fetcher: async (url, init) => { fetched.push({ url, redirect: init.redirect }); return new Response(article(), { headers: { 'content-type': 'text/html' } }); },
    now: () => Date.parse(REQUESTED_AT),
  });
  const response = await reviewer(request(), env);
  assert.equal(response.status, 200);
  assert.deepEqual(fetched, [{ url: candidate().sourceUrl, redirect: 'manual' }]);
  assert.equal(calls.ai.length, 1);
  assert.equal(calls.publisher.length, 1);
  const payload = calls.publisher[0].body;
  assert.equal(payload.status, 'verified');
  assert.equal(payload.verifiedItems.length, 1);
  assert.equal(payload.verifiedItems[0].confirmedPublishedAt, SOURCE_DATE);
  assert.equal(payload.verifiedItems[0].sourceQuote, QUOTE);
  assert.equal(payload.verifiedItems[0].reviewEvidence.exactExcerpt, QUOTE);
  assert.match(payload.verifiedItems[0].reviewEvidence.contentHash, /^[a-f0-9]{64}$/);
  assert.equal(payload.verifiedItems[0].reviewEvidence.finalUrl, candidate().sourceUrl);
});

test('a reviewed WhatsApp headline still requires the original page and independent AI approval', async () => {
  const title = 'Now You Can Invite Anyone to a WhatsApp Call';
  const quote = 'Guests can join a WhatsApp call without first creating a WhatsApp account.';
  const body = `${quote} The host must approve their request to join. The call remains end-to-end encrypted, and the guest can participate in a one-to-one or group call with people who use WhatsApp.`;
  const socialCandidate = candidate({
    eventKey: 'whatsapp-guest-calling-2026-10-13', topic: 'WhatsApp', sourceName: 'Meta Newsroom',
    sourceUrl: 'https://about.fb.com/news/2026/10/introducing-whatsapp-guest-calling/',
    sourceTitle: title, titleZh: 'WhatsApp 现可邀请没有账号的人加入通话',
    summaryZh: '房主批准后，没有账号的访客也可加入 WhatsApp 通话。', quote,
  });
  const { env, calls } = environment({ aiResult: {
    approved: true,
    checks: {
      originalArticleMatch: true, substantiveUpdate: true, productIdentity: true,
      eventDate: true, chineseCopySupported: true, socialVoiceLiveRelevance: true,
    },
    confirmedTopic: 'WhatsApp', confirmedAppIdentity: 'WhatsApp',
    evidenceExcerpt: quote, reason: '原文支持',
  } });
  const fetched = [];
  const fetcher = async (url) => {
    fetched.push(url);
    return new Response(article({ title, body }), { headers: { 'content-type': 'text/html' } });
  };
  const reviewer = createDailyReviewer({ fetcher, now: () => Date.parse(REQUESTED_AT) });
  const response = await reviewer(request([socialCandidate]), env);
  assert.equal(response.status, 200);
  assert.deepEqual(fetched, [socialCandidate.sourceUrl]);
  assert.equal(calls.ai.length, 1);
  assert.equal(JSON.parse(calls.ai[0].input.messages[1].content).originalPageTitle, title);
  assert.equal(calls.publisher[0].body.status, 'verified');

  const wrongTopic = environment();
  const rejected = await reviewer(request([candidate({ ...socialCandidate, topic: 'Facebook' })]), wrongTopic.env);
  assert.equal(rejected.status, 200);
  assert.equal(wrongTopic.calls.ai.length, 0);
  assert.equal(wrongTopic.calls.publisher[0].body.status, 'rejected');
});

test('reviewer uses the article title when a publisher puts a generic newsletter H1 first', async () => {
  const title = candidate().sourceTitle;
  const html = `<!doctype html><html><head><title>Social Media Today</title><meta property="og:title" content="${title}"><meta property="article:published_time" content="${SOURCE_DATE}"></head><body><h1>Don't miss tomorrow's social media industry news</h1><article><h1>${title}</h1><p>${BODY}</p></article></body></html>`;
  const { env, calls } = environment();
  const reviewer = createDailyReviewer({ fetcher: async () => new Response(html, { headers: { 'content-type': 'text/html' } }), now: () => Date.parse(REQUESTED_AT) });
  const response = await reviewer(request(), env);
  assert.equal(response.status, 200);
  assert.equal(calls.ai.length, 1);
  assert.equal(JSON.parse(calls.ai[0].input.messages[1].content).originalPageTitle, title);
  assert.equal(calls.publisher[0].body.status, 'verified');
});

test('empty candidates create a rejected draft instead of inventing news', async () => {
  const { env, calls } = environment();
  const response = await createDailyReviewer({ fetcher: async () => { throw new Error('must not fetch'); } })(request([], { failure: 'No original facts' }), env);
  assert.equal(response.status, 200);
  assert.equal(calls.ai.length, 0);
  assert.equal(calls.publisher[0].body.status, 'rejected');
  assert.deepEqual(calls.publisher[0].body.verifiedItems, []);
  assert.match(calls.publisher[0].body.reason, /没有可独立核验/);
});

test('source quote absent or metadata date absent fails before AI', async () => {
  for (const html of [article({ body: BODY.replace(QUOTE, 'A different article body without the candidate quote.') }),
    '<html><head><title>Official product news</title></head><body><p>' + BODY + '</p></body></html>']) {
    const { env, calls } = environment();
    const response = await createDailyReviewer({ fetcher: async () => new Response(html, { headers: { 'content-type': 'text/html' } }) })(request(), env);
    assert.equal(response.status, 200);
    assert.equal(calls.ai.length, 0);
    assert.equal(calls.publisher[0].body.status, 'rejected');
  }
});

test('a stale original date rejects even when collector timestamp claims it is new', async () => {
  const { env, calls } = environment();
  const response = await createDailyReviewer({ fetcher: async () => new Response(article({ date: '2026-09-01T10:00:00Z' })) })(request(), env);
  assert.equal(response.status, 200);
  assert.equal(calls.ai.length, 0);
  assert.match(calls.publisher[0].body.reason, /近 7 天/);
});

test('uncertain AI verdict cannot be coerced into a verified report', async () => {
  const { env, calls } = environment({ aiResult: { approved: true, checks: { originalArticleMatch: true }, evidenceExcerpt: QUOTE } });
  const response = await createDailyReviewer({ fetcher: async () => new Response(article()) })(request(), env);
  assert.equal(response.status, 200);
  assert.equal(calls.publisher[0].body.status, 'rejected');
  assert.deepEqual(calls.publisher[0].body.verifiedItems, []);
});

test('vague revival plans and unrelated creator AI pricing fail before the semantic model', async () => {
  for (const headline of [
    'Remember Orkut? Its founder wants to bring it back',
    'Meta will charge for Instagram AI after daily caps, putting production cost on creators for first time',
  ]) {
    const { env, calls } = environment();
    const response = await createDailyReviewer({ fetcher: async () => new Response(article()) })(request([candidate({ sourceTitle: headline })]), env);
    assert.equal(response.status, 200);
    assert.equal(calls.ai.length, 0);
    assert.equal(calls.publisher[0].body.status, 'rejected');
  }
});

test('reviewer refuses unsafe source and unsafe redirects', async () => {
  for (const bad of ['http://example.com/story', 'https://127.0.0.1/story', 'https://localhost/story', 'https://user:pass@a.example/story', 'https://news.internal/story']) {
    assert.equal(publicHttpsUrl(bad), null, bad);
  }
  let hops = 0;
  await assert.rejects(
    readOriginalArticle('https://public.example/story', { fetcher: async () => { hops++; return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/secrets' } }); } }),
    /不安全/,
  );
  assert.equal(hops, 1);
});

test('oversized source and publisher failure do not produce a success response', async () => {
  const { env } = environment({ publisherStatus: 500 });
  const response = await createDailyReviewer({ fetcher: async () => new Response(article()) })(request(), env);
  assert.equal(response.status, 502);
  await assert.rejects(readOriginalArticle(candidate().sourceUrl, {
    fetcher: async () => new Response(article(), { headers: { 'content-length': '999999' } }),
  }), /读取上限/);
});

test('metadata reader ignores modification dates and accepts original JSON-LD publication dates', () => {
  assert.equal(originalPublicationDate('<meta property="article:modified_time" content="2026-10-14T02:00:00Z">'), null);
  assert.equal(originalPublicationDate('<script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","datePublished":"2026-10-13T14:00:00Z"}</script>'), SOURCE_DATE);
});

test('only the private POST route is implemented and invalid date envelopes are not forwarded', async () => {
  const { env, calls } = environment();
  const reviewer = createDailyReviewer();
  assert.equal((await reviewer(new Request('https://reviewer.internal/review'), env)).status, 404);
  assert.equal((await reviewer(request([candidate()], { reportDate: '2026-02-30' }), env)).status, 400);
  assert.equal(calls.publisher.length, 0);
});

test('one failed candidate rejects the entire report without partially verified items', async () => {
  const { env, calls } = environment();
  const second = candidate({ eventKey: 'second-event', sourceUrl: 'https://www.bigo.tv/news-events/second', quote: 'This quote does not occur in the original article body.' });
  const response = await createDailyReviewer({ fetcher: async () => new Response(article()) })(request([candidate(), second]), env);
  assert.equal(response.status, 200);
  assert.equal(calls.ai.length, 1);
  assert.equal(calls.publisher[0].body.status, 'rejected');
  assert.deepEqual(calls.publisher[0].body.verifiedItems, []);
});

test('AI receives the original region containing the quoted evidence, even after a long site shell', async () => {
  const prefix = 'site navigation and promotional text '.repeat(1000);
  const { env, calls } = environment();
  const response = await createDailyReviewer({ fetcher: async () => new Response(article({ body: `${prefix} ${BODY}` })) })(request(), env);
  assert.equal(response.status, 200);
  const aiInput = JSON.parse(calls.ai[0].input.messages[1].content);
  assert(aiInput.originalArticleText.includes(QUOTE));
  assert(aiInput.originalArticleText.length <= 18_000);
});

test('reviewer quote normalization agrees with collector extraction through inline HTML tags', async () => {
  const html = article({ body: BODY.replace('BIGO LIVE introduced', 'BIGO LIVE <strong>introduced</strong>') });
  assert(extractArticleEvidence(html)?.text.includes(QUOTE));
  const { env, calls } = environment();
  const response = await createDailyReviewer({ fetcher: async () => new Response(html) })(request(), env);
  assert.equal(response.status, 200);
  assert.equal(calls.publisher[0].body.status, 'verified');
});
