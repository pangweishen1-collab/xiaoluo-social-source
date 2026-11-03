import { createDailyEditionFromFactRecord, validateDailyEdition } from '../../shared/daily-edition.mjs';
import { isSubstantiveSocialStory } from './source.mjs';

const HEADINGS = [
  '一、产品雷达',
  '二、团队与招聘动向',
  '三、语聊直播产品近一周变化',
];
const FOOTER = '小骆语聊：https://xiaoluo-social.pages.dev/';
const SITE_TIME_ZONE = 'Asia/Shanghai';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_SHA256_RE = /^[0-9a-f]{64}$/i;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function shanghaiDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SITE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = type => parts.find(part => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function realDate(value) {
  return typeof value === 'string' && DATE_RE.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function publicHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && host.includes('.') && !/^\d+(?:\.\d+){3}$/.test(host) && !host.includes(':')
      && !/(^|\.)(localhost|local|internal|lan|home|test|invalid|arpa|onion)$/.test(host);
  } catch { return false; }
}

function plainText(value, max) {
  return typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= max
    && !/[<>\u0000-\u001f\u007f]/.test(value) && !/https?:\/\//i.test(value);
}

async function sourceEventKey(url) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
  const hex = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `source:${hex.slice(0, 32)}`;
}

function minutesFrom(now, value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? (now.getTime() - time) / 60000 : Infinity;
}

export function validateSubmission(envelope, now = new Date()) {
  const errors = [];
  if (!isObject(envelope) || envelope.schemaVersion !== 1) return ['Invalid automation envelope'];
  if (!realDate(envelope.reportDate) || envelope.reportDate !== shanghaiDate(now)) errors.push('Report must be dated today in Beijing');
  if (!Number.isFinite(Date.parse(envelope.requestedAt)) || minutesFrom(now, envelope.requestedAt) < -5 || minutesFrom(now, envelope.requestedAt) > 180) errors.push('Request timestamp is stale or invalid');
  if (!Array.isArray(envelope.candidates) || envelope.candidates.length > 3) errors.push('Candidates must contain at most three articles');
  if (!['verified', 'rejected'].includes(envelope.status)) errors.push('Reviewer status is invalid');
  if (envelope.status === 'rejected') return errors;
  if (!Array.isArray(envelope.verifiedItems) || envelope.verifiedItems.length < 1 || envelope.verifiedItems.length > 3) errors.push('Verified run needs one to three reviewed articles');
  if (Array.isArray(envelope.candidates) && Array.isArray(envelope.verifiedItems)
    && envelope.candidates.length !== envelope.verifiedItems.length) errors.push('Every selected candidate must pass review');
  const seenUrls = new Set();
  for (const [index, item] of (Array.isArray(envelope.verifiedItems) ? envelope.verifiedItems : []).entries()) {
    const path = `Item ${index + 1}`;
    if (!isObject(item)) { errors.push(`${path} is invalid`); continue; }
    if (!publicHttpsUrl(item.sourceUrl)) errors.push(`${path} source URL is unsafe`);
    if (seenUrls.has(item.sourceUrl)) errors.push(`${path} repeats a source URL`);
    seenUrls.add(item.sourceUrl);
    if (!plainText(item.titleZh, 180) || !/[\u3400-\u9fff]/.test(item.titleZh)) errors.push(`${path} needs a concrete Chinese title`);
    if (!plainText(item.summaryZh, 500) || !/[\u3400-\u9fff]/.test(item.summaryZh)) errors.push(`${path} needs a concrete Chinese summary`);
    if (!plainText(item.quote, 1000) || item.quote.length < 25) errors.push(`${path} needs an original evidence quote`);
    if (!plainText(item.confirmedAppIdentity, 120)) errors.push(`${path} needs an independently confirmed product identity`);
    if (!isSubstantiveSocialStory({ title: item.sourceTitle, topic: item.confirmedTopic })) {
      errors.push(`${path} is not a concrete voice, live, or social interaction product change`);
    }
    if (typeof item.confirmedPublishedAt !== 'string' || !Number.isFinite(Date.parse(item.confirmedPublishedAt))) errors.push(`${path} needs an independently confirmed original publication date`);
    else {
      const age = now.getTime() - Date.parse(item.confirmedPublishedAt);
      if (age < -5 * 60000 || age > 7 * 86400000) errors.push(`${path} is outside the seven-day original-source window`);
    }
    if (!isObject(item.reviewEvidence) || !HEX_SHA256_RE.test(item.reviewEvidence.contentHash)
      || !plainText(item.reviewEvidence.sourceTitle, 300)
      || !publicHttpsUrl(item.reviewEvidence.finalUrl)
      || minutesFrom(now, item.reviewEvidence.checkedAt) < -5
      || minutesFrom(now, item.reviewEvidence.checkedAt) > 180) errors.push(`${path} lacks fresh independent review evidence`);
    const original = envelope.candidates?.[index];
    if (!isObject(original) || original.sourceUrl !== item.sourceUrl
      || original.titleZh !== item.titleZh || original.summaryZh !== item.summaryZh
      || original.quote !== item.quote) errors.push(`${path} differs from the independently reviewed candidate`);
  }
  return errors;
}

function priorItems(rows) {
  const urls = new Set();
  const titles = new Set();
  const bodies = [];
  for (const row of rows) {
    // Historical Xiaoluo reports predate structured editions. Compare their
    // actual text too; an empty edition does not mean an unpublished event.
    if (typeof row.body === 'string') bodies.push(row.body.replace(/\s+/g, '').toLowerCase());
    try {
      const edition = JSON.parse(row.edition_json || 'null');
      for (const section of edition?.sections ?? []) for (const item of section.items ?? []) {
        for (const url of item.sourceUrls ?? []) urls.add(url);
        if (typeof item.title === 'string') titles.add(item.title.replace(/\s+/g, '').toLowerCase());
      }
    } catch { /* Legacy article has no structured source links. */ }
  }
  return { urls, titles, bodies };
}

export async function buildVerifiedReport(envelope, now = new Date()) {
  const errors = validateSubmission(envelope, now);
  if (errors.length) throw new Error(errors.join('; '));
  const [, month, day] = envelope.reportDate.split('-').map(Number);
  const title = `${month}月${day}日海外语聊直播行业日报`;
  const facts = [];
  for (const item of envelope.verifiedItems) {
    facts.push({
      section: 'week_changes',
      event_key: await sourceEventKey(item.sourceUrl),
      reported_title: item.titleZh,
      verified_facts: [item.summaryZh],
      verified_app_identity: item.confirmedAppIdentity,
      source_urls: [item.sourceUrl],
      // A source publication timestamp is not proof of the underlying event
      // date. Keep the event date unknown; date-scope uses the known Beijing
      // publication day only.
      event_date: null,
      announcement_date: shanghaiDate(new Date(item.confirmedPublishedAt)),
      retrieved_at: item.reviewEvidence.checkedAt,
      verification_status: 'verified',
      previously_reported: false,
    });
  }
  const record = { report_date: envelope.reportDate, items: facts };
  const edition = createDailyEditionFromFactRecord(record, { highlightEventKeys: facts.slice(1, 4).map(item => item.event_key) });
  if (!validateDailyEdition(edition).ok) throw new Error('Constructed edition failed validation');
  const lines = [title, `统计区间：近 7 天（截至 ${envelope.reportDate}，北京时间）`];
  const markdown = [...lines];
  const wechat = [...lines];
  for (const [index, section] of edition.sections.entries()) {
    markdown.push(HEADINGS[index]);
    wechat.push(HEADINGS[index]);
    if (!section.items.length) {
      markdown.push('本期暂无可核验条目。');
      wechat.push('本期暂无可核验条目。');
      continue;
    }
    for (const entry of section.items) {
      markdown.push(entry.title, entry.summary);
      wechat.push(entry.title, entry.summary);
      for (const url of entry.sourceUrls) {
        markdown.push(`[${url}](${url})`);
        wechat.push(url);
      }
    }
  }
  markdown.push(FOOTER);
  wechat.push(FOOTER);
  return {
    date: envelope.reportDate, title, body: markdown.join('\n\n'),
    wechatBody: wechat.join('\n\n'), edition,
    sourceThread: `cloudflare:daily-auto:${envelope.reportDate}`,
    factRecord: record,
  };
}

async function saveRun(db, envelope, status, reason, report = null, now = new Date()) {
  const draftJson = JSON.stringify({ envelope, report });
  if (draftJson.length > 120000) throw new Error('Private draft exceeds storage limit');
  return db.prepare(`INSERT INTO daily_automation_runs (report_date,attempted_at,status,reason,draft_json,published_title)
    VALUES (?,?,?,?,?,?) ON CONFLICT(report_date) DO UPDATE SET attempted_at=excluded.attempted_at,
    status=excluded.status,reason=excluded.reason,draft_json=excluded.draft_json,
    published_title=excluded.published_title WHERE daily_automation_runs.status <> 'published'`)
    .bind(envelope.reportDate, now.toISOString(), status, reason.slice(0, 700), draftJson, report?.title ?? null).run();
}

export async function publishSubmission(db, envelope, now = new Date()) {
  const errors = validateSubmission(envelope, now);
  if (errors.length) {
    if (realDate(envelope?.reportDate)) await saveRun(db, envelope, 'rejected', errors.join('; '), null, now);
    return { status: 'rejected', reason: errors.join('; ') };
  }
  // A report already on the public site takes precedence over a failed or
  // successful retry. A rejected retry must not overwrite the day's success
  // signal or send a false missing-report notification.
  const existing = await db.prepare('SELECT title,body,edition_json FROM daily_reports WHERE report_date=?')
    .bind(envelope.reportDate).first();
  if (existing) {
    await saveRun(db, envelope, 'skipped_existing', 'This date already has a published daily report; automation does not overwrite it', null, now);
    return { status: 'skipped_existing', date: envelope.reportDate };
  }
  if (envelope.status === 'rejected') {
    const reason = typeof envelope.reason === 'string' && envelope.reason.trim() ? envelope.reason.trim() : 'Independent review did not pass';
    await saveRun(db, envelope, 'rejected', reason, null, now);
    return { status: 'rejected', reason };
  }
  let report;
  try {
    report = await buildVerifiedReport(envelope, now);
    const recent = await db.prepare('SELECT title,body,edition_json FROM daily_reports WHERE report_date<? ORDER BY report_date DESC LIMIT 365').bind(report.date).all();
    const { urls, titles, bodies } = priorItems(recent.results ?? []);
    for (const section of report.edition.sections) for (const item of section.items) {
      const compactTitle = item.title.replace(/\s+/g, '').toLowerCase();
      const sourceTitle = envelope.verifiedItems.find(candidate => candidate.sourceUrl === item.sourceUrls[0])?.sourceTitle;
      const compactSourceTitle = typeof sourceTitle === 'string' ? sourceTitle.replace(/\s+/g, '').toLowerCase() : '';
      if (item.sourceUrls.some(url => urls.has(url) || bodies.some(body => body.includes(url.toLowerCase())))
        || titles.has(compactTitle) || bodies.some(body => body.includes(compactTitle)
          || (compactSourceTitle.length >= 20 && body.includes(compactSourceTitle)))) {
        throw new Error(`Previously reported article or event: ${item.eventKey}`);
      }
    }
    const editionJson = JSON.stringify(report.edition);
    const draftJson = JSON.stringify({ envelope, report });
    if (draftJson.length > 120000) throw new Error('Private draft exceeds storage limit');
    await db.batch([
      // A concurrent manual or scheduled insert must abort this entire D1
      // transaction, not silently turn an ignored insert into a false
      // "published" audit row.
      db.prepare('INSERT INTO daily_reports (report_date,title,body,source_thread,updated_at,edition_json) VALUES (?,?,?,?,?,?)')
        .bind(report.date, report.title, report.body, report.sourceThread, now.toISOString(), editionJson),
      db.prepare(`INSERT INTO daily_automation_runs (report_date,attempted_at,status,reason,draft_json,published_title)
        VALUES (?,?,?,?,?,?) ON CONFLICT(report_date) DO UPDATE SET attempted_at=excluded.attempted_at,
        status=excluded.status,reason=excluded.reason,draft_json=excluded.draft_json,
        published_title=excluded.published_title WHERE daily_automation_runs.status <> 'published'`)
        .bind(report.date, now.toISOString(), 'published', '', draftJson, report.title),
    ]);
    const saved = await db.prepare('SELECT title,body,edition_json FROM daily_reports WHERE report_date=?').bind(report.date).first();
    if (saved?.title !== report.title || saved.body !== report.body || saved.edition_json !== editionJson) {
      throw new Error('D1 report differs after the attempted insert; inspect the date before retrying');
    }
    return { status: 'published', date: report.date, title: report.title, itemCount: envelope.verifiedItems.length };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Publication failed';
    await saveRun(db, envelope, 'rejected', reason, report ?? null, now);
    return { status: 'rejected', reason };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/submit') return new Response('Not Found', { status: 404 });
    const raw = await request.text();
    if (raw.length > 160000) return new Response('Payload too large', { status: 413 });
    let envelope;
    try { envelope = JSON.parse(raw); } catch { return new Response('Invalid JSON', { status: 400 }); }
    try {
      const result = await publishSubmission(env.DB, envelope);
      // A rejected review was safely recorded. Acknowledge delivery to the
      // reviewer; the status body, not HTTP transport status, says no publish.
      return Response.json(result);
    } catch (error) {
      console.error('daily publisher unavailable', error);
      return Response.json({ status: 'unavailable' }, { status: 503 });
    }
  },
};
