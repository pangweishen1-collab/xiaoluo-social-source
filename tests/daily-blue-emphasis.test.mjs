import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { prepareDailyNewspaper } from '../app/daily-newspaper.mjs';

async function compile(file) {
  const result=await build({entryPoints:[new URL(file,import.meta.url).pathname],bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime']});
  const mod={exports:{}};
  new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
  return mod.exports;
}
const [markdown,newspaper]=await Promise.all([compile('../app/daily-markdown.tsx'),compile('../app/daily-newspaper.tsx')]);
const render = text => renderToStaticMarkup(markdown.renderMarkdown(text));
const source=readFileSync(new URL('./fixtures/daily-blue-emphasis.md',import.meta.url),'utf8');

test('the acceptance sample highlights only three short phrases, not labels or paragraphs',()=>{
  const html=render(source);
  assert.equal((html.match(/class="daily-markdown-highlight"/g)||[]).length,3);
  for(const phrase of ['均位列Top10','收礼榜前7名','累计观看至少15分钟']) assert.ok(html.includes(`<strong><em class="daily-markdown-highlight">${phrase}</em></strong>`));
  assert.match(html,/<strong>产品类型：<\/strong> 多人语音房、Party社交。/);
  assert.match(html,/<strong>观察：<\/strong> SUGO在三个国家的榜单/);
  assert.match(html,/<\/strong>，但不能推断营收增长。/);
  assert.doesNotMatch(html,/\*\*\*|<span|style=/);
});

test('headings, source links, ordinary bold and inline code do not become blue highlights',()=>{
  const html=render('## ***栏目标题***\n\n**普通加粗** [来源](https://example.com/story?x=1&y=2)\n\n`***保留代码***`');
  assert.match(html,/<h2><strong>栏目标题<\/strong><\/h2>/);
  assert.match(html,/<strong>普通加粗<\/strong>/);
  assert.match(html,/href="https:\/\/example.com\/story\?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">来源<\/a>/);
  assert.match(html,/<code>\*\*\*保留代码\*\*\*<\/code>/);
  assert.doesNotMatch(html,/daily-markdown-highlight/);
});

test('newspaper section order, list semantics, source links and paragraph layout survive emphasis',()=>{
  const actual=readFileSync(new URL('./fixtures/daily-2026-10-22-standard.md',import.meta.url),'utf8');
  const changed=actual.replace('34 个市场','***34 个市场***').replace('上升 24 位','***上升 24 位***');
  const original=prepareDailyNewspaper(actual),emphasized=prepareDailyNewspaper(changed);
  const before=renderToStaticMarkup(createElement(newspaper.default,{paper:original}));
  const after=renderToStaticMarkup(createElement(newspaper.default,{paper:emphasized}));
  assert.deepEqual(emphasized.sections.map(s=>s.label),original.sections.map(s=>s.label));
  assert.equal(emphasized.total,original.total);
  assert.equal((after.match(/daily-markdown-highlight/g)||[]).length,2);
  for(const tag of ['h2','h3','p','ul','ol','li','hr']) assert.equal((after.match(new RegExp(`<${tag}(?:>| )`,'g'))||[]).length,(before.match(new RegExp(`<${tag}(?:>| )`,'g'))||[]).length,tag);
  assert.deepEqual([...after.matchAll(/href="([^"]+)"/g)].map(m=>m[1]),[...before.matchAll(/href="([^"]+)"/g)].map(m=>m[1]));
});

test('HTML and dangerous links remain escaped or inert inside triple emphasis',()=>{
  const html=render('***<script>alert(1)</script>***\n\n***[危险](javascript:alert)***\n\n<span style="color:red">旧稿</span>\n\n***上升24位***，***10月28日正式生效***');
  assert.doesNotMatch(html,/<script|<span|href="javascript:|dangerouslySetInnerHTML/);
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/&lt;span style=/);
  assert.equal((html.match(/daily-markdown-highlight/g)||[]).length,4);
});

test('raw Markdown is preserved and a narrow shared stylesheet controls only emphasis text',()=>{
  const original=source;
  render(source);
  assert.equal(source,original);
  assert.equal(markdown.formatDailyMarkdown(source),original);
  assert.match(source,/\*\*\*均位列Top10\*\*\*/);
  assert.doesNotMatch(source,/<span|style=|#2563EB/);
  const css=readFileSync(new URL('../app/daily-markdown.css',import.meta.url),'utf8');
  assert.match(css,/\.daily-report-body em\.daily-markdown-highlight/);
  for(const declaration of ['color: #2563EB','font-weight: 700','font-style: normal','font-size: inherit','background: none','border: 0','text-decoration: none']) assert.ok(css.includes(declaration),declaration);
  assert.doesNotMatch(css,/margin-bottom|padding-top|@media|!important/);
  assert.match(readFileSync(new URL('../app/layout.tsx',import.meta.url),'utf8'),/import "\.\/daily-markdown.css"/);
  const editor=readFileSync(new URL('../app/daily-editor.tsx',import.meta.url),'utf8');
  assert.match(editor,/renderMarkdown\(body\)/);
  assert.match(editor,/const payload = \{ date, title, body,/);
});
