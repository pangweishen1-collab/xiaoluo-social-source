import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { validateDailyEdition } from '../shared/daily-edition.mjs';
import {
  checkHistoricalDuplicates, checkSourceUrls, isValidDate, validateAutomatedBundle,
} from './daily-publication-gate.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = 'https://xiaoluo-social.pages.dev';
const input = process.argv[2];
if (!input || input.startsWith('--')) {
  throw new Error('Usage: publish-daily.mjs report.json [--edition edition.json] [--auto --fact-record facts.json --verification verdict.json] [--remote | --manual-confirmed --remote]');
}
const options = new Map();
for (let i = 3; i < process.argv.length; i += 1) {
  const flag = process.argv[i];
  if (!['--edition', '--fact-record', '--verification', '--auto', '--remote', '--manual-confirmed'].includes(flag) || options.has(flag)) throw new Error(`Unknown or repeated option: ${flag}`);
  if (['--edition', '--fact-record', '--verification'].includes(flag)) {
    const value = process.argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`Provide a file after ${flag}`);
    options.set(flag, value);
  } else options.set(flag, true);
}
const isAuto = options.has('--auto');
const isRemote = options.has('--remote');
if (isAuto && options.has('--manual-confirmed')) throw new Error('--auto and --manual-confirmed are mutually exclusive');
if (isAuto && (options.has('--edition') || !options.has('--fact-record') || !options.has('--verification'))) {
  throw new Error('Automated publication requires inline edition, --fact-record, and --verification');
}
if (isRemote && !isAuto && !options.has('--manual-confirmed')) {
  throw new Error('Remote write blocked: use a verified --auto bundle, or explicitly confirm a manual review with --manual-confirmed');
}

const rawPayload = await readFile(input, 'utf8');
const data = JSON.parse(rawPayload);
if (!isValidDate(data.date) || typeof data.sourceThread !== 'string'
  || !/^[a-zA-Z0-9._:/-]{3,160}$/.test(data.sourceThread)
  || typeof data.title !== 'string' || !data.title.trim() || data.title.length > 160
  || typeof data.body !== 'string' || data.body.trim().length < 80 || data.body.length > 80000) {
  throw new Error('Invalid daily report payload: date, title, body and sourceThread provenance are required');
}
if (options.has('--edition') && Object.hasOwn(data, 'edition')) throw new Error('Provide edition in the payload or --edition, not both');
if (options.has('--edition')) data.edition = JSON.parse(await readFile(options.get('--edition'), 'utf8'));
const hasEdition = Object.hasOwn(data, 'edition');
if (hasEdition && data.edition !== null) {
  const result = validateDailyEdition(data.edition);
  if (!result.ok) throw new Error(`Invalid daily edition: ${result.errors.join('; ')}`);
}
const editionJson = hasEdition && data.edition !== null ? JSON.stringify(data.edition) : null;
if (editionJson && editionJson.length > 120000) throw new Error('Daily edition exceeds 120000 characters');

let record;
if (isAuto) {
  const rawFactRecord = await readFile(options.get('--fact-record'), 'utf8');
  record = JSON.parse(rawFactRecord);
  const attestation = JSON.parse(await readFile(options.get('--verification'), 'utf8'));
  const errors = validateAutomatedBundle({
    data, rawPayload, record, rawFactRecord, attestation,
    publicKeyPem: process.env.XIAOLU_DAILY_VERIFIER_PUBLIC_KEY,
  });
  if (errors.length) throw new Error(`Automated publication blocked:\n- ${errors.join('\n- ')}`);
}
if (!isRemote) {
  console.log(isAuto ? 'Signed evidence bundle passed local checks; no website changes. Use --remote for live-source/history checks and publication.' : 'Validated manual payload; no website changes. Use --manual-confirmed --remote after human review.');
  process.exit(0);
}

const getJson = async path => {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Public API ${path} returned HTTP ${response.status}`);
  return response.json();
};
if (isAuto) {
  const sourceFailures = await checkSourceUrls(data.edition);
  if (sourceFailures.length) throw new Error(`Automated publication blocked by inaccessible sources:\n- ${sourceFailures.join('\n- ')}`);
  const archive = await getJson('/api/daily-reports?index=1');
  if (!Array.isArray(archive.items)) throw new Error('Public daily archive is unavailable for duplicate review');
  const priorDates = archive.items.map(item => item.date)
    .filter(date => isValidDate(date) && date < data.date);
  const priorEditions = [];
  for (let i = 0; i < priorDates.length; i += 5) {
    const previous = await Promise.all(priorDates.slice(i, i + 5).map(date => getJson(`/api/daily-reports/${date}`)));
    priorEditions.push(...previous.map(result => result.item?.edition).filter(Boolean));
  }
  const duplicates = checkHistoricalDuplicates(data.edition, priorEditions, record);
  if (duplicates.length) throw new Error(`Automated publication blocked by repeated events:\n- ${duplicates.join('\n- ')}`);
  const existing = await fetch(`${baseUrl}/api/daily-reports/${data.date}`, { signal: AbortSignal.timeout(12000) });
  if (existing.ok) {
    const item = (await existing.json()).item;
    if (item?.title === data.title && item.body === data.body && JSON.stringify(item.edition) === editionJson) {
      console.log(`Daily report already published with matching content: ${data.date}`);
      process.exit(0);
    }
    throw new Error('A different report already exists for this date; automatic mode will not overwrite it');
  }
  if (existing.status !== 404) throw new Error(`Cannot confirm daily date is unused: HTTP ${existing.status}`);
}

const quote = value => `'${value.replaceAll("'", "''")}'`;
const columns = 'report_date,title,body,source_thread,updated_at,edition_json';
const values = [data.date, data.title, data.body, data.sourceThread, new Date().toISOString()]
  .map(quote).concat(editionJson === null ? 'NULL' : quote(editionJson));
const sql = isAuto
  ? `INSERT INTO daily_reports(${columns}) VALUES(${values.join(',')}) ON CONFLICT(report_date) DO NOTHING;`
  : `INSERT INTO daily_reports(${columns}) VALUES(${values.join(',')}) ON CONFLICT(report_date) DO UPDATE SET title=excluded.title,body=excluded.body,edition_json=CASE WHEN ${hasEdition ? 1 : 0}=1 THEN excluded.edition_json WHEN daily_reports.body<>excluded.body THEN NULL ELSE daily_reports.edition_json END,updated_at=excluded.updated_at WHERE daily_reports.body<>excluded.body OR daily_reports.title<>excluded.title OR (${hasEdition ? 1 : 0}=1 AND daily_reports.edition_json IS NOT excluded.edition_json);`;
const folder = await mkdtemp(join(tmpdir(), 'xiaoluo-daily-'));
const file = join(folder, 'report.sql');
try {
  await writeFile(file, sql, { mode: 0o600 });
  execFileSync(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'xiaoluo-visitor-stats', '--config', join(root, 'wrangler.daily.json'), '--remote', '--file', file], { cwd: root, stdio: 'inherit' });
} catch (error) {
  throw new Error('Daily report write failed. Confirm Wrangler access and production edition_json migration; inspect the actual row before retrying.', { cause: error });
} finally {
  await rm(folder, { recursive: true, force: true });
}
const item = (await getJson(`/api/daily-reports/${data.date}`)).item;
if (item?.date !== data.date || item.title !== data.title || item.body !== data.body
  || (hasEdition && JSON.stringify(item.edition) !== editionJson)) {
  throw new Error('Remote write attempted but public content differs; inspect the row before retrying');
}
console.log(`Verified published daily report: ${data.date}`);
