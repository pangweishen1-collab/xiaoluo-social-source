import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createDailyEditionFromFactRecord } from '../shared/daily-edition.mjs';
import {
  canonicalJson, checkHistoricalDuplicates, checkSourceUrls, isPublicSourceUrl, sha256,
  validateAutomatedBundle, validateFactRecord, validateReportPair,
} from '../scripts/daily-publication-gate.mjs';

const now = new Date('2026-10-14T04:00:00.000Z');
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
const fact = (overrides = {}) => ({
  section: 'week_changes', app_or_company: 'YoHo', event_key: 'yoho::voice-room::v2',
  verified_app_identity: 'com.example.yoho + official product page',
  reported_title: 'YoHo｜语聊房新增多人麦位',
  verified_facts: ['官方版本说明写明语聊房新增多人麦位'],
  event_date: '2026-10-14', announcement_date: '2026-10-14',
  source_urls: ['https://example.org/yoho-release'], retrieved_at: '2026-10-14T03:20:00.000Z',
  verification_status: 'verified', previously_reported: false, substantive_new_detail: null,
  ...overrides,
});

const bundle = () => {
  const record = { report_date: '2026-10-14', items: [fact()] };
  const edition = createDailyEditionFromFactRecord(record);
  const common = [
    '10月14日海外语聊直播行业日报',
    '一、产品雷达', '本轮暂未取得可核实的新动向。',
    '二、团队与招聘动向', '本轮暂未取得可核实的新动向。',
    '三、语聊直播产品近一周变化',
    'YoHo｜语聊房新增多人麦位', '官方版本说明写明语聊房新增多人麦位',
    'https://example.org/yoho-release',
    '小骆语聊：https://xiaoluo-social.pages.dev/',
  ];
  const markdown = common.map((line, index) => index === 0 ? `## ${line}`
    : index === 1 || index === 3 || index === 5 ? `### ${line}`
      : index === 6 ? `**${line}**` : index === 8 ? `[${line}](${line})`
        : index === 9 ? '小骆语聊：[https://xiaoluo-social.pages.dev/](https://xiaoluo-social.pages.dev/)' : line).join('\n\n');
  const data = { date: '2026-10-14', title: '10月14日海外语聊直播行业日报', sourceThread: 'daily-auto-job', body: markdown, wechatBody: common.join('\n\n'), edition };
  const rawPayload = JSON.stringify(data);
  const rawFactRecord = JSON.stringify(record);
  const signed = {
    schemaVersion: 1, verdict: 'pass', reportDate: data.date,
    payloadSha256: sha256(rawPayload), factRecordSha256: sha256(rawFactRecord),
    checkedAt: '2026-10-14T03:30:00.000Z', verifierId: 'independent-verifier',
    verifiedEventKeys: ['yoho::voice-room::v2'],
    checks: Object.fromEntries(['source_access', 'claim_support', 'app_identity', 'date_scope', 'dedupe', 'output_parity'].map(key => [key, 'pass'])),
  };
  const attestation = { ...signed, signature: sign(null, Buffer.from(canonicalJson(signed)), privateKey).toString('base64') };
  return { data, rawPayload, record, rawFactRecord, attestation, publicKeyPem, now };
};

test('auto publication accepts an independently signed, date-matched, complete evidence bundle', () => {
  assert.deepEqual(validateAutomatedBundle(bundle()), []);
});

test('report pair requires complete matching source URLs in both formats', () => {
  const { data } = bundle();
  const sourceUrl = 'https://example.org/yoho-release';
  const markdownLink = `[${sourceUrl}](${sourceUrl})`;
  assert.deepEqual(validateReportPair(data), []);

  const missingWeChat = { ...data, wechatBody: data.wechatBody.replace(`${sourceUrl}\n\n`, '') };
  assert.ok(validateReportPair(missingWeChat).some(error => error.includes('WeChat source URLs for yoho::voice-room::v2')));
  const missingMarkdown = { ...data, body: data.body.replace(`${markdownLink}\n\n`, '') };
  assert.ok(validateReportPair(missingMarkdown).some(error => error.includes('Markdown source URLs for yoho::voice-room::v2')));

  const wrongUrl = 'https://example.org/yoho';
  const changedBoth = {
    ...data,
    body: data.body.replace(markdownLink, `[${wrongUrl}](${wrongUrl})`),
    wechatBody: data.wechatBody.replace(sourceUrl, wrongUrl),
  };
  assert.ok(validateReportPair(changedBoth).some(error => error.includes('verified edition sources')),
    'same wrong or truncated URL in both formats must not pass parity');

  const misleadingLabel = { ...data, body: data.body.replace(markdownLink, `[原文](${sourceUrl})`) };
  assert.ok(validateReportPair(misleadingLabel).some(error => error.includes('full URL as their label')));
  const misleadingTarget = { ...data, body: data.body.replace(markdownLink, `[${sourceUrl}](${wrongUrl})`) };
  assert.ok(validateReportPair(misleadingTarget).some(error => error.includes('full URL as their label')));
  const markdownInWeChat = { ...data, wechatBody: data.wechatBody.replace(sourceUrl, markdownLink) };
  assert.ok(validateReportPair(markdownInWeChat).some(error => error.includes('WeChat text must not contain Markdown')));
});

test('report pair preserves every related original source, including equivalent encoded link labels', () => {
  const { data } = bundle();
  const sourceUrl = 'https://example.org/yoho-release';
  const encodedUrl = 'https://example.org/news/%E8%AF%AD%E8%81%8A?day=2026-10-14&app=yoho';
  const unicodeLabel = 'https://example.org/news/语聊?day=2026-10-14&app=yoho';
  const edition = structuredClone(data.edition);
  edition.sections[2].items[0].sourceUrls.push(encodedUrl);
  const valid = {
    ...data, edition,
    body: data.body.replace(`[${sourceUrl}](${sourceUrl})`,
      `[${sourceUrl}](${sourceUrl})\n\n[${unicodeLabel}](${encodedUrl})`),
    wechatBody: data.wechatBody.replace(sourceUrl, `${sourceUrl}\n\n${encodedUrl}`),
  };
  assert.deepEqual(validateReportPair(valid), []);
  const missingRelatedSource = { ...valid, wechatBody: valid.wechatBody.replace(`\n\n${encodedUrl}`, '') };
  assert.ok(validateReportPair(missingRelatedSource).some(error => error.includes('verified edition sources')));
});

test('report pair binds each complete URL to the correct edition item', () => {
  const first = fact();
  const second = fact({
    event_key: 'yalla::voice-room::update', reported_title: 'Yalla｜语聊房上线新玩法',
    verified_facts: ['官方公告明确语聊房上线新玩法'],
    source_urls: ['https://example.org/yalla-release'],
  });
  const edition = createDailyEditionFromFactRecord({ report_date: '2026-10-14', items: [first, second] });
  const lines = [
    '10月14日海外语聊直播行业日报',
    '一、产品雷达', '本轮暂未取得可核实的新动向。',
    '二、团队与招聘动向', '本轮暂未取得可核实的新动向。',
    '三、语聊直播产品近一周变化',
    first.reported_title, first.verified_facts[0], second.source_urls[0],
    second.reported_title, second.verified_facts[0], first.source_urls[0],
    '小骆语聊：https://xiaoluo-social.pages.dev/',
  ];
  const data = {
    date: '2026-10-14', title: lines[0], edition, wechatBody: lines.join('\n\n'),
    body: lines.map((line, index) => index === 0 ? `## ${line}`
      : [1, 3, 5].includes(index) ? `### ${line}`
        : [6, 9].includes(index) ? `**${line}**`
          : [8, 11].includes(index) ? `[${line}](${line})`
            : index === 12 ? '小骆语聊：[https://xiaoluo-social.pages.dev/](https://xiaoluo-social.pages.dev/)' : line).join('\n\n'),
  };
  const errors = validateReportPair(data);
  assert.ok(errors.some(error => error.includes('yoho::voice-room::v2')));
  assert.ok(errors.some(error => error.includes('yalla::voice-room::update')));
  assert.ok(!errors.some(error => error.includes('identical nonempty lines')),
    'cross-item URL swapping must fail even when Markdown and WeChat match exactly');
});

test('auto publication fails closed when the signed payload or verification verdict changes', () => {
  const original = bundle();
  const changed = { ...original, data: { ...original.data, title: '被替换的标题' }, rawPayload: JSON.stringify({ ...original.data, title: '被替换的标题' }) };
  assert.ok(validateAutomatedBundle(changed).some(error => error.includes('exact payload')));
  const verdict = { ...original, attestation: { ...original.attestation, checks: { ...original.attestation.checks, claim_support: 'fail' } } };
  assert.ok(validateAutomatedBundle(verdict).some(error => error.includes('every required independent check')));
  assert.ok(validateAutomatedBundle({ ...original, publicKeyPem: '' }).some(error => error.includes('PUBLIC_KEY')));
});

test('auto publication rejects stale events, unverifiable jobs and repeated stories', () => {
  const original = bundle();
  const stale = { ...original.record, items: [fact({ event_date: '2026-09-25', announcement_date: null })] };
  assert.ok(validateFactRecord(stale, original.data.edition, original.data.date, now).some(error => error.includes('7-day window')));
  const hiring = { ...original.record, items: [fact({ section: 'hiring', job_open_status: '未确认' })] };
  assert.ok(validateFactRecord(hiring, original.data.edition, original.data.date, now).some(error => error.includes('confirmed open')));
  const previous = [{ sections: [{ items: [{ eventKey: 'yoho::voice-room::v2' }] }] }];
  assert.deepEqual(checkHistoricalDuplicates(original.data.edition, previous, original.record), ['Previously published event without verified new detail: yoho::voice-room::v2']);
});

test('source URL verification accepts live HTTPS and rejects inaccessible/redirected sources', async () => {
  const edition = bundle().data.edition;
  assert.deepEqual(await checkSourceUrls(edition, async url => ({ ok: true, status: 200, url, body: { cancel: async () => {} } })), []);
  const failed = await checkSourceUrls(edition, async url => ({ ok: false, status: 403, url, body: null }));
  assert.match(failed[0], /HTTP 403/);
  assert.equal(isPublicSourceUrl('https://127.0.0.1/private'), false);
  assert.equal(isPublicSourceUrl('https://[::1]/private'), false);
  assert.equal(isPublicSourceUrl('https://metadata.google.internal/'), false);
  assert.equal(isPublicSourceUrl('https://news.example.org/article'), true);
  let requests = 0;
  const redirected = await checkSourceUrls(edition, async () => {
    requests += 1;
    return { ok: false, status: 302, headers: { get: () => 'https://127.0.0.1/admin' }, body: { cancel: async () => {} } };
  });
  assert.equal(requests, 1, 'private redirect target must never be fetched');
  assert.match(redirected[0], /private or unsafe/);
});

test('a legacy remote call cannot bypass the verification gate', () => {
  const script = fileURLToPath(new URL('../scripts/publish-daily.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, '/file-not-needed-because-gate-runs-first.json', '--remote'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Remote write blocked/);
  const manual = spawnSync(process.execPath, [script, '/missing-payload-after-explicit-manual-confirmation.json', '--manual-confirmed', '--remote'], { encoding: 'utf8' });
  assert.notEqual(manual.status, 0);
  assert.doesNotMatch(manual.stderr, /Remote write blocked/);
  assert.match(manual.stderr, /ENOENT/);
});
