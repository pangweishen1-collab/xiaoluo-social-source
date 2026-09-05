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
  assert.match(html, /资讯与我[\s\S]*公司分析[\s\S]*出海矩阵[\s\S]*人才市场[\s\S]*商务合作/);
  assert.match(html, /聚焦中东社交与海外语聊/);
  assert.match(html, /先收藏再看！中国出海泛娱乐社交产品版图/);
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

  assert.match(page, /input\.accept = "image\/png,image\/jpeg,image\/webp"/);
  assert.match(page, /image\/webp/);
  assert.match(page, /3 \* 1024 \* 1024/);
  assert.match(worker, /image_key/);
  assert.match(worker, /env\.MEDIA\.put/);
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
  assert.match(css, /\.article-reader-header h1\{[^}]*font-size:40px/);
});

test("article reader retains the site navigation with company analysis selected", async () => {
  const [page, reader] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/analysis/[slug]/reader.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(reader, /article-site-nav/);
  assert.match(reader, /资讯与我/);
  assert.match(reader, /公司分析/);
  assert.match(reader, /className="active"/);
  assert.match(reader, /\?view=matrix/);
  assert.match(page, /view === "analysis" \|\| view === "matrix" \|\| view === "talent" \|\| view === "business"/);
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
  assert.match(css, /\.article-nav-bar\{[^}]*background:#fff/);
  assert.match(css, /\.article-return-top/);
});

test("article reader links to adjacent analyses around its return-to-top control", async () => {
  const reader = await readFile(new URL("../app/analysis/[slug]/reader.tsx", import.meta.url), "utf8");
  assert.match(reader, /fetch\("\/api\/articles"/);
  assert.match(reader, /上一篇/);
  assert.match(reader, /下一篇/);
  assert.match(reader, /article-adjacent-link/);
});

test("company-analysis list keeps a readable editorial rhythm", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/analysis-list.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /<span>搜索公司、产品或关键词<\/span>/);
  assert.match(css, /\.analysis-list\{display:grid;gap:42px/);
  assert.match(css, /@media\(max-width:720px\)\{[\s\S]*\.analysis-list\{gap:24px/);
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
    "color-muted", "color-border", "color-surface", "color-surface-subtle",
    "space-tight", "space-content", "space-component", "space-section",
    "radius-control", "radius-card",
  ]) assert.match(tokens, new RegExp(`--${name}:`));
  assert.ok(layout.indexOf('import "../tokens.css"') < layout.indexOf('import "./globals.css"'));
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
  assert.match(reset, /--paper:\s*var\(--color-surface\)/);
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
  assert.match(css, /\.article-reader-content h2\{margin:56px 0 18px;font-size:28px/);
  assert.match(css, /\.article-reader-content h3\{font-size:20px/);
  assert.match(css, /\.article-reader-header \.article-summary\{font-size:16px/);
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
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /notes\.slice\(0, 3\)\.map/);
  assert.match(css, /\.home-theme \.notes\.notes-list\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(css, /\.home-theme \.note\.note-list-item\{display:grid!important;grid-template-columns:112px minmax\(0,1fr\)!important/);
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
