import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { withAssetCache } from '../shared/asset-cache.mjs';

test('same-name assets revalidate without losing validators', () => {
  const result = withAssetCache(new Response('image', { headers: { ETag: 'test', 'Content-Type': 'image/webp' } }), '/optimized/logo.webp');
  assert.equal(result.headers.get('Cache-Control'), 'public, max-age=0, must-revalidate');
  assert.equal(result.headers.get('ETag'), 'test');
  assert.equal(result.headers.get('Content-Type'), 'image/webp');
});
test('fingerprinted media is immutable, partial and conditional responses stay intact', () => {
  const path = '/versioned/home-hero-research.0123456789abcdef.webp';
  const partial = withAssetCache(new Response('part', { status: 206, headers: { 'Content-Range': 'bytes 0-3/100' } }), path);
  assert.match(partial.headers.get('Cache-Control'), /immutable/);
  assert.equal(partial.status, 206);
  assert.equal(partial.headers.get('Content-Range'), 'bytes 0-3/100');
  assert.equal(withAssetCache(new Response(null, { status: 304 }), path).status, 304);
  assert.equal(withAssetCache(new Response('missing', { status: 404 }), path).headers.get('Cache-Control'), 'no-store');
});
test('framework chunk cache settings are preserved', () => {
  assert.equal(withAssetCache(new Response('', { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }), '/_next/static/chunks/index.js').headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
});
test('hero media URL matches bytes and release history never includes drafts', async () => {
  const manifest = JSON.parse(await readFile(new URL('../app/hero-media.generated.json', import.meta.url)));
  assert.match(manifest.src, /^\/versioned\/home-hero-research\.[a-f0-9]{16}\.webp$/);
  const bytes = await readFile(new URL('../public' + manifest.src, import.meta.url));
  const source = await readFile(new URL('../public/optimized/home-hero-research.webp', import.meta.url));
  assert.deepEqual(bytes, source);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  assert.ok(manifest.src.includes(createHash('sha256').update(bytes).digest('hex').slice(0, 16)));
  const releases = JSON.parse(await readFile(new URL('../public/release-history.json', import.meta.url)));
  assert.ok(releases.every(item => item.status === 'published'));
});
