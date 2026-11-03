import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("tools shows 15 secure destinations with JSGift first and no category filter", async () => {
  const component = await readFile(new URL("../app/practical-tools.tsx", import.meta.url), "utf8");
  const urls = [...component.matchAll(/url: "([^"]+)"/g)].map(match => match[1]);
  assert.equal(urls.length, 15);
  assert.equal(new Set(urls).size, 15);
  assert.equal(urls[0], "https://www.jsgift.top/");
  urls.forEach(url => assert.equal(new URL(url).protocol, "https:"));
  assert.match(component, /沉浸式翻译/);
  assert.match(component, /VibeHub 产品术语/);
  assert.doesNotMatch(component, /tools-filters|aria-pressed|tools.filter/);
  assert.match(component, /tools.map/);
  assert.match(component, /tool-site-logo/);
  assert.doesNotMatch(component, /tool-site-wordmark/);
  assert.match(component, /width=\{36\} height=\{36\}/);
  const logos = [...component.matchAll(/"(\/optimized\/[^\"]+\.webp)"/g)].map(match => match[1]);
  assert.equal(logos.length, 14);
  for (const logo of logos) assert.ok((await readFile(new URL("../public" + logo, import.meta.url))).length > 0);
  assert.match(component, /loading="lazy"/);
  assert.match(component, /onError=/);
  assert.match(component, /rel="noopener noreferrer"/);
  assert.match(component, /不代表企业实际营收/);
  assert.match(component, /className="tool-card-top"/);
  assert.match(component, /className="tool-group"/);
  assert.doesNotMatch(component, /tool-arrow|↗/);
});

test("recommended website cards have responsive hover and reduced-motion treatments", async () => {
  const css = await readFile(new URL("../app/practical-tools.css", import.meta.url), "utf8");
  assert.match(css, /\.tool-row:hover\{transform:translateY\(-5px\)/);
  assert.match(css, /\.tool-row:focus-visible/);
  assert.match(css, /@media\(max-width:1000px\).*repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:600px\).*grid-template-columns:1fr/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css, /\.tool-arrow/);
});
