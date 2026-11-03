import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("recommended sites follow the homepage section-heading rhythm", async () => {
  const [component, styles] = await Promise.all([
    readFile(new URL("../app/practical-tools.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/home-editorial.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /className="section-top"><div><p className="eyebrow">CURATED RESOURCES<\/p><h2 id="practical-tools-title">推荐网站<\/h2>/);
  assert.match(styles, /\.compact-tools \.section-top \{ margin-bottom: 28px; \}/);
});

test("public views reuse the footer and keep the contact QR there", async () => {
  const [page, reader, footer, styles, qr] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/analysis/[slug]/reader.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/site-footer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/site-footer.css", import.meta.url), "utf8"),
    readFile(new URL("../public/optimized/wechat-qr.webp", import.meta.url)),
  ]);
  assert.equal((page.match(/<SiteFooter \/>/g) || []).length, 1);
  assert.match(reader, /<SiteFooter \/>/);
  assert.doesNotMatch(page, /<footer className="shell"|className="contact shell"|className="collab-qr"/);
  assert.match(footer, /<footer className="site-footer"/);
  assert.match(footer, /src="\/optimized\/wechat-qr\.webp"/);
  assert.match(footer, /aria-label="页脚导航"/);
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.ok(qr.length > 0);
});
