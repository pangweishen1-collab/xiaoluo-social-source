import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/resource-market.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/resource-market.css", import.meta.url), "utf8");

test("provider listing explains capabilities, fit and direct contact", () => {
  assert.match(source, /SERVICE PARTNERS \/ 服务商名录/);
  assert.match(source, /服务能力/);
  assert.match(source, /适用场景/);
  assert.match(source, /合作方式/);
  assert.match(source, /href="https:\/\/www\.jsgift\.top\/"/);
  assert.match(source, /alt="极瞬动画客服二维码：扫码咨询定制服务"/);
  assert.match(source, /href="\/\?view=business">了解资源入驻方案/);
});

test("existing collaboration metrics and recruitment tab remain available", () => {
  assert.match(source, /\["jobs", "公司招聘"\]/);
  assert.match(source, /id="market-panel-jobs"/);
  assert.match(source, /带来用户/);
  assert.match(source, /营收增加/);
  assert.match(source, /资源交换/);
});

test("provider listing adapts to narrow screens and reduced motion", () => {
  assert.match(styles, /@media\(max-width:720px\)/);
  assert.match(styles, /\.resource-provider-card \{ grid-template-columns:1fr/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(styles, /\.resource-provider-link:focus-visible/);
});
