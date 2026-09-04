# 公司分析文章后台与阅读页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independently authenticated article CMS for company analysis, with immediate publishing and professional Markdown reading pages.

**Architecture:** Keep Cloudflare Worker as the API boundary and D1 as persistence. Add article-specific session and content endpoints without altering the existing talent endpoints. Introduce focused React routes for login, administration, article reading, and reusable article presentation/Markdown components.

**Tech Stack:** Vinext/React 19, TypeScript, Cloudflare Workers, Cloudflare D1, Node built-in test runner, CSS.

**Spec:** `docs/superpowers/specs/2026-09-02-company-analysis-articles-design.md`

## Global Constraints

- Use separate article credentials from `ARTICLE_ADMIN_USERNAME` and `ARTICLE_ADMIN_PASSWORD_HASH`; never hard-code new credentials.
- Do not reuse `xiaoluo_admin`, `talent_admin_sessions`, or talent APIs for article administration.
- Article saves are immediately public; no draft workflow, media upload, or rich-text dependency.
- Accept only limited Markdown and render it as React nodes; never use `dangerouslySetInnerHTML`.
- Preserve all current talent, matrix, visitor, and static company-analysis fallback behavior.
- Keep every write endpoint same-origin protected and article-admin authenticated.

---

### Task 1: Define article domain types and safe Markdown rendering

**Files:**
- Create: `src/articles/types.ts`
- Create: `src/articles/markdown.tsx`
- Create: `tests/articles-markdown.test.mjs`

**Interfaces:**
- Produces `ArticleSummary`, `Article`, and `ArticleDraft` used by API clients and React routes.
- Produces `renderArticleMarkdown(body: string): React.ReactNode[]` for the detail page.

- [ ] **Step 1: Write the failing Markdown tests**

```js
test("renders headings, paragraphs, lists and bold without executing HTML", () => {
  const html = renderToStaticMarkup(renderArticleMarkdown("## 结论\n\n**重点**\n\n- 一\n- 二\n\n<script>alert(1)</script>"));
  assert.match(html, /<h2>结论<\/h2>/);
  assert.match(html, /<strong>重点<\/strong>/);
  assert.match(html, /<ul><li>一<\/li><li>二<\/li><\/ul>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/articles-markdown.test.mjs`

Expected: FAIL because `src/articles/markdown.tsx` does not exist.

- [ ] **Step 3: Implement the minimal typed renderer**

Create the three article types. Split blank-line blocks; recognize `#`, `##`, `###`, ordered/unordered lists, and `**bold**`. Return React nodes only, so raw HTML remains text.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/articles-markdown.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```bash
git add src/articles/types.ts src/articles/markdown.tsx tests/articles-markdown.test.mjs
git commit -m "feat: add safe article markdown renderer"
```

### Task 2: Add isolated article authentication and D1 article CRUD

**Files:**
- Create: `worker/articles.ts`
- Modify: `worker/index.ts`
- Create: `tests/articles-api.test.mjs`

**Interfaces:**
- Consumes `Article`, `ArticleDraft`, and Worker `Env`.
- Produces `handleArticleApi(request, env, url): Promise<Response | null>`.
- Registers `/api/articles`, `/api/articles/:slug`, `/api/article-admin/session`, and `/api/article-admin/articles` endpoints.

- [ ] **Step 1: Write failing Worker API tests with a D1 statement fake**

```js
test("rejects article writes without the article-admin cookie", async () => {
  const response = await handleArticleApi(request("POST", "/api/article-admin/articles", validArticle), fakeEnv, url);
  assert.equal(response.status, 401);
});

test("creates an article then exposes its summary and detail publicly", async () => {
  await loginArticleAdmin(fakeEnv);
  const created = await handleArticleApi(adminRequest("POST", "/api/article-admin/articles", validArticle), fakeEnv, url);
  assert.equal(created.status, 201);
  assert.equal((await json(await handleArticleApi(request("GET", "/api/articles", null), fakeEnv, url))).items[0].body, undefined);
  assert.equal((await json(await handleArticleApi(request("GET", "/api/articles/example-article", null), fakeEnv, url))).item.body, validArticle.body);
});
```

- [ ] **Step 2: Run the API test to verify it fails**

Run: `node --test tests/articles-api.test.mjs`

Expected: FAIL because `handleArticleApi` does not exist.

- [ ] **Step 3: Implement schema, validation and endpoints**

Implement `ensureArticleSchema`, `isArticleAdmin`, login/logout, bounded payload validation, slug validation (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), D1 create/update/delete/list/read queries, and `409` on duplicate slug. Use the `xiaoluo_article_admin` cookie and `article_admin_sessions` table only. Route article endpoints before `handler.fetch` in `worker/index.ts`.

- [ ] **Step 4: Run API tests to verify they pass**

Run: `node --test tests/articles-api.test.mjs`

Expected: PASS, including independent-session, invalid-slug, duplicate-slug, 404, same-origin and unauthenticated-write cases.

- [ ] **Step 5: Commit the task**

```bash
git add worker/articles.ts worker/index.ts tests/articles-api.test.mjs
git commit -m "feat: add isolated article API"
```

### Task 3: Build the public company-analysis list and article reading route

**Files:**
- Create: `src/articles/api.ts`
- Create: `src/articles/ArticleList.tsx`
- Create: `src/articles/ArticleDetail.tsx`
- Create: `app/analysis/[slug]/page.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/articles-public-view.test.mjs`

**Interfaces:**
- Consumes `GET /api/articles`, `GET /api/articles/:slug`, `ArticleSummary`, `Article`, and `renderArticleMarkdown`.
- Produces click-through article cards at `/analysis/:slug` and a responsive public article page.

- [ ] **Step 1: Write failing public-view tests**

```js
test("analysis cards link to their article slug", async () => {
  const html = renderToStaticMarkup(<ArticleList articles={[articleSummary]} fallback={[]} />);
  assert.match(html, /href="\/analysis\/example-article"/);
});

test("article detail uses title as the visual h1 and body headings below it", () => {
  const html = renderToStaticMarkup(<ArticleDetail article={article} />);
  assert.match(html, /<h1>示例标题<\/h1>/);
  assert.match(html, /<h2>核心结论<\/h2>/);
});
```

- [ ] **Step 2: Run public-view tests to verify they fail**

Run: `node --test tests/articles-public-view.test.mjs`

Expected: FAIL because the article components do not exist.

- [ ] **Step 3: Implement article UI and routing**

Replace the static company-analysis card rendering with an API-backed `ArticleList` while retaining static cards only when the public API request fails. Use anchors/links for dynamic cards. Build `/analysis/[slug]` to fetch the public detail API, render a clear not-found state for 404, and never expose admin actions.

Add styles for a 760px reading column, strong h1/h2/h3 hierarchy, muted metadata, summary lead, tags, list spacing, return link, and narrow-screen single-column layout.

- [ ] **Step 4: Run public-view tests to verify they pass**

Run: `node --test tests/articles-public-view.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```bash
git add src/articles/api.ts src/articles/ArticleList.tsx src/articles/ArticleDetail.tsx app/analysis/[slug]/page.tsx app/page.tsx app/globals.css tests/articles-public-view.test.mjs
git commit -m "feat: add company analysis article pages"
```

### Task 4: Build the independent article administration routes

**Files:**
- Create: `src/articles/AdminLogin.tsx`
- Create: `src/articles/ArticleAdmin.tsx`
- Create: `app/admin/login/page.tsx`
- Create: `app/admin/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/articles-admin-view.test.mjs`

**Interfaces:**
- Consumes article-admin session and article CRUD APIs from Task 2.
- Produces `/admin/login` and `/admin`, with create/edit/delete article management.

- [ ] **Step 1: Write failing admin view tests**

```js
test("login redirects to the standalone admin page after a successful article login", async () => {
  const pushCalls = [];
  render(<AdminLogin requestLogin={async () => ({ authenticated: true })} push={(path) => pushCalls.push(path)} />);
  await userEvent.click(screen.getByRole("button", { name: "登录" }));
  assert.deepEqual(pushCalls, ["/admin"]);
});

test("article form sends a create payload and deletion asks for confirmation", async () => {
  const calls = [];
  const admin = createArticleAdmin({
    request: async (method, path, body) => { calls.push({ method, path, body }); return { ok: true, json: async () => ({ item: article }) }; },
    confirm: () => false,
  });
  await admin.save({ title: "标题", company: "公司", category: "公司分析", slug: "example-article", summary: "摘要", tags: ["中东"], body: "## 正文" });
  await admin.remove(article.id);
  assert.deepEqual(calls, [{ method: "POST", path: "/api/article-admin/articles", body: { title: "标题", company: "公司", category: "公司分析", slug: "example-article", summary: "摘要", tags: ["中东"], body: "## 正文" }]);
});
```

- [ ] **Step 2: Run the admin view test to verify it fails**

Run: `node --test tests/articles-admin-view.test.mjs`

Expected: FAIL because the admin components do not exist.

- [ ] **Step 3: Implement the standalone admin experience**

`/admin/login` checks the article session and redirects an already authenticated user to `/admin`; successful form login redirects to `/admin`. `/admin` redirects unauthenticated users to `/admin/login`, loads all articles, provides new/edit form fields exactly matching `ArticleDraft`, displays inline request errors, and uses `window.confirm` before deletion. Saving creates or patches then reloads the list; logout clears only the article session.

- [ ] **Step 4: Run admin view tests to verify they pass**

Run: `node --test tests/articles-admin-view.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the task**

```bash
git add src/articles/AdminLogin.tsx src/articles/ArticleAdmin.tsx app/admin/login/page.tsx app/admin/page.tsx app/globals.css tests/articles-admin-view.test.mjs
git commit -m "feat: add article admin pages"
```

### Task 5: Verify routes, production build and credentials documentation

**Files:**
- Modify: `README.md`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Documents required `ARTICLE_ADMIN_USERNAME` and `ARTICLE_ADMIN_PASSWORD_HASH` deployment configuration without storing actual credentials.

- [ ] **Step 1: Write failing route-presence and configuration documentation tests**

```js
test("keeps article admin credentials out of client source", async () => {
  const client = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(client, /ARTICLE_ADMIN_PASSWORD_HASH|xiaoluo_article_admin/);
});
```

- [ ] **Step 2: Run the test to verify it fails before documentation/route changes**

Run: `node --test tests/rendered-html.test.mjs`

Expected: FAIL until the test and production route files are present.

- [ ] **Step 3: Document configuration and run full verification**

Document the two required secret names, SHA-256 `username:password` hashing input, and both local/Cloudflare Pages variable setup locations. Do not include an actual username or password. Ensure initial D1 table creation is exercised by the API tests.

- [ ] **Step 4: Run all verification commands**

Run:

```bash
pnpm test
pnpm run lint
pnpm run build
```

Expected: all tests pass, lint reports zero errors, and Vinext build exits 0 with `/`, `/admin`, `/admin/login`, and `/analysis/[slug]` route output.

- [ ] **Step 5: Commit the task**

```bash
git add README.md tests/rendered-html.test.mjs
git commit -m "docs: explain article admin configuration"
```

## Plan Self-Review

- Spec coverage: Tasks 1–5 cover safe Markdown, isolated D1/session API, public list/detail navigation, independent admin UI, configuration, security checks, and production verification.
- Placeholder scan: no deferred implementation markers or unspecified validation steps remain.
- Type consistency: `ArticleSummary`, `Article`, `ArticleDraft`, `renderArticleMarkdown`, and `handleArticleApi` are named consistently across dependent tasks.
