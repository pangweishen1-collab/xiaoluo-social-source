import test from 'node:test';
import assert from 'node:assert/strict';
import { atlasActivity, activityWindow, activityByType, beijingDay } from '../app/atlas-activity.mjs';
import { readFileSync } from 'node:fs';
const event = (id, title, date, status = 'published') => ({id, title, date, status, changes: [{type: '矩阵产品', text: '产品清单：A、B、C'}]});
test('typed additions match company, product and research units without inventing product growth', () => {
  const rows = [event('1','新增矩阵：A','2026-09-17'),event('2','新增矩阵：A','2026-09-17'),event('3','更新矩阵：B','2026-09-17')];
  const articles = [{slug:'a',publishedAt:'2026-09-18'},{slug:'a',publishedAt:'2026-09-18'},{slug:'b',publishedAt:'2026-09-19'}];
  assert.deepEqual(activityByType(rows,articles,'2026-09-18'), {week:{companies:1,products:null,articles:1},day:{companies:0,products:0,articles:1}});
  assert.equal(activityByType(rows,articles,null),null);
});
test('weekly counts include seven Beijing calendar days and deduplicate records, not companies', () => {
  const rows = [event('a','更新矩阵：A','2026-09-11T16:00:00Z'), event('b','更新矩阵：A','2026-09-17T16:00:00Z'), event('b','更新矩阵：A','2026-09-17T16:00:00Z'),
    event('old','旧记录','2026-09-11T15:59:59Z'),event('future','未来','2026-09-18T16:00:00Z'),event('bad','无效','invalid'),event('draft','草稿','2026-09-18','draft'),
    {...event('site','网站调整','2026-09-18'), changes:[{type:'网站调整'}]},
    {...event('article','文章','2026-09-18'), changes:[{type:'行业文章'},{type:'行业文章'}]}];
  assert.deepEqual(activityWindow(rows, '2026-09-18T05:00:00Z'), {start:'2026-09-12',today:'2026-09-18',week:3,day:2});
});
test('empty, stale and midnight states use today rather than latest event', () => {
  const rows = [event('a','矩阵','2026-09-17T15:59:59Z')];
  assert.equal(activityWindow(rows,'2026-09-17T15:59:59Z').day,1);
  assert.equal(activityWindow(rows,'2026-09-17T16:00:00Z').day,0);
  assert.equal(activityWindow(rows,'2026-10-01').week,0);
  assert.deepEqual(activityWindow([],'2026-01-02'),{start:'2025-12-27',today:'2026-01-02',week:0,day:0});
  assert.equal(activityWindow(rows,null),null);
});
test('activity uses Beijing dates and not the current day', () => {
  assert.equal(beijingDay('2026-09-16T17:00:00Z'), '2026-09-17');
  assert.equal(beijingDay('invalid'), null);
  const result = atlasActivity([event('1','新增矩阵：公司A','2026-09-16T17:00:00Z')], [{slug:'a',publishedAt:'2026-09-17T00:00:00Z'}]);
  assert.equal(result.date, '2026-09-17'); assert.equal(result.companies, 1); assert.equal(result.articles, 1);
  assert.equal(result.products, undefined);
});
test('deduplicates company updates and ignores drafts and prior days', () => {
  const rows = [event('1','更新矩阵：A','2026-09-17'),event('2','更新矩阵：A','2026-09-17'),event('3','新增矩阵：B','2026-09-16'),event('4','新增矩阵：C','2026-09-18','draft')];
  const result = atlasActivity(rows, []); assert.equal(result.updatedCompanies, 1); assert.equal(result.companies, 0); assert.equal(result.date,'2026-09-17');
});
test('empty history has no invented date or growth', () => {const r = atlasActivity([], []); assert.equal(r.date,null); assert.equal(r.articles,0);});
test('overview precedes company research and replaces the former module', () => {
  const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
  assert.ok(page.indexOf('<AtlasOverview ') < page.indexOf('aria-labelledby="home-research-title"'));
  assert.ok(!page.includes('className="shell home-atlas"'));
});
test('overview only renders positive metric additions and omits removed labels and arrows', () => {
  const source = readFileSync(new URL('../app/atlas-overview.tsx', import.meta.url), 'utf8');
  assert.match(source, /activity.companies > 0 && <em[^>]+>\+\{activity.companies\}<\/em>/);
  assert.match(source, /activity.articles > 0 && <em[^>]+>\+\{activity.articles\}<\/em>/);
  assert.doesNotMatch(source, /PRODUCT ATLAS|浏览完整矩阵|atlas-count-note|按公司查看产品布局|按名称检索与核验归属|↗|→/);
});
test('statistics keep metric navigation and accessible groups without the retired update strip', () => {
  const source = readFileSync(new URL('../app/atlas-overview.tsx', import.meta.url), 'utf8');
  assert.equal((source.match(/onNavigate\('matrix'\)/g) || []).length, 2);
  assert.equal((source.match(/onNavigate\('analysis'\)/g) || []).length, 1);
  assert.match(source, /role="group" aria-label="研究资料规模"/);
  assert.doesNotMatch(source, /UpdatesDialog|近7天新增|查看更新|微信群人数|setInterval/);
  assert.ok(source.indexOf('atlas-overview-metrics') < source.indexOf('statistics-audience'));
  assert.match(source, /小红书主页核对：2026-10-20">1,799<\/dd>/);
});
test('statistics use one complete transparent frame and a responsive sidebar', () => {
  const css = readFileSync(new URL('../app/atlas-overview.css', import.meta.url), 'utf8');
  assert.match(css, /\.home-statistics-panel \{[^}]*border: 1px solid var\(--color-border\) !important;[^}]*background: transparent;/);
  assert.match(css, /\.statistics-main \{[^}]*grid-template-columns: minmax\(0, 3fr\) minmax\(0, 1fr\)/);
  assert.match(css, /\.atlas-overview-metrics > button \+ button::before,[\s\S]*?\.statistics-audience::before \{[^}]*height: 64px;[^}]*background: var\(--color-border\);[^}]*transform: translateY\(-50%\)/);
  assert.match(css, /\.statistics-main \{[^}]*padding-block: 12px;/);
  assert.match(css, /\.statistics-audience \{[^}]*grid-template-rows: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.statistics-audience \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); grid-template-rows: minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /\.atlas-activity/);
  assert.doesNotMatch(css, /statistics-community-start/);
  assert.match(css, /\.atlas-metric-increase \{[^}]*color: #b42318/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.statistics-main \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /display: contents|\border\s*:/);
});
