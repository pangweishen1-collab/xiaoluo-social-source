import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("../app/research-archive.css", import.meta.url), "utf8");
const motionCss = readFileSync(new URL("../app/primary-page-motion.css", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
test("research archive uses one full-width row per article with natural text height", () => {
  assert.match(css, /\.analysis-list \{ display: grid; grid-template-columns: minmax\(0, 1fr\); gap: 24px/);
  assert.match(css, /\.analysis-card-link > h2 \{\s*height: auto;\s*-webkit-line-clamp: 2/);
  assert.match(css, /\.analysis-card-link > p \{\s*height: auto;\s*flex-shrink: 0/);
  assert.match(css, /-webkit-line-clamp: 3/);
});
test("product rail wraps labels, collapses on mobile and empty rails leave no blank column", () => {
  assert.match(css, /\.analysis-list article \{ display: grid; grid-template-columns: minmax\(0, 1fr\) minmax\(220px, \.36fr\)/);
  assert.match(css, /\.analysis-card-link:only-child \{ grid-column: 1 \/ -1/);
  assert.match(css, /\.research-product-tags \{ display: flex; flex-wrap: wrap/);
  assert.match(css, /@media \(max-width: 720px\) \{\s*html body \.research-archive \.analysis-list article \{ grid-template-columns: minmax\(0, 1fr\)/);
});
test("footer auto spacing has stronger specificity than the legacy last div rule", () => {
  assert.match(css, /html body \.research-archive \.analysis-list > article > \.analysis-card-link > \.analysis-card-footer \{\s*margin: auto 0 0;\s*flex-shrink: 0;\s*flex-wrap: nowrap/);
  assert.match(css, /\.research-company \{ min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis/);
});
test("company research cards reuse matrix logos and show dark company names", () => {
  assert.match(page, /function CompanyLogo\(/);
  assert.match(page, /<CompanyLogo company=\{item\.company\} logoUrl=\{item\.logoUrl\} \/>/);
  assert.match(page, /<CompanyLogo company=\{company\} logoUrl=\{logoUrl\} \/>/);
  assert.match(page, /const match = researchProducts\(company, matrixCompanies, records \|\| \[\], matrixCompany\)/);
  assert.match(css, /\.research-company \{ color: var\(--color-text\)/);
});
test("company research cards use smaller borderless logos and regular-weight names", () => {
  assert.match(css, /\.research-company-logo \{[^}]*flex: 0 0 38px; width: 38px; height: 38px;[^}]*border: 0;/);
  assert.match(css, /\.research-company-logo :is\(\.atlas-logo, \.atlas-monogram\) \{ width: 34px; height: 34px;/);
  assert.match(css, /\.research-company \{[^}]*font-size: 14px; font-weight: 400;/);
});
test("research cards stagger their entrance and respect reduced motion", () => {
  assert.match(page, /"--research-stagger": `\$\{index \* 85\}ms`/);
  assert.match(motionCss, /\.research-archive \.analysis-list > article \{\s*animation: research-card-reveal/);
  assert.match(motionCss, /animation-delay: calc\(100ms \+ var\(--research-stagger, 0ms\)\)/);
  assert.match(motionCss, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.research-archive \.analysis-list > article[\s\S]*?animation: none !important/);
});
