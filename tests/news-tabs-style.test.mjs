import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/site-navigation.css", import.meta.url), "utf8");

test("news tabs form a compact centered segmented control on a white bar", () => {
  assert.match(css, /\.news-tabs-wrap \{[^}]*background: var\(--color-page\); \}/);
  assert.match(css, /\.news-tabs\.shell \{[^}]*display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[^}]*width: min\(336px, calc\(100% - 32px\)\);[^}]*margin-inline: auto;/);
  assert.match(css, /\.news-tabs :is\(button, a\) \{[^}]*min-height: 46px;[^}]*border: 0;[^}]*background: transparent;/);
  assert.match(css, /\.news-tabs :is\(button, a\)\.active, \.news-tabs :is\(button, a\)\.active:hover \{[^}]*background: var\(--color-brand-strong\);/);
  assert.doesNotMatch(css, /\.news-tabs :is\(button, a\)::after/);
  assert.match(css, /\.news-tabs :is\(button, a\):focus-visible \{[^}]*outline: 2px solid var\(--color-brand-strong\);/);
  assert.match(css, /@media \(max-width: 560px\) \{[\s\S]*?\.news-tabs :is\(button, a\) \{[^}]*min-height: 48px;/);
});
