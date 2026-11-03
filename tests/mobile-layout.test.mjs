import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8");

test("mobile navigation uses two rows and reveals the active tab", () => {
  const styles = read("site-navigation.css");
  const page = read("page.tsx");
  assert.match(styles, /@media \(max-width: 560px\) \{[\s\S]*?grid-template-areas: "brand search" "navigation navigation"/);
  assert.match(styles, /\.global-search-panel \{ width: calc\(100vw - 32px\)/);
  assert.match(page, /const navigationRef = useRef<HTMLElement>\(null\)/);
  assert.match(page, /navigation\.querySelector<HTMLElement>\("\.active"\)/);
  assert.match(page, /<nav ref=\{navigationRef\} aria-label="主导航">/);
});

test("narrow matrix cards and home note links remain usable", () => {
  const regions = read("company-regions.css");
  const home = read("app-light.css");
  const hot = read("hot-list.css");
  assert.match(regions, /@media \(max-width: 420px\) \{\s*\.company-regions-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(home, /\.home-theme \.note\.note-list-item \.note-content > a\s*\{[^}]*display:\s*inline-flex/);
  assert.match(hot, /\.hot-story-sources a \{ min-height: 44px/);
});

test("mobile home section headings and actions stay left aligned", () => {
  const styles = read("home-editorial.css");
  assert.match(styles, /html body \.home-theme\.research-home \.section-top \{ align-items: end;/);
  assert.match(styles, /@media \(max-width: 720px\) \{[\s\S]*html body \.home-theme\.research-home \.section-top \{ align-items: flex-start; \}/);
});
