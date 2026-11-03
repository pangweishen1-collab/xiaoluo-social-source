import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: [new URL('../worker/articles.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', write: false });
const { handleArticleApi } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));

const edition = {
  schemaVersion: 1,
  leadItemId: 'discord-feature',
  highlightIds: ['yalla-hiring'],
  sections: [
    { key: 'radar', label: '产品雷达', items: [{ id: 'discord-feature', eventKey: 'discord-feature', title: 'Discord 推出新社交功能', summary: '官方公布了新的社区互动功能。', eventDate: '2026-10-14', sourceUrls: ['https://discord.com/blog/feature'] }] },
    { key: 'hiring', label: '团队与招聘动向', items: [{ id: 'yalla-hiring', eventKey: 'yalla-hiring', title: 'Yalla 招聘直播岗位', summary: '官方职位页显示招聘。', eventDate: null, sourceUrls: ['https://careers.example.com/yalla'] }] },
    { key: 'week_changes', label: '语聊直播产品近一周变化', items: [] },
  ],
};

function createHarness() {
  const db = new DatabaseSync(':memory:');
  // Model a production database created before edition_json was introduced.
  db.exec('CREATE TABLE daily_reports (report_date TEXT PRIMARY KEY NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,source_thread TEXT NOT NULL,updated_at TEXT NOT NULL)');
  db.prepare('INSERT INTO daily_reports VALUES (?,?,?,?,?)').run('2026-10-12', '旧版日报', '旧正文', 'historical-thread', '2026-10-12T02:00:00.000Z');
  db.exec(readFileSync(new URL('../db/daily-reports-edition.sql', import.meta.url), 'utf8'));
  db.exec('CREATE TABLE talent_admin_sessions (token TEXT, expires_at TEXT)');
  db.prepare('INSERT INTO talent_admin_sessions VALUES (?,?)').run('12345678-1234-1234-1234-123456789012', '2099-01-01');
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => db.prepare(sql).get(...args),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: db.prepare(sql).run(...args) }),
  });
  const DB = { prepare: statement, batch: async statements => {
    db.exec('BEGIN');
    try { const results = []; for (const query of statements) results.push(await query.run()); db.exec('COMMIT'); return results; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  } };
  const env = { DB, MEDIA: { put: async () => {} } };
  async function call(path, method = 'GET', body, auth = true) {
    const url = new URL('http://test.local' + path);
    const response = await handleArticleApi(new Request(url, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Cookie: 'xiaoluo_admin=12345678-1234-1234-1234-123456789012' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), env, url);
    assert.ok(response);
    return response;
  }
  return { db, call };
}

test('additive edition migration leaves historical Markdown untouched', () => {
  const { db } = createHarness();
  assert.equal(db.prepare('SELECT body FROM daily_reports WHERE report_date=?').get('2026-10-12').body, '旧正文');
  assert.equal(db.prepare('SELECT edition_json FROM daily_reports WHERE report_date=?').get('2026-10-12').edition_json, null);
  const freshDb = new DatabaseSync(':memory:');
  freshDb.exec(readFileSync(new URL('../db/daily-reports.sql', import.meta.url), 'utf8'));
  assert.ok(freshDb.prepare('PRAGMA table_info(daily_reports)').all().some(column => column.name === 'edition_json'));
});

test('daily index and detail serve compact navigation plus legacy and structured editions', async () => {
  const { call, db } = createHarness();
  const report = { date: '2026-10-14', title: '小骆日报', body: '### 产品雷达\n\nDiscord 官方更新', edition };
  assert.equal((await call('/api/daily-reports', 'POST', report, false)).status, 401);
  assert.equal((await call('/api/daily-reports', 'POST', 'invalid')).status, 400);
  assert.equal((await call('/api/daily-reports', 'POST', { ...report, edition: { ...edition, leadItemId: 'missing' } })).status, 400);
  assert.equal((await call('/api/daily-reports', 'POST', { ...report, edition: { ...edition, sections: [{ ...edition.sections[0], items: [{ ...edition.sections[0].items[0], sourceUrls: ['javascript:alert(1)'] }] }, ...edition.sections.slice(1)] } })).status, 400);
  assert.equal((await call('/api/daily-reports', 'POST', report)).status, 201);
  assert.equal((await call('/api/daily-reports', 'POST', report)).status, 409);

  const compact = (await (await call('/api/daily-reports?index=1')).json()).items;
  assert.deepEqual(compact.map(item => item.date), ['2026-10-14', '2026-10-12']);
  assert.equal(compact[0].leadTitle, 'Discord 推出新社交功能');
  assert.equal(compact[1].leadTitle, '旧版日报');
  assert.ok(compact.every(item => !Object.hasOwn(item, 'body') && !Object.hasOwn(item, 'edition')));

  const structured = (await (await call('/api/daily-reports/2026-10-14')).json()).item;
  assert.equal(structured.body, report.body);
  assert.deepEqual(structured.edition, edition);
  const legacy = (await (await call('/api/daily-reports/2026-10-12')).json()).item;
  assert.equal(legacy.body, '旧正文');
  assert.equal(legacy.edition, null);
  assert.equal((await call('/api/daily-reports/2026-10-11')).status, 404);
  assert.equal((await call('/api/daily-reports/not-a-date')).status, 400);
  assert.equal((await call('/api/daily-reports/2026-10-14', 'PATCH', report)).status, 405);
  const oldList = (await (await call('/api/daily-reports')).json()).items;
  assert.equal(oldList[0].body, report.body);
  db.prepare('UPDATE daily_reports SET edition_json=? WHERE report_date=?').run('{broken', report.date);
  assert.equal((await (await call('/api/daily-reports/' + report.date)).json()).item.edition, null);
  assert.equal((await (await call('/api/daily-reports?index=1')).json()).items[0].leadTitle, report.title);
});

test('daily PATCH retains edition for title-only edits and clears it when Markdown diverges', async () => {
  const { call, db } = createHarness();
  const report = { date: '2026-10-14', title: '小骆日报', body: '原正文', edition };
  assert.equal((await call('/api/daily-reports', 'POST', report)).status, 201);
  const titleOnly = (await (await call('/api/daily-reports', 'PATCH', { date: report.date, title: '修订标题', body: report.body })).json()).item;
  assert.deepEqual(titleOnly.edition, edition);
  const markdownChanged = (await (await call('/api/daily-reports', 'PATCH', { date: report.date, title: '修订标题', body: '新正文' })).json()).item;
  assert.equal(markdownChanged.edition, null);
  assert.equal(db.prepare('SELECT edition_json FROM daily_reports WHERE report_date=?').get(report.date).edition_json, null);
  assert.equal((await call('/api/daily-reports', 'PATCH', { date: report.date, title: '修订标题', body: '新正文', edition })).status, 200);
  const cleared = (await (await call('/api/daily-reports', 'PATCH', { date: report.date, title: '修订标题', body: '新正文', edition: null })).json()).item;
  assert.equal(cleared.edition, null);
  assert.equal((await call('/api/daily-reports', 'PATCH', { date: '2026-10-15', title: '不存在', body: '无' })).status, 404);
});
