import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { prepareDailyNewspaper } from '../app/daily-newspaper.mjs';

const source = readFileSync(new URL('./fixtures/daily-2026-10-22-standard.md', import.meta.url), 'utf8');
const bundle = await build({ entryPoints: [new URL('../app/daily-newspaper.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic', external: ['react', 'react/jsx-runtime'] });
const mod = { exports: {} };
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
const render = (paper, props = {}) => renderToStaticMarkup(createElement(mod.exports.default, { paper, ...props }));

test('the existing plain-text five-column report restores only explicit presentation headings', () => {
  const plain = source.replace(/^#{1,3} /gm, '').replace(/\*\*/g, '').replace(/^---\s*$/gm, '').replace(/\n\n(?=(?:头条：|0[1-5] |(?:SUGO|Vone|Achat|LiveMe|Amore|Tiko|MICO WORLD|Palmu|Spotify)[｜ ]))/g, '\n');
  const paper = prepareDailyNewspaper(plain);
  assert.equal(paper.layout, 'standard');
  assert.equal(paper.sections.length, 5);
  assert.equal(paper.total, 14);
  assert.match(paper.lead.title, /Spotify/);
  const html = render(paper);
  assert.equal((html.match(/<li>/g)||[]).length, 9);
  assert.equal((html.match(/class="daily-paper-story"/g)||[]).length, 14);
  assert.match(html, /实际招聘状态以雇主页面为准/);
  assert.equal(prepareDailyNewspaper(plain.replace('03 团队与招聘动向', '招聘说明')).layout, undefined, 'incomplete prose must not be guessed into columns');
});

test('the provided standard Markdown separates its document title, explicit lead and five numbered columns', () => {
  const paper = prepareDailyNewspaper(source);
  assert.equal(paper.layout, 'standard');
  assert.equal(paper.documentTitle, '10月22日海外语聊直播行业日报');
  assert.equal(paper.lead.title, 'Spotify 推出 Memberships，创作者付费关系进一步产品化');
  assert.match(paper.lead.body, /34 个市场/);
  assert.match(paper.lead.body, /90% 的会员收入/);
  assert.match(paper.lead.body, /\*\*核心观察：\*\*/);
  assert.deepEqual(paper.sections.map(s=>s.number), ['01','02','03','04','05']);
  assert.deepEqual(paper.sections.map(s=>s.label), ['产品雷达','排名异动','团队与招聘动向','语聊直播产品近一周变化','今日观察']);
  assert.deepEqual(paper.sections.map(s=>s.stories.length), [6,0,3,5,0]);
  assert.equal(paper.total, 14, 'ranking groups and observations are not fabricated story records');
  assert.match(paper.sections[1].intro, /\*\*排名上升\*\*\n- LiveMe：#63，上升 24 位/);
  assert.match(paper.sections[1].intro, /\*\*排名下滑\*\*/);
  assert.match(paper.sections[4].intro, /1\. \*\*会员体系：\*\*/);
  assert.doesNotMatch(paper.sections[4].intro, /小骆语聊/);
  assert.equal(paper.footer, '**小骆语聊：** https://xiaoluo-social.pages.dev/');
});

test('all supplied item titles, caveats, lists and the footer link survive semantic rendering', () => {
  const paper = prepareDailyNewspaper(source);
  const html = render(paper);
  assert.equal((html.match(/class="daily-paper-lead"/g)||[]).length, 1);
  assert.equal((html.match(/class="daily-paper-story"/g)||[]).length, 14);
  assert.equal((html.match(/<ul>/g)||[]).length, 2);
  assert.equal((html.match(/<ol>/g)||[]).length, 1);
  assert.equal((html.match(/<li>/g)||[]).length, 9);
  assert.match(html, /<h3>SUGO｜#11<\/h3>/);
  assert.match(html, /<h3>MICO WORLD｜马来西亚｜Business Development Specialist<\/h3>/);
  assert.match(html, /<h3>SUGO｜近 7 天未发现可核实的重大功能更新<\/h3>/);
  assert.match(html, /实际招聘状态以雇主页面为准/);
  assert.match(html, /单日波动不等于增长或营收变化/);
  assert.match(html, /22:30/);
  assert.match(html, /10 月 24 日 00:00/);
  assert.match(html, /href="https:\/\/xiaoluo-social.pages.dev\/"/);
  assert.doesNotMatch(html, /<hr|<h2[^>]*>01 产品雷达|<h2[^>]*>头条：/);
  assert.equal((html.match(/10月22日海外语聊直播行业日报/g)||[]).length, 1);
  assert.doesNotMatch(render(paper, { showDocumentTitle:false }), /10月22日海外语聊直播行业日报/, 'the site masthead owns the document title');
});

test('standard Markdown detection ignores fenced examples and preserves unrelated legacy reports', () => {
  const legacy = prepareDailyNewspaper('说明\n\n## 一、产品\n\n**旧产品标题**\n原文。');
  assert.equal(legacy.layout, undefined);
  assert.equal(legacy.sections[0].stories[0].title, '旧产品标题');
  const fenced = prepareDailyNewspaper('```md\n## 01 产品雷达\n### 示例\n```');
  assert.equal(fenced.layout, undefined);
  assert.equal(fenced.sections.length, 0);
  const sample = prepareDailyNewspaper('# 日报\n\n## 01 产品雷达\n\n```md\n### 不是条目\n```\n\n### 真实条目\n保留。');
  assert.equal(sample.sections[0].stories.length, 1);
  assert.match(sample.sections[0].intro, /### 不是条目/);
});

test('new Markdown uses a single-column reading order and reuses parsing in the homepage preview', () => {
  const css = readFileSync(new URL('../app/daily-issue.css', import.meta.url),'utf8');
  const home = readFileSync(new URL('../app/home-daily.tsx', import.meta.url),'utf8');
  assert.match(css, /\.daily-paper-standard \.daily-paper-sections \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.daily-paper-standard \.daily-paper-section:first-child \.daily-paper-stories \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(home, /prepareDailyNewspaper\(body\).sections.map\(section => section.label\)/);
  assert.doesNotMatch(render(prepareDailyNewspaper('## 01 产品\n\n### <script>alert(1)</script>\n\n保留。')), /<script>/);
});

test('only the standard radar and ranking pair share a desktop row; all later columns remain full width', () => {
  const paper = prepareDailyNewspaper(source);
  assert.match(render(paper), /daily-paper-sections daily-paper-sections-paired/);
  assert.doesNotMatch(render({...paper, sections:[paper.sections[1],paper.sections[0],...paper.sections.slice(2)]}), /daily-paper-sections-paired/);
  assert.doesNotMatch(render({...paper, layout:undefined}), /daily-paper-sections-paired/);
  const css = readFileSync(new URL('../app/daily-issue.css', import.meta.url),'utf8');
  assert.match(css, /@media \(min-width: 961px\) \{\s*\.daily-paper-standard \.daily-paper-sections-paired \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.daily-paper-sections-paired > \.daily-paper-section \{ grid-column: 1 \/ -1/);
  assert.match(css, /\.daily-paper-sections-paired > \.daily-paper-section:nth-child\(-n \+ 2\) \{ grid-column: auto/);
  assert.equal(paper.total,14);
  assert.equal(paper.sections.length,5);
});

test('standard typography distinguishes explicit metadata, rank labels and caveats without muting narrative', () => {
  const html = render(prepareDailyNewspaper(source));
  assert.match(html, /class="article-markdown-inline daily-paper-meta"><strong>榜单口径：<\/strong>/);
  assert.match(html, /class="article-markdown-inline daily-paper-meta">产品类型：语聊、Party 房、社区互动。/);
  assert.match(html, /class="article-markdown-inline daily-paper-group-label"><strong>排名上升<\/strong>/);
  assert.match(html, /class="article-markdown-inline daily-paper-reading-note"><strong>怎么看：<\/strong>/);
  const mixed = render(prepareDailyNewspaper('## 01 产品雷达\n\n### 产品\n产品类型：语聊\n这段重要观察不能降为辅助文字。'));
  assert.doesNotMatch(mixed, /daily-paper-meta/);
  const legacy = render(prepareDailyNewspaper('## 一、产品\n\n**产品**\n产品类型：语聊'));
  assert.doesNotMatch(legacy, /daily-paper-meta/);
  const css = readFileSync(new URL('../app/daily-issue.css', import.meta.url),'utf8');
  assert.match(css, /\.daily-paper-standard \.daily-paper-section-heading h2 \{ font-size: 24px/);
  assert.match(css, /\.daily-paper-standard \.daily-paper-story > h3 \{ margin-bottom: 8px; font-size: 18px/);
  assert.match(css, /\.daily-paper-standard \.daily-report-body \.daily-paper-meta \{ color: var\(--di-muted\); font-size: 13px/);
  assert.match(css, /\.daily-paper-standard \.daily-paper-section-heading > span \{ flex-shrink: 0; min-width: 2ch; font-size: 28px; font-weight: 750/);
  assert.match(css, /\.daily-paper-standard \.daily-paper-section-heading > span \{ font-size: 24px; \}/);
  assert.match(html, /<span aria-hidden="true">01<\/span><h2/);
});

test('the delivered Markdown template matches the shipped five-column parser and paired layout', () => {
  const template = readFileSync(new URL('../docs/examples/daily-report-template.md', import.meta.url),'utf8');
  const paper = prepareDailyNewspaper(template);
  assert.equal(paper.layout,'standard');
  assert.deepEqual(paper.sections.map(s=>s.label),['产品雷达','排名异动','团队与招聘动向','语聊直播产品近一周变化','今日观察']);
  assert.ok(paper.lead);
  assert.deepEqual(paper.sections.map(s=>s.stories.length),[1,0,1,1,0]);
  assert.match(render(paper),/daily-paper-sections-paired/);
  const spec = readFileSync(new URL('../docs/daily-markdown-format.md', import.meta.url),'utf8');
  assert.match(spec,/格式正确不等于事实已核验/);
  assert.match(spec,/所有占位符/);
});
