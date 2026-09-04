# Xiaoluo Source-managed Cloudflare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the supplied Xiaoluo site as a maintainable source project that can be safely connected to its existing Cloudflare resources.

**Architecture:** Retain the vinext application, Worker API, D1 `DB`, and R2 `MEDIA` contracts. Add only a token layer and deployment/source-control metadata; the public views and API payloads stay behaviorally identical.

**Tech Stack:** React 19, vinext/Vite, Cloudflare Workers/Pages, D1, R2, TypeScript, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-04-source-managed-cloudflare-design.md`

## Global Constraints

- Do not delete or overwrite Cloudflare D1/R2 data.
- Do not change an administrator password or secret.
- Do not publish production without an explicit final confirmation.
- Preserve all existing public route labels, six note records, and API route contracts.

---

### Task 1: Establish source safety and reproducible local build

**Files:**
- Create: `.gitignore`
- Modify: `README.md`
- Test: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: existing `npm run build` and `node --test` scripts.
- Produces: documented local setup and a test asserting the full public navigation and note inventory.

- [ ] **Step 1: Write a failing route-content test**

```js
assert.match(html, /资讯与我[\s\S]*公司分析[\s\S]*出海矩阵[\s\S]*人才市场[\s\S]*商务合作/);
assert.match(html, /UGC贵族体系也能“玩”？这是我没想到的！/);
```

- [ ] **Step 2: Run the test and confirm the current harness exposes the rendered page**

Run: `npm test`

Expected: the newly asserted source contract is either already visible or the test identifies a real SSR limitation to resolve before source changes.

- [ ] **Step 3: Add Git and local-environment exclusions**

```gitignore
node_modules/
dist/
.wrangler/
.env
.env.*
!.env.example
```

- [ ] **Step 4: Document the exact local build and Cloudflare resource assumptions**

Document that `DB` and `MEDIA` are existing logical bindings and that credentials are not committed.

- [ ] **Step 5: Run build and rendered-page tests**

Run: `npm test`

Expected: exit code 0.

### Task 2: Extract a non-behavioral UI token layer

**Files:**
- Create: `tokens.css`
- Modify: `app/globals.css`
- Test: `tests/tokens.test.mjs`

**Interfaces:**
- Consumes: current CSS selectors and current rendered markup.
- Produces: CSS custom properties for paper, ink, green accent, spacing, typography, radii, and responsive thresholds.

- [ ] **Step 1: Write a failing token test**

```js
assert.match(css, /--color-paper:/);
assert.match(css, /--color-accent:/);
assert.match(css, /--space-md:/);
```

- [ ] **Step 2: Run the token test and confirm it fails because `tokens.css` does not exist**

Run: `node --test tests/tokens.test.mjs`

Expected: fail with a missing-file error.

- [ ] **Step 3: Add token definitions and import them before component rules**

```css
:root { --color-paper: #fff; --color-accent: #25866c; --space-md: 1rem; }
```

- [ ] **Step 4: Replace only duplicate visual literals in `app/globals.css`**

Preserve selector names and layout behavior; do not alter markup or route content.

- [ ] **Step 5: Run all tests and build**

Run: `npm test && npm run lint`

Expected: exit code 0 with no lint errors.

### Task 3: Prepare Cloudflare connection without changing production

**Files:**
- Create: `.env.example`
- Modify: `README.md`
- Modify: `.openai/hosting.json` only after the existing Cloudflare project ID is verified.

**Interfaces:**
- Consumes: existing logical bindings `{ "d1": "DB", "r2": "MEDIA" }`.
- Produces: a project that is ready for authenticated preview deployment without embedding secrets.

- [ ] **Step 1: Add non-secret environment documentation**

```dotenv
# Cloudflare secrets are configured in the dashboard and never committed.
ARTICLE_ADMIN_USERNAME=
ARTICLE_ADMIN_PASSWORD_HASH=
```

- [ ] **Step 2: Verify the existing Cloudflare project and binding names through authenticated read-only inspection**

Expected: project name, `DB`, and `MEDIA` match the supplied source; otherwise stop before deployment.

- [ ] **Step 3: Initialize Git and commit the verified source state**

Run: `git init -b main && git add . && git commit -m "chore: establish Xiaoluo source baseline"`

Expected: a reproducible local source baseline; do not add a remote without the user-supplied repository destination.

- [ ] **Step 4: Produce a Cloudflare preview deployment only after credentials and project verification exist**

Expected: preview URL uses the verified bindings and no production domain is changed.

- [ ] **Step 5: Request final confirmation before replacing production**

Expected: no production deployment happens in this task.
