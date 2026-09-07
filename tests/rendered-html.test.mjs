import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";


async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Xiaoluo public homepage", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>小骆｜社交产品资讯与资源网络<\/title>/);
  assert.match(html, /首页[\s\S]*公司分析[\s\S]*出海矩阵[\s\S]*人才市场[\s\S]*商务合作/);
  assert.match(html, /聚焦中东社交与海外语聊/);
  assert.match(html, /13万美元大R挂首页，不怕被竞品挖走吗？/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|codex-preview/);
});

test("keeps the real product shell and metadata out of the starter preview", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /function Home\(\)/);
  assert.match(page, /const notes = \[/);
  assert.match(page, /UGC贵族体系也能“玩”？这是我没想到的！/);
  assert.match(page, /function CompanyAnalysisView/);
  assert.match(layout, /小骆｜社交产品资讯与资源网络/);
  assert.doesNotMatch(page, /<SkeletonPreview|codex-preview/);
  assert.match(packageJson, /"postbuild"/);
});

test("product atlas has no contribution buttons", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const matrixView = page.slice(page.indexOf("function MatrixView()"), page.indexOf("function MatrixSubmissionModal"));

  assert.doesNotMatch(matrixView, /我要补充/);
  assert.doesNotMatch(matrixView, /matrix-contribute-button/);
});

test("talent publishing accepts a compressed WebP image under 3 MB", async () => {
  const [page, worker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /input\.accept = IMAGE_UPLOAD_RULES\.accept/);
  assert.match(page, /IMAGE_UPLOAD_RULES\.outputMimeType/);
  assert.match(page, /IMAGE_UPLOAD_RULES\.maxBytes/);
  assert.match(worker, /image_key/);
  assert.match(worker, /env\.MEDIA\.put/);
  assert.match(worker, /webpBytesFromDataUrl/);
  assert.match(worker, /SELECT image_key FROM talent_listings WHERE id = \?/);
});

test("Pages static worker includes talent image persistence and retrieval", async () => {
  const worker = await readFile(new URL("../dist/client/_worker.js", import.meta.url), "utf8");
  assert.match(worker, /image_key/);
  assert.match(worker, /MEDIA\.put/);
  assert.match(worker, /talent-images/);
});

test("Pages worker serves client bundles from static assets before app routing", async () => {
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.match(worker, /url\.pathname\.startsWith\("\/_next\/"\)/);
  assert.match(worker, /return env\.ASSETS\.fetch\(request\)/);
});

test("job cards prioritize the company name over the position title", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const jobCard = page.match(/shownJobs\.map\(\(job\) => <article className="job-card"[\s\S]*?<\/article>\)/)?.[0] ?? "";
  assert.match(jobCard, /<h2>\{job\.company\}<\/h2><h3>\{job\.title\}<\/h3>/);
});

test("job images appear in the detail dialog instead of the job card", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/talent-detail.css", import.meta.url), "utf8"),
  ]);
  const imageInjection = page.slice(page.indexOf('document.querySelectorAll<HTMLElement>(".talent-grid .talent-card")'), page.indexOf("const openPublish"));

  assert.doesNotMatch(imageInjection, /\.job-grid \.job-card/);
  assert.match(imageInjection, /\.talent-grid \.talent-card/);
  assert.match(page, /image\.className = "job-detail-image"/);
  assert.match(page, /job\.imageUrl/);
  assert.match(css, /\.job-detail-image\{[^}]*max-width:100%/);
});

test("job detail image fills its dialog width and scrolls with the dialog", async () => {
  const [detailCss, globalCss] = await Promise.all([
    readFile(new URL("../app/talent-detail.css", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(detailCss, /\.job-detail-image\{[^}]*width:100%[^}]*height:auto[^}]*max-height:none/);
  assert.match(globalCss, /\.job-detail-modal section\{[^}]*max-height:80vh[^}]*overflow:auto/);
});

test("all current dialog overlays close when their empty backdrop is clicked", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /classList\.contains\("matrix-submit-modal"\)[\s\S]{0,100}onClose\(\)/);
  assert.match(page, /classList\.contains\("admin-login-modal"\)[\s\S]{0,100}onClose\(\)/);
  assert.match(page, /classList\.contains\("talent-modal"\)[\s\S]{0,100}setEditing\(null\)/);
  assert.match(page, /modal\.addEventListener\("click",[\s\S]{0,100}event\.target === modal/);
  assert.match(page, /overlay\.addEventListener\("click",[\s\S]{0,100}event\.target === overlay/);
});

test("product matrix card titles use a sans-serif font", async () => {
  const css = await readFile(new URL("../app/matrix-title.css", import.meta.url), "utf8");
  assert.match(css, /\.company-title h3\{[^}]*font-family:Arial,"PingFang SC",sans-serif/);
});

test("home page places the practical tools list below recent notes with a site logo", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/practical-tools.css", import.meta.url), "utf8"),
  ]);

  const toolsIndex = page.indexOf('className="practical-tools shell"');
  const notesIndex = page.indexOf('id="notes"');
  assert.ok(toolsIndex > notesIndex);
  assert.match(page, /https:\/\/immersivetranslate\.com\/zh-Hans\//);
  assert.match(page, /https:\/\/immersivetranslate\.com\/_next\/static\/media\/logo\.761c1cd1\.png/);
  assert.match(page, /推荐人：盖伦/);
  assert.match(page, /https:\/\/vibe-hub\.org\/topics\/product/);
  assert.match(page, /VibeHub 产品术语/);
  assert.match(page, /推荐人：小骆/);
  assert.match(css, /\.practical-tool-card/);
});

test("practical tools heading matches the recent notes heading scale", async () => {
  const css = await readFile(new URL("../app/practical-tools.css", import.meta.url), "utf8");
  assert.match(css, /\.practical-tools \.section-top h2\{font-size:44px;letter-spacing:-\.06em;line-height:1;margin:0\}/);
});

test("article admin supports creating and editing company analyses", async () => {
  const admin = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
  assert.match(admin, /发布公司分析/);
  assert.match(admin, /编辑公司分析/);
  assert.match(admin, /method:\s*editingId\s*\?\s*"PATCH"\s*:\s*"POST"/);
});

test("article admin separates publishing from article management in a sidebar", async () => {
  const [admin, css] = await Promise.all([
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(admin, /article-admin-sidebar/);
  assert.match(admin, /发布文章/);
  assert.match(admin, /管理文章/);
  assert.match(admin, /activePanel === "compose"/);
  assert.match(admin, /setActivePanel\("compose"\)/);
  assert.match(css, /\.article-admin-layout/);
  assert.match(css, /\.article-admin-sidebar/);
});

test("article admin uses the site's flat border-only visual language", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.article-admin-shell\s*\*\{box-shadow:none!important/);
  assert.match(css, /\.article-admin-content \.article-admin-company-fields,\.article-admin-content \.article-admin-body-field\{border-radius:0/);
  assert.match(css, /\.article-admin-content input,.article-admin-content textarea\{[^}]*border-radius:0/);
});

test("article admin gives the company form inputs a more comfortable height", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.article-admin-company-fields input\{min-height:48px/);
  assert.match(css, /\.article-admin-company-fields textarea\{min-height:112px/);
});

test("article reader uses a full-width reading layout without a recommendation rail", async () => {
  const [reader, css] = await Promise.all([
    readFile(new URL("../app/analysis/[slug]/reader.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(reader, /article-recommendations/);
  assert.doesNotMatch(reader, /externalRecommendations/);
  assert.doesNotMatch(css, /\.article-recommendations/);
  assert.match(css, /\.article-reader-shell\{min-height:100vh;background:#f5f8f6;padding:0 20px 96px/);
  assert.match(css, /\.article-reader-header\{max-width:none/);
  assert.match(css, /\.article-reader-content\{max-width:none/);
  assert.match(css, /\.article-reader-header h1\{[^}]*font-size:34px/);
});

test("article reader retains the site navigation with company analysis selected", async () => {
  const [page, reader] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/analysis/[slug]/reader.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(reader, /article-site-nav/);
  assert.match(reader, /首页/);
  assert.match(reader, /公司分析/);
  assert.match(reader, /className="active"/);
  assert.match(reader, /\?view=matrix/);
  assert.doesNotMatch(page, /new URLSearchParams\(window\.location\.search\)/);
});

test("article reader keeps the site navigation visible and offers a return-to-top control", async () => {
  const [reader, css] = await Promise.all([
    readFile(new URL("../app/analysis/[slug]/reader.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(reader, /className="article-nav-bar"/);
  assert.match(reader, /article-return-top/);
  assert.match(reader, /window\.scrollTo\(\{ top: 0, behavior: "smooth" \}\)/);
  assert.match(css, /\.article-nav-bar\{position:sticky;top:0;z-index:30/);
  assert.match(css, /\.article-nav-bar\{[^}]*background:var\(--color-page\)/);
  assert.match(css, /\.article-return-top/);
});

test("article reader links to adjacent analyses around its return-to-top control", async () => {
  const reader = await readFile(new URL("../app/analysis/[slug]/reader.tsx", import.meta.url), "utf8");
  assert.match(reader, /fetch\("\/api\/articles"/);
  assert.match(reader, /上一篇/);
  assert.match(reader, /下一篇/);
  assert.match(reader, /article-adjacent-link/);
});

test("article cards prepare their route and body before navigation", async () => {
  const [page, reader] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/analysis/[slug]/reader.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /prefetchArticleRoute\(item\.slug\)/);
  assert.match(page, /prefetchArticle\(item\.slug, item\.updatedAt\)/);
  assert.match(page, /onPointerEnter=\{\(\) => warmArticle\(item\)\}/);
  assert.match(page, /onTouchStart=\{\(\) => warmArticle\(item\)\}/);
  assert.match(reader, /useState<Article \| null>\(null\)/);
  assert.match(reader, /const cached = readCachedArticle\(slug\)/);
});

test("company-analysis list keeps a readable editorial rhythm", async () => {
  const [page, css, tokens] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/analysis-list.css", import.meta.url), "utf8"),
    readFile(new URL("../tokens.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /<span>搜索公司、产品或关键词<\/span>/);
  assert.match(css, /\.analysis-list\{display:grid;gap:var\(--space-section\)/);
  assert.match(css, /@media\(max-width:720px\)\{[\s\S]*\.analysis-list\{gap:var\(--space-component\)/);
  assert.match(tokens, /--space-section:\s*40px/);
  assert.match(tokens, /--space-component:\s*24px/);
  assert.match(css, /\.analysis-list article\{padding:30px 32px/);
  assert.match(css, /\.analysis-list h2\{[^}]*line-height:1\.32/);
  assert.match(css, /\.analysis-list p\{[^}]*line-height:1\.8/);
});

test("site design tokens provide one reusable visual source", async () => {
  const [tokens, layout] = await Promise.all([
    readFile(new URL("../tokens.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  for (const name of [
    "color-brand", "color-brand-strong", "color-brand-soft", "color-text",
    "color-muted", "color-border", "color-page", "color-surface", "color-surface-subtle",
    "space-tight", "space-content", "space-component", "space-section",
    "radius-control", "radius-card", "font-sans", "motion-duration",
    "motion-lift", "shadow-card-hover",
  ]) assert.match(tokens, new RegExp(`--${name}:`));
  assert.ok(layout.indexOf('import "../tokens.css"') < layout.indexOf('import "./globals.css"'));
});

test("public UI retires the brown palette and uses reusable heading rhythm tokens", async () => {
  const cssFiles = [
    "globals.css", "business-overrides.css", "home-light.css", "app-light.css",
    "color-reset.css", "practical-tools.css", "analysis-list.css", "talent-detail.css",
    "_sites-preview/preview.css",
  ];
  const [tokens, reset, ...styles] = await Promise.all([
    readFile(new URL("../tokens.css", import.meta.url), "utf8"),
    readFile(new URL("../app/color-reset.css", import.meta.url), "utf8"),
    ...cssFiles.map((file) => readFile(new URL(`../app/${file}`, import.meta.url), "utf8")),
  ]);

  for (const [name, value] of [
    ["line-height-display", "1.12"],
    ["line-height-section", "1.2"],
    ["line-height-card", "1.35"],
    ["line-height-article-title", "1.22"],
  ]) assert.match(tokens, new RegExp(`--${name}:\\s*${value}`));

  assert.match(reset, /font-size: var\(--font-size-display\)[^}]*line-height: var\(--line-height-display\)/s);
  assert.match(reset, /font-size: var\(--font-size-card\)[^}]*line-height: var\(--line-height-card\)/s);
  assert.match(reset, /article-reader-header h1[^}]*line-height: var\(--line-height-article-title\)/s);

  const retiredBrown = /#(?:867047|887452|927147|a27d45|81765f|827155|8a7654|877451|b29f80|917c5b|7e6848|897852|83745a|80785f|8a8068|7a6b52|a2692f|a56930|c6b8a3|bdb09b|bcae98|c7bba7|d8cfbf|d3cabd|a99b86|c9baa5|c8baa5|bba982|d2c7b5|fffdf8|fffefa|f7f3eb|f4efe6|ebe5da|e8e1d5|efeae0|e9e3d8|e8e5dc|ded5c6|dfcfc3|d3c4a8|f1ece3|e4ddd0|b18a4d|a67f45|a26d58|cdbfa9|d4c9b8|af8d57|d4bf8c|f5f1e8|f2ece0|f0eadf|efeadf|ece9e5|e7e4df|e5d1a3|e4cd95|e2ddd2|dedbd6|d5ccbd|c9c4b9|b18b59|a48d68|9a958b|7c6848|755127|73530f|6c735f|443324)\b/i;
  for (const [index, css] of styles.entries()) {
    assert.doesNotMatch(css, retiredBrown, `${cssFiles[index]} still contains a retired brown UI color`);
  }
});

test("the public shell refreshes to 首页 on a white canvas with white card hover", async () => {
  const [page, tokens, reset, tools] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../tokens.css", import.meta.url), "utf8"),
    readFile(new URL("../app/color-reset.css", import.meta.url), "utf8"),
    readFile(new URL("../app/practical-tools.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, />首页<\/button>/);
  assert.doesNotMatch(page, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(tokens, /--color-page:\s*#fff(?:fff)?/i);
  assert.match(reset, /body, main \{ background: var\(--color-page\) !important/);
  assert.match(reset, /\.analysis-list article:hover[^}]*background: var\(--color-surface\) !important/);
  assert.match(tools, /\.practical-tool-card\{[^}]*background:var\(--color-page\)/);
  assert.match(tools, /\.practical-tool-card:hover\{[^}]*background:var\(--color-surface\)/);
});

test("legacy page palettes delegate to semantic color tokens", async () => {
  const [home, app, reset] = await Promise.all([
    readFile(new URL("../app/home-light.css", import.meta.url), "utf8"),
    readFile(new URL("../app/app-light.css", import.meta.url), "utf8"),
    readFile(new URL("../app/color-reset.css", import.meta.url), "utf8"),
  ]);
  assert.match(home, /--home-jade:\s*var\(--color-brand\)/);
  assert.match(home, /--home-ink:\s*var\(--color-text\)/);
  assert.match(app, /--app-jade:\s*var\(--color-brand\)/);
  assert.match(app, /--app-line:\s*var\(--color-border\)/);
  assert.match(reset, /--ink:\s*var\(--color-text\)/);
  assert.match(reset, /--paper:\s*var\(--color-page\)/);
});

test("active styles no longer hard-code the retired green palette", async () => {
  const files = ["globals.css", "business-overrides.css", "home-light.css", "app-light.css", "color-reset.css", "analysis-list.css", "practical-tools.css", "matrix-title.css", "talent-detail.css"];
  const css = (await Promise.all(files.map((file) => readFile(new URL(`../app/${file}`, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(css, /#25866c|#17614f|#e8f5ee/i);
});

test("shared components consume semantic spacing and radius tokens", async () => {
  const [analysis, app, reset] = await Promise.all([
    readFile(new URL("../app/analysis-list.css", import.meta.url), "utf8"),
    readFile(new URL("../app/app-light.css", import.meta.url), "utf8"),
    readFile(new URL("../app/color-reset.css", import.meta.url), "utf8"),
  ]);
  assert.match(analysis, /\.analysis-list\{[^}]*gap:var\(--space-section\)/);
  assert.match(app, /\.community-modal section\{[^}]*border-radius:var\(--radius-card\)/);
  assert.match(reset, /\.analysis-search input[^}]*border-radius:\s*var\(--radius-control\)/);
});

test("public pages share one sans-serif typeface and one card interaction", async () => {
  const [page, globals, tools] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/practical-tools.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<span>搜索公司或产品<\/span>/);
  assert.match(globals, /font-family:Arial,"PingFang SC","Microsoft YaHei",sans-serif/);
  const app = await readFile(new URL("../app/app-light.css", import.meta.url), "utf8");
  assert.match(app, /body, body \* \{ font-family: var\(--font-sans\) !important; \}/);
  assert.match(tools, /\.practical-tool-card\{[^}]*border-radius:var\(--radius-card\)/);
  assert.doesNotMatch(tools, /border-color:#6fa18e|background:#f3f8f5|box-shadow:0 12px 22px/);
  assert.match(tools, /\.practical-tool-card:hover\{[^}]*border-color:var\(--color-brand\)[^}]*transform:var\(--motion-lift\)[^}]*box-shadow:var\(--shadow-card-hover\)/);
  assert.match(app, /\.analysis-list article:hover[^}]*transform: var\(--motion-lift\)[^}]*box-shadow: var\(--shadow-card-hover\)/);
});

test("public typography and primary actions use the compact token scale", async () => {
  const [tokens, reset] = await Promise.all([
    readFile(new URL("../tokens.css", import.meta.url), "utf8"),
    readFile(new URL("../app/color-reset.css", import.meta.url), "utf8"),
  ]);
  assert.match(tokens, /--font-size-display:\s*48px/);
  assert.match(tokens, /--font-size-section:\s*36px/);
  assert.match(tokens, /--font-size-card:\s*24px/);
  assert.match(tokens, /--font-size-article-title:\s*34px/);
  assert.match(tokens, /--font-size-article-title-mobile:\s*30px/);
  assert.match(reset, /\.primary[^}]*background: var\(--color-brand\) !important/);
  assert.match(reset, /\.primary:hover[^}]*background: var\(--color-brand-strong\) !important/);
  assert.match(reset, /\.article-reader-header h1[^}]*font-size: var\(--font-size-article-title\) !important/);
  assert.match(reset, /@media \(max-width: 720px\)[\s\S]*\.article-reader-header h1[^}]*font-size: var\(--font-size-article-title-mobile\) !important/);
});

test("slow public data starts loading before its destination tab is opened", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const preloadPublicData = \(\) =>/);
  assert.match(page, /void loadArticles\(\)/);
  assert.match(page, /void loadTalentItems\(\)/);
  assert.match(page, /requestIdleCallback/);
});

test("community button opens an accessible QR-code dialog", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/app-light.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /className="community-fab"/);
  assert.match(page, /群聊：小骆 🐫 语聊出海交流 2 群/);
  assert.match(page, /src="\/community-qr\.jpg"/);
  assert.match(page, /event\.key === "Escape"/);
  assert.match(page, /event\.target === event\.currentTarget/);
  assert.match(css, /\.community-fab\{position:fixed/);
  assert.match(css, /\.community-modal\{position:fixed/);
});

test("community dialog follows the tokenized editorial modal layout", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/app-light.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /className="community-modal-header"/);
  assert.match(page, /交流群\s*<span>\/\s*COMMUNITY<\/span>/);
  assert.match(page, /className="community-qr-card"/);
  assert.match(page, /className="community-save"[^>]*href="\/community-qr\.jpg"[^>]*download/);
  assert.match(css, /\.community-modal\{[^}]*backdrop-filter:blur\(8px\)/);
  assert.match(css, /\.community-modal section\{[^}]*width:min\(100%,720px\)[^}]*border-radius:var\(--radius-card\)/);
  assert.match(css, /\.community-modal-header\{[^}]*padding:var\(--space-component\)/);
  assert.match(css, /\.community-qr-card\{[^}]*border:1px solid var\(--color-border\)[^}]*border-radius:var\(--radius-card\)/);
  assert.match(css, /\.community-save\{[^}]*background:var\(--color-brand\)/);
  assert.match(css, /@media\(max-width:720px\)\{[\s\S]*\.community-modal-body\{padding:var\(--space-content\)/);
});

test("article editor separates company information from the Markdown body", async () => {
  const [admin, css] = await Promise.all([
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(admin, /article-admin-form-grid/);
  assert.match(admin, /article-admin-company-fields/);
  assert.match(admin, /article-admin-body-field/);
  assert.match(admin, /<span>公司名称<\/span>/);
  assert.match(admin, /<span>文章标题<\/span>/);
  assert.match(admin, /<span>文章摘要<\/span>/);
  assert.doesNotMatch(admin, /标签，用顿号或逗号分隔/);
  assert.match(admin, /支持 GPT Markdown 和表格/);
  assert.match(css, /\.article-admin-form-grid/);
  assert.match(css, /\.article-admin-body-field/);
});

test("article publishing generates a link identifier when the editor omits it", async () => {
  const [admin, worker] = await Promise.all([
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../worker/articles.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(admin, /文章链接标识/);
  assert.match(worker, /const slug = clean\(raw\.slug, 96\) \|\| `article-\$\{crypto\.randomUUID\(\)\.slice\(0, 8\)\}`/);
  assert.match(worker, /slug, summary:/);
});

test("article reader renders GPT-style Markdown tables and inline formatting", async () => {
  const [reader, css] = await Promise.all([
    readFile(new URL("../app/analysis/[slug]/reader.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(reader, /function renderMarkdown/);
  assert.match(reader, /article-markdown-table/);
  assert.match(reader, /article-markdown-inline/);
  assert.match(css, /\.article-markdown-table/);
  assert.match(css, /overflow-x:auto/);
});

test("article reader uses a calmer scale for body section headings", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.article-reader-content\{[^}]*font-size:16px/);
  assert.match(css, /\.article-reader-content h2\{margin:48px 0 16px;font-size:24px/);
  assert.match(css, /\.article-reader-content h3\{[^}]*font-size:18px/);
  assert.match(css, /\.article-reader-header \.article-summary\{font-size:15px/);
});

test("article reader hydrates from identical server and client state", async () => {
  const reader = await readFile(new URL("../app/analysis/[slug]/reader.tsx", import.meta.url), "utf8");
  assert.match(reader, /useState<Article \| null>\(null\)/);
  assert.match(reader, /const cached = readCachedArticle\(slug\)/);
  assert.doesNotMatch(reader, /useState<Article \| null>\(\(\) => readCachedArticle/);
});

test("selection and highlighted panels use semantic color tokens", async () => {
  const [tokens, app, reset] = await Promise.all([
    readFile(new URL("../tokens.css", import.meta.url), "utf8"),
    readFile(new URL("../app/app-light.css", import.meta.url), "utf8"),
    readFile(new URL("../app/color-reset.css", import.meta.url), "utf8"),
  ]);
  assert.match(tokens, /--color-selection-bg:/);
  assert.match(tokens, /--color-selection-text:/);
  assert.match(tokens, /--color-highlight:/);
  assert.match(tokens, /--color-highlight-border:/);
  assert.match(app, /::selection\s*\{[^}]*background:\s*var\(--color-selection-bg\)[^}]*color:\s*var\(--color-selection-text\)/s);
  assert.match(reset, /\.matrix-callout\s*\{[^}]*background:\s*var\(--color-highlight\) !important/s);
  assert.match(reset, /\.matrix-callout h2\s*\{[^}]*color:\s*var\(--color-text\) !important/s);
  assert.match(reset, /\.matrix-callout \.eyebrow\s*\{[^}]*color:\s*var\(--color-brand-strong\) !important/s);
  assert.match(reset, /\.matrix-callout > div:last-child p\s*\{[^}]*color:\s*var\(--color-muted\) !important/s);
});

test("mobile navigation and article states use semantic color tokens", async () => {
  const [globals, reset] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/color-reset.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(globals, /rgba\(240,234,223,/);
  assert.match(globals, /@media\(max-width:720px\)\{[\s\S]*?\.nav\{[^}]*background:var\(--color-page\)/);
  assert.match(reset, /@media \(max-width: 720px\)[\s\S]*?\.nav nav[^}]*background:\s*var\(--color-page\) !important/s);
  assert.match(reset, /\.nav nav button, \.article-site-nav nav a\s*\{[^}]*color:\s*var\(--color-muted\) !important/s);
  assert.match(reset, /\.nav nav button\.active, \.article-site-nav nav a\.active\s*\{[^}]*color:\s*var\(--color-text\) !important[^}]*border-color:\s*var\(--color-brand\) !important/s);
  assert.doesNotMatch(globals, /\.article-site-nav nav a\{[^}]*color:#[0-9a-f]{3,6}/i);
  assert.doesNotMatch(globals, /\.article-nav-bar\{[^}]*background:#[0-9a-f]{3,6}/i);
});

test("responsive public styles do not retain legacy palette literals", async () => {
  const [tokens, reset, business] = await Promise.all([
    readFile(new URL("../tokens.css", import.meta.url), "utf8"),
    readFile(new URL("../app/color-reset.css", import.meta.url), "utf8"),
    readFile(new URL("../app/business-overrides.css", import.meta.url), "utf8"),
  ]);
  assert.match(tokens, /--color-overlay:/);
  assert.match(tokens, /--color-danger:/);
  assert.match(tokens, /--color-danger-border:/);
  assert.doesNotMatch(reset, /#(?:fff0bd|e8c467|f8df94|d6ae45|eaf7f1|cfe8dc|eff8f4|d4e9de|fff2cf|b42318|f1c5c1)/i);
  assert.doesNotMatch(reset, /rgba\((?:12, 37, 29|11, 40, 30),/);
  assert.doesNotMatch(business, /rgba\(255, 253, 249,/);
});

test("article backend checks the existing site management session before article credentials", async () => {
  const worker = await readFile(new URL("../worker/articles.ts", import.meta.url), "utf8");
  assert.match(worker, /cookie\(request, "xiaoluo_admin"\)/);
  assert.match(worker, /talent_admin_sessions/);
  assert.match(worker, /return siteAdminAuthenticated\(request, env\) \|\| articleAuthenticated\(request, env\)/);
});

test("company analysis archive reads published articles from the API", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /fetch\("\/api\/articles"/);
  assert.match(page, /\/analysis\/\$\{item\.slug\}/);
});

test("company analysis archive paginates ten articles per page", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const ANALYSIS_PAGE_SIZE = 10/);
  assert.match(page, /shownAnalyses\.slice\(\(currentPage - 1\) \* ANALYSIS_PAGE_SIZE, currentPage \* ANALYSIS_PAGE_SIZE\)/);
  assert.match(page, /setPage\(1\)/);
  assert.match(page, /className="analysis-pagination"/);
  assert.match(css, /\.analysis-pagination/);
});

test("article publishing entry appears only for logged-in managers", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<CompanyAnalysisView admin=\{admin\} \/>/);
  assert.match(page, /function CompanyAnalysisView\(\{ admin \}: \{ admin: boolean \}\)/);
  assert.match(page, /\{admin && <a className="primary analysis-publish-link" href="\/admin">发布文章 →<\/a>\}/);
});

test("article admin uses the site management session instead of a second login form", async () => {
  const [loginPage, adminPage] = await Promise.all([
    readFile("app/admin/login/page.tsx", "utf8"),
    readFile("app/admin/page.tsx", "utf8"),
  ]);

  assert.doesNotMatch(loginPage, /<form|账号|密码/);
  assert.match(loginPage, /window\.location\.replace\("\/\?view=analysis"\)/);
  assert.match(adminPage, /response\.status === 401[\s\S]*location\.assign\("\/\?view=analysis"\)/);
});

test("company analysis cards link as a whole and preserve the analysis view on return", async () => {
  const [page, reader] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/analysis/[slug]/reader.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /className="analysis-card-link" href=\{`\/analysis\/\$\{item\.slug\}`\}/);
  assert.match(reader, /href="\/\?view=analysis"/);
});

test("article reader uses the site card layout", async () => {
  const [reader, css] = await Promise.all([
    readFile(new URL("../app/analysis/[slug]/reader.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(reader, /article-reader-shell/);
  assert.match(reader, /article-reader-card/);
  assert.match(css, /\.article-reader-card/);
  assert.match(css, /\.article-reader-content/);
});

test("business page puts the partner link before the resource directory", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const businessView = page.slice(page.indexOf("function BusinessView()"), page.indexOf("function CompanyAnalysisView()"));

  assert.ok(businessView.indexOf('className="business-links shell"') < businessView.indexOf('className="business-resources shell"'));
});

test("featured partner card has a compact desktop height", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(css, /\.business-link-grid \.featured-link\{min-height:210px!important;padding:24px 30px!important\}/);
});

test("public talent market keeps publishing controls inside admin mode", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const talentView = page.slice(page.indexOf("function TalentView("), page.indexOf("function EmptyTalentState"));

  assert.match(talentView, /\{admin && <button className="primary publish-talent"/);
  assert.match(talentView, /\{admin && <section className="talent-callout shell">/);
});

test("home shows three desktop notes and switches to a compact mobile media list", async () => {
  const [page, css, app] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/app-light.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /notes\.slice\(0, 3\)\.map/);
  assert.match(css, /\.home-theme \.notes\.notes-list\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(css, /\.home-theme \.note\.note-list-item\{display:grid!important;grid-template-columns:112px minmax\(0,1fr\)!important/);
  assert.match(app, /@media \(max-width: 720px\)[\s\S]*\.home-theme \.notes\.notes-list \{ grid-template-columns: 1fr !important; gap: var\(--space-content\) !important; \}/);
  assert.match(app, /\.home-theme \.note\.note-list-item \{[\s\S]*grid-template-columns: 112px minmax\(0, 1fr\);[\s\S]*padding: var\(--space-content\) 0 !important;/);
  assert.match(app, /\.home-theme \.note\.note-list-item \.note-content h3 \{[\s\S]*-webkit-line-clamp: 2/);
});

test("homepage uses a compact hero and recent-notes rhythm", async () => {
  const [page, home] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/home-light.css", import.meta.url), "utf8"),
  ]);

  assert.match(home, /\.home-theme \.hero \{[^}]*padding: 40px 0 32px !important/);
  assert.match(home, /\.home-theme \.hero-visual img \{[^}]*height: min\(23vw, 340px\)/);
  assert.match(home, /\.home-theme \.visitor-strip \{[^}]*margin-top: -10px[^}]*padding: 16px 24px/);
  assert.match(home, /\.home-theme \.section \{ padding: 64px 0; \}/);
  assert.match(home, /\.home-theme \.section-top \{[^}]*margin-bottom: 24px[^}]*padding-bottom: 12px/);
  assert.match(home, /\.home-theme \.note-cover \{[^}]*aspect-ratio: 4 \/ 5/);
  assert.match(page, /13万美元大R挂首页，不怕被竞品挖走吗？/);
  assert.match(page, /TopTop资深产品Ray，说透了什么叫本地化/);
  assert.match(page, /一年营收150亿的欢聚，为什么复制不出第二/);
});

test("mobile header uses a compact tokenized rhythm", async () => {
  const reset = await readFile(new URL("../app/color-reset.css", import.meta.url), "utf8");
  assert.match(reset, /@media \(max-width: 720px\)[\s\S]*\.nav \{[^}]*height: 54px !important[^}]*padding-block: 0 !important/s);
  assert.match(reset, /\.nav nav \{[^}]*top: 54px !important[^}]*height: 38px !important[^}]*justify-content: space-between !important[^}]*gap: 0 !important/s);
  assert.match(reset, /\.nav nav button, \.article-site-nav nav a \{[^}]*font-size: 12px !important[^}]*padding: 10px 0 !important/s);
  assert.match(reset, /\.home-theme \.hero \{[^}]*padding-top: 56px !important/s);
});

test("homepage metrics use five equal compact columns without a leading label", async () => {
  const [page, home, reset] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/home-light.css", import.meta.url), "utf8"),
    readFile(new URL("../app/color-reset.css", import.meta.url), "utf8"),
  ]);

  const strip = page.match(/<section className="visitor-strip shell"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.doesNotMatch(strip, /本站与账号数据|visitor-pulse/);
  assert.match(home, /\.home-theme \.visitor-strip \{[^}]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(home, /\.home-theme \.visitor-strip > div \{[^}]*text-align: center/);
  assert.match(home, /\.home-theme \.visitor-strip b \{[^}]*font: 400 26px\/1/);
  assert.match(home, /@media \(max-width: 720px\)[\s\S]*\.home-theme \.visitor-strip b \{ font-size: 20px; \}/);
  assert.match(reset, /\.home-theme \.visitor-strip > div \+ div \{[^}]*border-left: 1px solid var\(--color-border\)/);
});

test("talent publishing shows its error inside the modal and retains the returned image URL", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /const \[publishError, setPublishError\] = useState\(""\)/);
  assert.match(page, /publishErrorNode\.setAttribute\("role", "alert"\)/);
  assert.match(page, /\{ \.\.\.payload, \.\.\.data\.item,/);
});

test("job cards include a button that opens the full listing details", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /button\.className = "job-detail-button"/);
  assert.match(page, /button\.textContent = "查看详情"/);
  assert.match(page, /modal\.className = "job-detail-modal"/);
});

test("job detail button is compact and keeps white text when active", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(css, /\.job-detail-button\{[^}]*padding:8px 14px[^}]*text-align:center/);
  assert.match(css, /\.job-detail-button:hover\{[^}]*color:#fff/);
});

test("four public tabs share one page header pattern", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/color-reset.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /function PageHeader/);
  assert.equal((page.match(/<PageHeader /g) || []).length, 4);
  assert.match(page, /eyebrow="RESEARCH ARCHIVE" title="最新公司分析"/);
  assert.match(page, /eyebrow="PRODUCT ATLAS" title="出海产品矩阵"/);
  assert.match(page, /eyebrow="TALENT MARKET" title="人才市场"/);
  assert.match(page, /eyebrow="BUSINESS COLLABORATION" title="商务合作"/);
  assert.match(css, /\.page-header\s*\{[^}]*padding:[^}]*var\(--space-section\)/s);
  assert.match(css, /\.page-header h1\s*\{[^}]*font-size:\s*var\(--font-size-section\)/s);
});

test("mobile primary navigation starts on the avatar alignment line", async () => {
  const css = await readFile(new URL("../app/color-reset.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.nav nav \{[^}]*padding-inline: var\(--space-content\) !important/s);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.nav nav \{[^}]*justify-content: space-between !important[^}]*gap: 0 !important/s);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.nav nav \{[^}]*left: calc\(\(100vw - 100%\) \/ -2\) !important/s);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.page-header \{[^}]*margin-top: 38px[^}]*padding: var\(--space-component\) 0/s);
});

test("article archive exposes persistent view counts", async () => {
  const [page, reader, worker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/analysis/[slug]/reader.tsx", import.meta.url), "utf8"),
    readFile(new URL("../worker/articles.ts", import.meta.url), "utf8"),
  ]);

  assert.match(worker, /view_count INTEGER NOT NULL DEFAULT 0/);
  assert.match(worker, /UPDATE analysis_articles SET view_count = view_count \+ 1 WHERE slug = \?/);
  assert.match(worker, /url\.pathname\.endsWith\("\/view"\) && request\.method === "POST"/);
  assert.match(reader, /incrementArticleView\(slug\)/);
  assert.match(page, /className="analysis-views">阅读 \{item\.views\}/);
});
