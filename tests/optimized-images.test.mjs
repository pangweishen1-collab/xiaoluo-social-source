import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('hero uses a local WebP image with responsive rounded sizing', async () => {
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const hero = page.match(/<figure className="hero-visual"[\s\S]*?<\/figure>/)?.[0] ?? '';
  assert.match(hero, /<img\s[^>]*src=\{heroMedia\.src\}/);
  assert.doesNotMatch(hero, /<video|<source/);
  const bytes = await readFile(new URL('../public/optimized/home-hero-research.webp', import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  const css = (await Promise.all(['atlas-overview.css', 'home-editorial.css'].map(file =>
    readFile(new URL(`../app/${file}`, import.meta.url), 'utf8')))).join('\n');
  assert.match(css, /\.hero-visual-image img \{/);
});

test('page image assets are real WebP files and tool logos are local', async () => {
  const files=['page.tsx','practical-tools.tsx','layout.tsx','analysis/[slug]/reader.tsx'];
  const urls=new Set();
  for(const file of files){
    const src=await readFile(new URL('../app/'+file,import.meta.url),'utf8');
    assert.doesNotMatch(src,/"\/(?:logos|partners|notes)\/[^"\n]+\.(?:png|jpe?g|ico)"/);
    for(const match of src.matchAll(/"(\/optimized\/[^"\n]+\.webp)"/g))urls.add(match[1]);
  }
  assert.ok(urls.size>30);
  for(const url of urls){
    const bytes=await readFile(new URL('../public'+url,import.meta.url));
    assert.equal(bytes.toString('ascii',0,4),'RIFF',url);
    assert.equal(bytes.toString('ascii',8,12),'WEBP',url);
  }
  const tools=await readFile(new URL('../app/practical-tools.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(tools,/favicon.ico/);
});
