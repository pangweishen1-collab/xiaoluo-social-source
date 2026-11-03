import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const component = readFileSync(new URL("../app/company-regions.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/company-regions.css", import.meta.url), "utf8");

test("matrix uses the region overview without loading or rendering a map", () => {
  assert.match(page, /<CompanyRegions companies=\{companies\} region=\{region\} onRegionChange=\{setRegion\}/);
  assert.doesNotMatch(page, /CompanyMap|company-map"/);
  assert.doesNotMatch(component, /loadCompanyMap|<svg|<path|分布图|地图空白/);
  assert.match(component, /地区分布/);
});

test("region cards keep the existing company filter and explain counts", () => {
  assert.match(component, /regionSummary\(companies\)/);
  assert.match(component, /aria-pressed=\{region === name\}/);
  assert.match(component, /onClick=\{\(\) => onRegionChange\(name\)\}/);
  assert.match(component, /onClick=\{\(\) => onRegionChange\(""\)\}/);
  assert.match(component, /UNKNOWN_REGION/);
  assert.match(component, /aria-controls="matrix-company-results"/);
  assert.match(page, /id="matrix-company-results"/);
  assert.doesNotMatch(component, /统计口径与来源|口径与来源|SourcesDialog|sourcesOpen/);
  assert.match(component, /按国内主体所在地归类，占比按已归类公司计算/);
  assert.match(styles, /\.company-regions-grid\s*\{\s*display:\s*grid/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
});

test("region overview stays compact and uses the shared primary button color", () => {
  assert.match(styles, /\.company-region-card\s*\{[^}]*min-height:\s*72px/s);
  assert.match(styles, /\.company-regions-grid\s*\{[^}]*repeat\(6, minmax\(0, 1fr\)\)/s);
  assert.doesNotMatch(component, /REGIONAL OVERVIEW|按地区浏览|按收录公司数量排序|company-region-index/);
  assert.match(component, /company-regions-status" role="status"/);
  assert.match(component, /width: `\$\{share\}%`/);
  assert.doesNotMatch(styles, /linear-gradient|company-region-card::after/);
  assert.match(styles, /\.company-region-all\.is-active\s*\{[^}]*background:\s*var\(--color-brand\)/s);
  assert.match(styles, /\.company-region-all\.is-active:hover\s*\{[^}]*background:\s*var\(--color-brand-strong\)/s);
});

test("region overview keeps its full border and uses a compact arrow-free selector", () => {
  assert.doesNotMatch(component, /↗|company-region-card-arrow/);
  assert.match(styles, /\.matrix-explorer \.company-regions\s*\{[^}]*overflow:\s*visible;[^}]*border:\s*1px solid #dce8e1 !important/s);
  assert.match(styles, /\.company-region-all\s*\{[^}]*width:\s*auto;[^}]*min-height:\s*44px/s);
});

test("company directory uses compact metadata, an anchored action row and hover treatment", () => {
  const matrixStyles = readFileSync(new URL("../app/matrix-explorer.css", import.meta.url), "utf8");
  const motionStyles = readFileSync(new URL("../app/primary-page-motion.css", import.meta.url), "utf8");
  assert.match(page, /className="atlas-card-meta"/);
  assert.match(page, /className="atlas-card-logo"/);
  assert.match(matrixStyles, /\.matrix-grid\s*\{[^}]*grid-auto-rows:\s*auto/s);
  assert.match(matrixStyles, /\.atlas-products\s*\{[^}]*min-height:\s*0/s);
  assert.match(matrixStyles, /\.company-card footer\s*\{[^}]*min-height:\s*0/s);
  assert.match(matrixStyles, /\.company-card footer\s*\{[^}]*margin-top:\s*auto !important;[^}]*border-top:\s*1px solid/s);
  assert.match(motionStyles, /\.matrix-explorer \.company-card:hover\s*\{[^}]*translateY\(-5px\)/s);
  assert.doesNotMatch(motionStyles, /\.atlas-detail-button::after/);
});
