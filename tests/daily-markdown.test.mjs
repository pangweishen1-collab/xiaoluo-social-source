import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';

test('daily Markdown formats blocks and rejects unsafe links and HTML', async () => {
  const result=await build({entryPoints:[new URL('../app/daily-markdown.tsx',import.meta.url).pathname],bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime']});
  const mod={exports:{}};
  new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
  const html=renderToStaticMarkup(mod.exports.renderMarkdown('### 栏目\n\n**重点** [来源](https://example.com)\n\n- 条目\n\n[危险](javascript:alert)\n\n<script>alert(1)</script>'));
  assert.match(html, /<h3>栏目<\/h3>/);
  assert.match(html, /<strong>重点<\/strong>/);
  assert.match(html, /<ul><li>条目<\/li><\/ul>/);
  assert.match(html, /href="https:\/\/example.com"/);
  assert.doesNotMatch(html, /href="javascript:|<script>/);
  const normalized=mod.exports.formatDailyMarkdown('一、首次发现产品\n• 新增记录\nhttps://play.google.com/store/apps/details?id=example');
  assert.match(normalized, /^### 一、首次发现产品/m);
  assert.match(normalized, /^- 新增记录/m);
  assert.match(normalized, /\[Google Play\]\(https:\/\/play.google.com\/store\/apps\/details\?id=example\)/);
});
