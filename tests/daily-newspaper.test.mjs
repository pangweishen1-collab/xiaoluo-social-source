import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { prepareDailyNewspaper, splitDailyHeadlineIntro } from '../app/daily-newspaper.mjs';

const source = `统计区间：9月15日—9月16日（北京时间）\n历史内容单独标明日期。\n\n## 一、首次发现产品\n\n**产品 A｜Android｜语聊**  \n开发者：公司 A\nhttps://play.google.com/store/apps/details?id=example.a\n\n**产品 B｜游戏语聊**\n原文未确认上线状态。\n\n[来源](https://example.com/b?lang=en&v=1)\n\n二、团队与招聘\n\n以下为历史在招机会，非昨日新增。\n\n**产品 C｜商务拓展**\n发布日期：8月31日。\n\n- 英语要求\n- 本地运营经验\n\n[来源](https://example.com/hiring)\n\n### 三、产品近一周变化\n\n**产品 D｜更新**\n更新日期：9月10日。\n\n[来源](https://example.com/b?lang=en&v=1)`;

test('newspaper groups original columns and stories without inventing a lead or losing caveats', () => {
  const paper = prepareDailyNewspaper(source);
  assert.equal(paper.intro, '统计区间：9月15日—9月16日（北京时间）\n历史内容单独标明日期。');
  assert.equal(paper.total, 4);
  assert.equal(paper.sourceCount, 3);
  assert.deepEqual(paper.sections.map(s => s.label), ['首次发现产品', '团队与招聘', '产品近一周变化']);
  assert.deepEqual(paper.sections.map(s => s.number), ['01', '02', '03']);
  assert.deepEqual(paper.sections.map(s => s.stories.length), [2, 1, 1]);
  assert.equal(paper.sections[1].intro, '以下为历史在招机会，非昨日新增。');
  assert.equal(paper.sections[0].stories[1].title, '产品 B｜游戏语聊');
  assert.match(paper.sections[0].stories[1].body, /原文未确认上线状态/);
  assert.match(paper.sections[1].stories[0].body, /发布日期：8月31日/);
  assert.match(paper.sections[1].stories[0].body, /- 英语要求\n- 本地运营经验/);
  assert.match(paper.sections[2].stories[0].body, /更新日期：9月10日/);
  assert.equal('lead' in paper, false);
});

test('unstructured text, tables, subheadings and code samples remain available rather than becoming fabricated records', () => {
  assert.deepEqual(prepareDailyNewspaper(null), { intro: '', sections: [], total: 0, sourceCount: 0 });
  assert.equal(prepareDailyNewspaper('只有正文\n\n**重点**').sections.length, 0);
  const paper = prepareDailyNewspaper('## 栏目\n\n说明\n\n| 表格 | 数量 |\n| --- | --- |\n| A | 2 |\n\n```md\n## 示例标题\n\n**不是资讯标题**\n```\n\n### 补充说明\n保留补充。');
  assert.equal(paper.sections.length, 1);
  assert.equal(paper.total, 0);
  assert.match(paper.sections[0].intro, /\| A \| 2 \|/);
  assert.match(paper.sections[0].intro, /## 示例标题/);
  assert.match(paper.sections[0].intro, /\*\*不是资讯标题\*\*/);
  assert.match(paper.sections[0].intro, /### 补充说明\n保留补充/);
});

test('only an explicitly labelled Markdown lead gets a dedicated headline without altering source copy', () => {
  const intro = '统计区间：10月19日—10月20日。\n\n头条｜直播活动规则更新\n\n**IRIAM今日起调整全平台活动时间，统一凌晨0点开赛**\n\n10月20日起，活动开始时间由19:00调整为00:00。\n\n[原文](https://example.com/iriam?lang=ja&v=1)';
  const split = splitDailyHeadlineIntro(intro);
  assert.equal(split.before, '统计区间：10月19日—10月20日。');
  assert.deepEqual(split.lead, { label: '直播活动规则更新', title: 'IRIAM今日起调整全平台活动时间，统一凌晨0点开赛', body: '10月20日起，活动开始时间由19:00调整为00:00。\n\n[原文](https://example.com/iriam?lang=ja&v=1)' });
  const paper = prepareDailyNewspaper(intro + '\n\n## 一、产品雷达\n\n**产品 A**\n保留产品正文。');
  assert.equal(paper.intro, intro);
  assert.equal(paper.total, 1, 'presentation does not rewrite existing record counts');
  assert.equal('lead' in paper, false);
  for (const ordinary of ['**普通加粗说明**\n\n原文正文。', '头条｜未完成标题\n\n普通段落', '```md\n头条｜代码示例\n\n**不能变成头条**\n```']) {
    assert.deepEqual(splitDailyHeadlineIntro(ordinary), { before: ordinary, lead: null });
  }
  assert.equal(splitDailyHeadlineIntro('头条\n\n**明确的头条标题**').lead.label, '');
});

test('explicit legacy leads render as accessible headline sections and keep summaries and source links', async () => {
  const result = await build({ entryPoints: [new URL('../app/daily-newspaper.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic', external: ['react', 'react/jsx-runtime'] });
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
  const paper = prepareDailyNewspaper('头条｜直播活动规则更新\n\n**IRIAM活动时间调整**\n\n10月20日起，19:00改为00:00。\n\n[原文](https://example.com/iriam)\n\n## 一、产品雷达\n\n**产品 A**\n保留。');
  const html = renderToStaticMarkup(createElement(mod.exports.default, { paper }));
  assert.match(html, /<section class="daily-paper-lead" aria-labelledby="daily-paper-lead-title">/);
  assert.match(html, /<div class="daily-lead-kicker"><span>头条<\/span><p>直播活动规则更新<\/p>/);
  assert.match(html, /<h2 id="daily-paper-lead-title">IRIAM活动时间调整<\/h2>/);
  assert.match(html, /10月20日起，19:00改为00:00。/);
  assert.equal((html.match(/href="https:\/\/example.com\/iriam"/g) || []).length, 1);
  assert.equal((html.match(/IRIAM活动时间调整/g) || []).length, 1);
  assert.match(html, /class="daily-paper-story"/);
  const safe = renderToStaticMarkup(createElement(mod.exports.default, { paper: prepareDailyNewspaper('头条｜安全测试\n\n**<img src=x onerror=alert(1)>**\n\n保留原文。') }));
  assert.doesNotMatch(safe, /<img|<script/);
  assert.match(safe, /&lt;img/);
});

test('legacy and structured lead headlines share larger responsive type without enlarging ordinary items', () => {
  const css = readFileSync(new URL('../app/daily-issue.css', import.meta.url), 'utf8');
  assert.match(css, /\.daily-issue-page :is\(\.daily-edition-lead, \.daily-paper-lead\) h2 \{[^}]*font-size: clamp\(28px, 2\.8vw, 36px\)/);
  assert.match(css, /@media \(max-width: 720px\) \{[\s\S]*?\.daily-issue-page :is\(\.daily-edition-lead, \.daily-paper-lead\) h2 \{[^}]*font-size: clamp\(23px, 6vw, 28px\)/);
  assert.match(css, /\.daily-edition-lead, \.daily-paper-lead \{[^}]*background: #f5f9f6/);
  assert.match(css, /\.daily-paper-story > h3 \{[^}]*font: 700 18px/);
});

test('newspaper rendering keeps every original link, warnings, safe HTML and semantic column anchors', async () => {
  const result = await build({ entryPoints: [new URL('../app/daily-newspaper.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic', external: ['react', 'react/jsx-runtime'] });
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports);
  const retiredNote = '矩阵产品变化覆盖近一周；历史在招机会单独标明日期。';
  const paper = prepareDailyNewspaper(source.replace('历史内容单独标明日期。', retiredNote) + '\n\n<script>alert(1)</script>\n\n[危险](javascript:alert)');
  const html = renderToStaticMarkup(createElement(mod.exports.default, { paper }));
  assert.equal((html.match(/class="daily-paper-story"/g) || []).length, 4);
  assert.equal((html.match(/target="_blank"/g) || []).length, 4);
  assert.match(html, /href="https:\/\/example.com\/b\?lang=en&amp;v=1"/);
  assert.doesNotMatch(html, /本期导读|本期栏目导读|daily-paper-index|矩阵产品变化覆盖近一周；历史在招机会单独标明日期。/);
  assert.match(html, /统计区间：9月15日—9月16日（北京时间）/);
  assert.ok(paper.intro.includes(retiredNote), 'source copy is unchanged by presentation filtering');
  assert.match(html, /id="daily-paper-section-2-title"/);
  assert.match(html, /以下为历史在招机会，非昨日新增/);
  assert.match(html, /原文未确认上线状态/);
  assert.doesNotMatch(html, /<script>|href="javascript:/);
});

test('paper layout preserves page width, a single-column mobile reading order, and the real date', () => {
  const css = readFileSync(new URL('../app/daily-issue.css', import.meta.url), 'utf8');
  const reader = readFileSync(new URL('../app/daily-issue-reader.tsx', import.meta.url), 'utf8');
  assert.match(css, /\.daily-paper-sections \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.daily-paper-sections \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.daily-issue-page, \.daily-issue-page \* \{ font-family: var\(--font-sans\) !important; \}/);
  assert.doesNotMatch(css, /--di-serif|Georgia|Songti|STSong|SimSun|font:\s*italic/);
  assert.doesNotMatch(css, /column-count:|daily-issue-archive/);
  assert.match(reader, /<h1 className="daily-issue-accessible-title">\{item.title\}<\/h1>/);
  assert.match(reader, /paper && \(paper.sections.length \|\| paper.lead \|\| splitDailyHeadlineIntro\(paper.intro\).lead\) \? <DailyNewspaper paper=\{paper\} showDocumentTitle=\{false\}/);
  assert.match(reader, /<IssueCalendar selectedDate=\{date\}/);
});

test('newspaper removes retired masthead rules and keeps a shared wider responsive column gutter', () => {
  const css = readFileSync(new URL('../app/daily-issue.css', import.meta.url), 'utf8');
  assert.match(css, /--di-rule: #c6d5cc;/);
  assert.doesNotMatch(css, /\.daily-issue-masthead|\.daily-issue-stats/);
  assert.match(css, /--di-column-gap: clamp\(40px, 6vw, 88px\);/);
  assert.match(css, /\.daily-paper-sections \{[^}]*gap: 56px var\(--di-column-gap\)/);
  assert.match(css, /\.daily-paper-section:first-child \.daily-paper-stories \{[^}]*gap: 20px var\(--di-column-gap\)/);
});

test('daily columns have more vertical breathing room without changing the story or horizontal gutter spacing', () => {
  const css = readFileSync(new URL('../app/daily-issue.css', import.meta.url), 'utf8');
  assert.match(css, /\.daily-paper-sections \{[^}]*gap: 56px var\(--di-column-gap\)/);
  assert.match(css, /\.daily-paper-sections \{ grid-template-columns: minmax\(0, 1fr\); gap: 40px; \}/);
  assert.match(css, /\.daily-paper-section-heading \{[^}]*padding-top: 22px/);
  assert.match(css, /\.daily-paper-stories \{ display: grid; gap: 28px; \}/);
});
