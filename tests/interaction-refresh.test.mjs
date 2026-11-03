import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
test('brand label is consistent in home and article navigation', () => {
  for (const p of ['../app/page.tsx', '../app/analysis/[slug]/reader.tsx']) assert.match(read(p), /className="site-brand-name">小骆出海观察/);
});
test('shared hover uses the note token with motion and touch safeguards', () => {
  const css = read('../app/interaction-refresh.css');
  assert.match(css, /hover: hover/);
  assert.match(css, /pointer: fine/);
  assert.match(css, /transform: var\(--motion-lift\) !important/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /transform: none !important/);
});
test('business composition has distinct value, service tile and directory layouts', () => {
  const css = read('../app/interaction-refresh.css');
  assert.match(css, /collab-value-grid/);
  assert.match(css, /grid-column: span 3/);
  assert.match(css, /collab-services-title/);
  assert.match(css, /max-width: 720px/);
});
