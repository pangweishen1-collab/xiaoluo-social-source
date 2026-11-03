import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
test("cooperation methods are static while other contact actions remain", () => {
  const page = read("../app/page.tsx");
  const section = page.match(/<section[^>]*aria-labelledby="collab-services-title"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section);
  assert.doesNotMatch(section, /<button|<a\s|onClick|tabIndex/);
  assert.match(page, /setInquiryType\(item.title\)/);
  const css = read("../app/business-editorial.css");
  assert.match(css, /article:hover\s*\{\s*transform:none !important;\s*box-shadow:none !important;/);
});
test("business value is removed from the business page", () => {
  const page = read("../app/page.tsx");
  assert.doesNotMatch(page, /<BusinessValue/);
  const component = read("../app/business-value.tsx");
  assert.match(component, /<h2 id="collab-value-title">我的价值<\/h2>/);
  for (const view of ["daily", "analysis", "matrix"]) assert.ok(component.includes(`href: "/?view=${view}"`));
  assert.match(component, /collab-services collab-value-grid/);
  assert.match(component, /对你的帮助/);
  assert.doesNotMatch(component, /保证|独家|全网第一|服务过\d/);
});
test("business plans appear in the second module with exact prices and inquiry actions", () => {
  const page = read("../app/page.tsx");
  const section = page.match(/<section[^>]*aria-labelledby="collab-types-title"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section);
  for (const value of ["资源入驻", "¥500", "行业内容合作", "¥1,500起", "网站资源卡片", "官网介绍", "分类展示", "网站文章", "小红书", "朋友圈", "资源展示"]) {
    assert.ok(page.includes(value), `${value} is missing`);
  }
  assert.match(section, /collab-plan-grid/);
  assert.match(section, /setQrPlan\(plan.title\)/);
  assert.match(section, /咨询服务/);
  const overlay = read("../app/modal-overlay.css");
  const tokens = read("../tokens.css");
  assert.match(tokens, /--color-overlay:\s*rgba\(0,\s*0,\s*0,\s*\.6\)/);
  assert.match(overlay, /dialog::backdrop\s*\{\s*background:\s*var\(--color-overlay\)/);
});
