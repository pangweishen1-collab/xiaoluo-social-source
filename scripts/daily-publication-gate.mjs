import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { isIP } from 'node:net';
import { createDailyEditionFromFactRecord, isOriginalHttpsUrl, validateDailyEdition } from '../shared/daily-edition.mjs';

const SECTION_HEADINGS = ['一、产品雷达', '二、团队与招聘动向', '三、语聊直播产品近一周变化'];
const REQUIRED_CHECKS = ['source_access', 'claim_support', 'app_identity', 'date_scope', 'dedupe', 'output_parity'];
const SITE_FOOTER = '小骆语聊：https://xiaoluo-social.pages.dev/';
const MARKDOWN_SITE_FOOTER = '小骆语聊：[https://xiaoluo-social.pages.dev/](https://xiaoluo-social.pages.dev/)';
const MARKDOWN_SOURCE_LINK = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export const sha256 = raw => createHash('sha256').update(raw).digest('hex');

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function isValidDate(value) {
  return typeof value === 'string' && DATE_RE.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function shanghaiDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = type => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function normalizedLines(value) {
  return value.split(/\r?\n/).map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^#{1,6}\s+/, '').replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$2').replaceAll('**', '').trim());
}

function sourceLinkErrors(rawBody, lines, edition, label) {
  const errors = [];
  const rawLines = rawBody.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  for (const line of rawLines) {
    if (!/https?:\/\//i.test(line) || line === SITE_FOOTER || (label === 'Markdown' && line === MARKDOWN_SITE_FOOTER)) continue;
    if (label === 'WeChat') {
      if (!isOriginalHttpsUrl(line)) errors.push('WeChat source URLs must be complete original HTTPS URLs on separate lines');
      continue;
    }
    const link = line.match(MARKDOWN_SOURCE_LINK);
    if (!link || !isOriginalHttpsUrl(link[1]) || !isOriginalHttpsUrl(link[2])
      || new URL(link[1]).href !== new URL(link[2]).href) {
      errors.push('Markdown source URLs must be standalone links with the full URL as their label');
    }
  }

  const positions = SECTION_HEADINGS.map(heading => lines.indexOf(heading));
  if (positions.some(index => index < 0) || !validateDailyEdition(edition).ok) return errors;
  for (const [sectionIndex, section] of edition.sections.entries()) {
    const sectionEnd = positions[sectionIndex + 1] ?? lines.length - 1;
    const itemStarts = section.items.map(item => {
      const matches = [];
      for (let index = positions[sectionIndex] + 1; index < sectionEnd; index += 1) {
        if (lines[index] === item.title) matches.push(index);
      }
      if (matches.length !== 1) errors.push(`${label} must contain edition item ${item.eventKey} exactly once in its section`);
      return matches[0];
    });
    if (itemStarts.some(index => index === undefined || index < 0)
      || itemStarts.some((index, itemIndex) => itemIndex > 0 && index <= itemStarts[itemIndex - 1])) continue;
    const beforeFirst = lines.slice(positions[sectionIndex] + 1, itemStarts[0] ?? sectionEnd);
    if (beforeFirst.some(isOriginalHttpsUrl)) errors.push(`${label} has a source URL outside an edition item in ${section.key}`);
    section.items.forEach((item, itemIndex) => {
      const actual = lines.slice(itemStarts[itemIndex] + 1, itemStarts[itemIndex + 1] ?? sectionEnd)
        .filter(isOriginalHttpsUrl);
      if (actual.length !== item.sourceUrls.length || new Set(actual).size !== actual.length
        || canonicalJson([...actual].sort()) !== canonicalJson([...item.sourceUrls].sort())) {
        errors.push(`${label} source URLs for ${item.eventKey} must exactly match its verified edition sources`);
      }
    });
  }
  return errors;
}

export function validateReportPair(data) {
  const errors = [];
  if (typeof data?.body !== 'string' || !data.body.trim()) return ['body is required for automated publication'];
  if (typeof data.wechatBody !== 'string' || !data.wechatBody.trim()) return ['wechatBody is required for automated publication'];
  if (!isValidDate(data.date)) return ['Report pair date is invalid'];
  const markdown = normalizedLines(data.body);
  const wechat = normalizedLines(data.wechatBody);
  const [, month, day] = data.date.split('-').map(Number);
  const expectedTitle = `${month}月${day}日海外语聊直播行业日报`;
  if (markdown[0] !== expectedTitle || wechat[0] !== expectedTitle || data.title !== expectedTitle) {
    errors.push('Report title must match the report date in both formats');
  }
  for (const [label, lines] of [['Markdown', markdown], ['WeChat', wechat]]) {
    const positions = SECTION_HEADINGS.map(heading => lines.indexOf(heading));
    if (positions.some(index => index < 0) || positions.some((index, i) => lines.filter(line => line === SECTION_HEADINGS[i]).length !== 1)
      || positions.some((index, i) => i > 0 && index <= positions[i - 1])) errors.push(`${label} must contain the three fixed sections exactly once in order`);
    if (lines.filter(line => line === SITE_FOOTER).length !== 1 || lines.at(-1) !== SITE_FOOTER) errors.push(`${label} must end with the single Xiaoluo footer`);
    if (lines.some(line => /^(市场|来源|状态|出处|参考链接)\s*[:：]/.test(line))) errors.push(`${label} contains a forbidden standalone field`);
  }
  if (canonicalJson(markdown) !== canonicalJson(wechat)) errors.push('Markdown and WeChat text must have identical nonempty lines');
  if (/^\s*#{1,6}\s/m.test(data.wechatBody) || /\*\*|\]\(https?:/i.test(data.wechatBody)) errors.push('WeChat text must not contain Markdown');
  if (!validateDailyEdition(data.edition).ok) errors.push('Report pair needs a valid structured edition for source URL parity');
  errors.push(...sourceLinkErrors(data.body, markdown, data.edition, 'Markdown'));
  errors.push(...sourceLinkErrors(data.wechatBody, wechat, data.edition, 'WeChat'));
  return errors;
}

function ageInDays(date, reportDate) {
  return Math.round((Date.parse(`${reportDate}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000);
}

export function validateFactRecord(record, edition, reportDate, now = new Date()) {
  const errors = [];
  if (!isRecord(record) || record.report_date !== reportDate || !Array.isArray(record.items)) return ['Fact record date/items do not match report'];
  const verified = record.items.filter(item => isRecord(item) && item.verification_status === 'verified');
  const seen = new Set();
  for (const [index, fact] of verified.entries()) {
    const path = `verified fact ${index + 1}`;
    if (typeof fact.event_key !== 'string' || !fact.event_key.trim() || seen.has(fact.event_key)) errors.push(`${path}: missing or duplicate event_key`);
    seen.add(fact.event_key);
    if (typeof fact.verified_app_identity !== 'string' || !fact.verified_app_identity.trim()) errors.push(`${path}: verified_app_identity is required`);
    if (!Array.isArray(fact.verified_facts) || !fact.verified_facts.length || fact.verified_facts.some(text => typeof text !== 'string' || !text.trim())) errors.push(`${path}: concrete verified_facts are required`);
    if (!Array.isArray(fact.source_urls) || !fact.source_urls.length || fact.source_urls.some(url => !isOriginalHttpsUrl(url))) errors.push(`${path}: original HTTPS source_urls are required`);
    const retrieved = Date.parse(fact.retrieved_at);
    if (!Number.isFinite(retrieved) || retrieved > now.getTime() + 300000 || now.getTime() - retrieved > 48 * 3600000) errors.push(`${path}: retrieved_at must be within 48 hours`);
    if (fact.previously_reported !== true && fact.previously_reported !== false) errors.push(`${path}: previously_reported must be explicit`);
    if (fact.previously_reported === true && (typeof fact.substantive_new_detail !== 'string' || !fact.substantive_new_detail.trim()
      || !fact.verified_facts.some(text => text.includes(fact.substantive_new_detail.trim())))) errors.push(`${path}: a repeated event needs an evidenced substantive new detail`);
    if (fact.section === 'week_changes') {
      const datedEvidence = [fact.event_date, fact.announcement_date]
        .filter(isValidDate).some(date => ageInDays(date, reportDate) >= 0 && ageInDays(date, reportDate) <= 6);
      if (!datedEvidence) errors.push(`${path}: week_changes must have an event/announcement date inside the 7-day window`);
    }
    if (fact.section === 'radar') {
      if (!isValidDate(fact.snapshot_date) || ageInDays(fact.snapshot_date, reportDate) < 0 || ageInDays(fact.snapshot_date, reportDate) > 7
        || !fact.rank_market || !['App Store', 'Google Play'].includes(fact.rank_store) || !fact.rank_category
        || !Number.isInteger(fact.rank_current) || fact.rank_current < 1) errors.push(`${path}: radar ranking needs a recent dated, identified market/store/chart/rank`);
      if (fact.rank_previous !== null && fact.rank_previous !== undefined
        && (!Number.isInteger(fact.rank_previous) || fact.rank_previous < 1 || !isValidDate(fact.rank_previous_date)
          || fact.rank_previous_date >= fact.snapshot_date)) errors.push(`${path}: prior ranking needs a valid earlier snapshot date`);
    }
    if (fact.section === 'hiring' && fact.job_open_status !== '开放') errors.push(`${path}: automated hiring items must have a confirmed open role`);
  }
  if (!verified.length) errors.push('Automated publication needs at least one verified event; do not publish filler');
  try {
    const fromFacts = createDailyEditionFromFactRecord(record);
    if (canonicalJson(fromFacts.sections) !== canonicalJson(edition.sections)) errors.push('Edition items do not exactly match the verified fact record');
  } catch (error) {
    errors.push(`Fact record cannot form an edition: ${error.message}`);
  }
  return errors;
}

export function validateEditionBody(edition, body) {
  const missing = [];
  for (const section of edition.sections ?? []) for (const item of section.items ?? []) {
    if (!body.includes(item.title)) missing.push(`Report body omits edition item: ${item.eventKey}`);
  }
  return missing;
}

export function validateAttestation(attestation, rawPayload, rawFactRecord, edition, reportDate, publicKeyPem, now = new Date()) {
  const errors = [];
  if (!isRecord(attestation)) return ['Verification attestation is required'];
  const { signature, ...signed } = attestation;
  if (attestation.schemaVersion !== 1 || attestation.verdict !== 'pass' || attestation.reportDate !== reportDate) errors.push('Attestation verdict/date/schema mismatch');
  if (attestation.payloadSha256 !== sha256(rawPayload) || attestation.factRecordSha256 !== sha256(rawFactRecord)) errors.push('Attestation does not bind the exact payload and fact record');
  const checkedAt = Date.parse(attestation.checkedAt);
  if (!Number.isFinite(checkedAt) || checkedAt > now.getTime() + 300000 || now.getTime() - checkedAt > 24 * 3600000) errors.push('Attestation must be recent (within 24 hours)');
  if (typeof attestation.verifierId !== 'string' || !/^[a-zA-Z0-9._:-]{3,100}$/.test(attestation.verifierId)) errors.push('Attestation verifierId is invalid');
  const expectedKeys = edition.sections.flatMap(section => section.items.map(item => item.eventKey)).sort();
  if (!Array.isArray(attestation.verifiedEventKeys) || canonicalJson([...attestation.verifiedEventKeys].sort()) !== canonicalJson(expectedKeys)) errors.push('Attestation must cover every published event');
  if (!isRecord(attestation.checks) || REQUIRED_CHECKS.some(check => attestation.checks[check] !== 'pass')) errors.push('Attestation must pass every required independent check');
  if (!publicKeyPem) errors.push('XIAOLU_DAILY_VERIFIER_PUBLIC_KEY is not configured');
  else {
    try {
      const sig = typeof signature === 'string' ? Buffer.from(signature, 'base64') : Buffer.alloc(0);
      if (!sig.length || !verifySignature(null, Buffer.from(canonicalJson(signed)), createPublicKey(publicKeyPem), sig)) errors.push('Attestation signature is invalid');
    } catch { errors.push('Attestation signature/key is invalid'); }
  }
  return errors;
}

export function validateAutomatedBundle({ data, rawPayload, record, rawFactRecord, attestation, publicKeyPem, now = new Date() }) {
  const errors = [];
  if (!isValidDate(data?.date)) return ['Payload date is invalid'];
  if (data.date !== shanghaiDate(now)) errors.push('Automated publication only runs for the current Asia/Shanghai date');
  if (!isRecord(data.edition) || !validateDailyEdition(data.edition).ok) errors.push('Automated publication requires a valid structured edition');
  else {
    errors.push(...validateFactRecord(record, data.edition, data.date, now));
    errors.push(...validateEditionBody(data.edition, data.body));
    errors.push(...validateAttestation(attestation, rawPayload, rawFactRecord, data.edition, data.date, publicKeyPem, now));
  }
  errors.push(...validateReportPair(data));
  return errors;
}

export function isPublicSourceUrl(value) {
  if (!isOriginalHttpsUrl(value)) return false;
  const hostname = new URL(value).hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (isIP(hostname) || !hostname.includes('.')) return false;
  return !['localhost', 'local', 'internal', 'lan', 'home', 'test', 'invalid', 'arpa', 'onion']
    .some(suffix => hostname === suffix || hostname.endsWith(`.${suffix}`));
}

export async function checkSourceUrls(edition, fetcher = fetch, { timeoutMs = 8000 } = {}) {
  const urls = [...new Set(edition.sections.flatMap(section => section.items.flatMap(item => item.sourceUrls)))];
  const failures = [];
  for (let start = 0; start < urls.length; start += 5) {
    await Promise.all(urls.slice(start, start + 5).map(async url => {
      try {
        let current = url;
        let succeeded = false;
        for (let hop = 0; hop < 6; hop += 1) {
          if (!isPublicSourceUrl(current)) {
            failures.push(`${url}: private or unsafe source/redirect URL`);
            break;
          }
          const response = await fetcher(current, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'XiaoluoDailyVerifier/1.0' } });
          if (response.status >= 300 && response.status < 400) {
            const location = response.headers?.get?.('location');
            await response.body?.cancel();
            if (!location) { failures.push(`${url}: redirect without Location`); break; }
            current = new URL(location, current).href;
            if (hop === 5) failures.push(`${url}: too many redirects`);
            continue;
          }
          if (!response.ok || !isPublicSourceUrl(response.url || current)) failures.push(`${url}: HTTP ${response.status}`);
          else succeeded = true;
          await response.body?.cancel();
          break;
        }
        if (!succeeded && !failures.some(failure => failure.startsWith(`${url}:`))) failures.push(`${url}: source was not reachable`);
      } catch (error) { failures.push(`${url}: ${error?.message ?? 'network error'}`); }
    }));
  }
  return failures;
}

export function checkHistoricalDuplicates(edition, priorEditions, record) {
  const priorKeys = new Set(priorEditions.flatMap(previous => previous?.sections?.flatMap(section => section.items?.map(item => item.eventKey) ?? []) ?? []));
  const facts = new Map(record.items.filter(isRecord).map(item => [item.event_key, item]));
  return edition.sections.flatMap(section => section.items).filter(item => priorKeys.has(item.eventKey)).flatMap(item => {
    const fact = facts.get(item.eventKey);
    return fact?.previously_reported === true && typeof fact.substantive_new_detail === 'string'
      && fact.substantive_new_detail.trim() && fact.verified_facts?.some(text => text.includes(fact.substantive_new_detail.trim()))
      ? [] : [`Previously published event without verified new detail: ${item.eventKey}`];
  });
}
