import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVerifiedReport, publishSubmission, validateSubmission } from '../worker/daily-automation/publisher.mjs';
import { validateFactRecord, validateReportPair } from '../scripts/daily-publication-gate.mjs';

const NOW = new Date('2026-10-14T03:00:00.000Z');
const sourceUrl = 'https://example.com/news/yalla-launches-voice-rooms';
const candidate = {
  eventKey: 'yalla-voice-rooms', topic: 'Yalla', sourceName: 'Example News', sourceUrl,
  sourceTitle: 'Yalla launches voice rooms for users',
  sourcePublishedAt: '2026-10-13T08:00:00.000Z',
  titleZh: 'Yalla 推出新的语音房间功能',
  summaryZh: 'Yalla 为用户推出新的语音房间功能，并开放房间内实时互动。',
  quote: 'Yalla today launched new voice rooms, allowing users to interact in real time.',
};
const reviewed = {
  ...candidate, confirmedPublishedAt: '2026-10-13T08:00:00.000Z',
  confirmedTopic: 'Yalla', confirmedAppIdentity: 'Yalla',
  reviewEvidence: {
    sourceTitle: candidate.sourceTitle, finalUrl: sourceUrl,
    contentHash: 'a'.repeat(64), checkedAt: NOW.toISOString(),
  },
};
const envelope = () => ({
  schemaVersion: 1, reportDate: '2026-10-14', requestedAt: NOW.toISOString(),
  status: 'verified', candidates: [structuredClone(candidate)], verifiedItems: [structuredClone(reviewed)],
});

function fakeDb(initialReports = []) {
  const reports = new Map(initialReports.map(row => [row.report_date, row]));
  const runs = new Map();
  const db = {
    reports, runs,
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() {
          if (sql.includes('FROM daily_reports WHERE report_date=?')) return reports.get(args[0]) ?? null;
          return null;
        },
        async all() {
          if (sql.includes('FROM daily_reports WHERE report_date<')) {
            return { results: [...reports.values()].filter(row => row.report_date < args[0]).map(row => ({ title: row.title, body: row.body, edition_json: row.edition_json })) };
          }
          return { results: [] };
        },
        async run() {
          if (sql.includes('INSERT INTO daily_reports')) {
            if (reports.has(args[0])) return { meta: { changes: 0 } };
            reports.set(args[0], { report_date: args[0], title: args[1], body: args[2], source_thread: args[3], updated_at: args[4], edition_json: args[5] });
            return { meta: { changes: 1 } };
          }
          if (sql.includes('INSERT INTO daily_automation_runs')) {
            const previous = runs.get(args[0]);
            if (previous?.status === 'published') return { meta: { changes: 0 } };
            runs.set(args[0], { report_date: args[0], attempted_at: args[1], status: args[2], reason: args[3], draft_json: args[4], published_title: args[5] });
            return { meta: { changes: 1 } };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
      };
    },
    async batch(statements) {
      return Promise.all(statements.map(statement => statement.run()));
    },
  };
  return db;
}

test('independently reviewed items form the fixed three-column report and matching Markdown/WeChat URLs', async () => {
  const report = await buildVerifiedReport(envelope(), NOW);
  assert.equal(report.title, '10月14日海外语聊直播行业日报');
  assert.equal(report.edition.sections[0].items.length, 0);
  assert.equal(report.edition.sections[1].items.length, 0);
  assert.equal(report.edition.sections[2].items.length, 1);
  assert.equal(report.edition.sections[2].items[0].sourceUrls[0], sourceUrl);
  assert.equal(report.edition.sections[2].items[0].eventDate, null);
  assert.equal(report.factRecord.items[0].announcement_date, '2026-10-13');
  assert.deepEqual(validateReportPair(report), []);
  assert.deepEqual(validateFactRecord(report.factRecord, report.edition, report.date, NOW), []);
});

test('unreviewed, altered, stale or unsafe candidates are never publishable', () => {
  const noReview = envelope(); noReview.verifiedItems = [];
  assert.ok(validateSubmission(noReview, NOW).length);
  const altered = envelope(); altered.verifiedItems[0].summaryZh = '没有原文支持的说法';
  assert.match(validateSubmission(altered, NOW).join(' '), /differs/);
  const stale = envelope(); stale.verifiedItems[0].confirmedPublishedAt = '2026-09-01T00:00:00Z';
  assert.match(validateSubmission(stale, NOW).join(' '), /seven-day/);
  const unsafe = envelope(); unsafe.verifiedItems[0].sourceUrl = 'https://127.0.0.1/x';
  assert.match(validateSubmission(unsafe, NOW).join(' '), /unsafe/);
  const vague = envelope(); vague.verifiedItems[0].sourceTitle = 'Remember Orkut? Its founder wants to bring it back';
  assert.match(validateSubmission(vague, NOW).join(' '), /not a concrete/);
});

test('publisher accepts the same exact reviewed product headlines as collector and reviewer', () => {
  for (const [sourceTitle, topic] of [
    ['Now You Can Invite Anyone to a WhatsApp Call', 'WhatsApp'],
    ['Your Algorithm, Your Words: New Ways to Shape What You See on Facebook', 'Facebook'],
  ]) {
    const input = envelope();
    input.candidates[0].sourceTitle = sourceTitle;
    input.candidates[0].topic = topic;
    input.verifiedItems[0].sourceTitle = sourceTitle;
    input.verifiedItems[0].confirmedTopic = topic;
    input.verifiedItems[0].reviewEvidence.sourceTitle = sourceTitle;
    assert.deepEqual(validateSubmission(input, NOW), [], sourceTitle);
  }
});

test('successful publication writes a single report plus a private audit draft', async () => {
  const db = fakeDb();
  const result = await publishSubmission(db, envelope(), NOW);
  assert.equal(result.status, 'published');
  assert.equal(db.reports.size, 1);
  assert.equal(db.runs.get('2026-10-14').status, 'published');
  assert.match(db.reports.get('2026-10-14').body, /Yalla 推出新的语音房间功能/);
});

test('existing dates and duplicate old events cannot be overwritten', async () => {
  const report = await buildVerifiedReport(envelope(), NOW);
  const prior = { report_date: '2026-10-13', title: '旧日报', body: 'old', edition_json: JSON.stringify(report.edition) };
  const dupDb = fakeDb([prior]);
  const duplicate = await publishSubmission(dupDb, envelope(), NOW);
  assert.equal(duplicate.status, 'rejected');
  assert.match(duplicate.reason, /Previously reported/);
  assert.equal(dupDb.reports.size, 1);
  const existingDb = fakeDb([{ report_date: '2026-10-14', title: '人工日报', body: 'manual', edition_json: null }]);
  const existing = await publishSubmission(existingDb, envelope(), NOW);
  assert.equal(existing.status, 'skipped_existing');
  assert.equal(existingDb.reports.get('2026-10-14').body, 'manual');
});

test('legacy Markdown without structured edition still blocks the same original URL', async () => {
  const db = fakeDb([{ report_date: '2026-10-13', title: '旧版日报', body: `历史原文：${sourceUrl}`, edition_json: null }]);
  const result = await publishSubmission(db, envelope(), NOW);
  assert.equal(result.status, 'rejected');
  assert.match(result.reason, /Previously reported/);
  assert.equal(db.reports.size, 1);
});

test('Beijing source publication date is not mislabeled as a proved event date', async () => {
  const shifted = envelope();
  shifted.verifiedItems[0].confirmedPublishedAt = '2026-10-13T16:30:00.000Z';
  const report = await buildVerifiedReport(shifted, NOW);
  assert.equal(report.factRecord.items[0].announcement_date, '2026-10-14');
  assert.equal(report.factRecord.items[0].event_date, null);
  assert.equal(report.edition.sections[2].items[0].eventDate, null);
});

test('review failure retains draft without creating a public report', async () => {
  const db = fakeDb();
  const rejected = { ...envelope(), status: 'rejected', reason: 'Original source did not support claim', verifiedItems: [] };
  const result = await publishSubmission(db, rejected, NOW);
  assert.equal(result.status, 'rejected');
  assert.equal(db.reports.size, 0);
  assert.equal(db.runs.get('2026-10-14').status, 'rejected');
  assert.match(db.runs.get('2026-10-14').draft_json, /Original source/);
});

test('an unsuccessful retry never turns an already published date into a failure', async () => {
  const existingDb = fakeDb([{ report_date: '2026-10-14', title: '人工日报', body: 'manual', edition_json: null }]);
  const rejected = { ...envelope(), status: 'rejected', reason: 'No eligible social product event', verifiedItems: [] };
  const result = await publishSubmission(existingDb, rejected, NOW);
  assert.equal(result.status, 'skipped_existing');
  assert.equal(existingDb.runs.get('2026-10-14').status, 'skipped_existing');
  assert.equal(existingDb.reports.get('2026-10-14').body, 'manual');
});
