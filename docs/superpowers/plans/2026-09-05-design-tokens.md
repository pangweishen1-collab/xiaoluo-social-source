# Xiaoluo Site Design Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize the Xiaoluo site's recurring colors, spacing, and radii in one reusable token source while changing the green accent to an editorial blue without altering content, structure, or behavior.

**Architecture:** Create a root `tokens.css` as the single source of truth and load it before every existing stylesheet. Preserve the current stylesheet boundaries, map legacy `--home-*` and `--app-*` variables to semantic aliases, and migrate only recurring role-based values; circles, pills, and one-off optical corrections remain local.

**Tech Stack:** React 19, Vinext, CSS custom properties, Node test runner, Cloudflare Pages build.

**Spec:** `docs/superpowers/specs/2026-09-05-design-tokens.md`

## Global Constraints

- Preserve all existing copy, data, routes, API behavior, Cloudflare bindings, and admin behavior.
- Keep the current white-background editorial layout and replace the green action accent with the approved editorial blue.
- Do not add a dependency or merge/delete existing production stylesheets.
- Use exactly four shared spacing values: 8px, 16px, 24px, and 40px.
- Use 8px for controls and 12px for cards/dialogs; keep `50%` circles and `999px` pills as shape exceptions.
- Leave unique optical corrections local instead of creating one-use tokens.
- Verify locally; do not push or deploy without explicit production approval.

---

### Task 1: Establish the canonical token source

**Files:**
- Create: `tokens.css`
- Modify: `app/layout.tsx`
- Test: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: the values approved in `docs/superpowers/specs/2026-09-05-design-tokens.md`.
- Produces: CSS custom properties `--color-*`, `--space-*`, and `--radius-*`, available to every imported stylesheet.

- [ ] **Step 1: Write the failing token-source test**

Add a test that reads `tokens.css` and `app/layout.tsx`, then asserts the exact semantic names and that `../tokens.css` is imported before `./globals.css`:

```js
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
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test --test-name-pattern="site design tokens" tests/rendered-html.test.mjs
```

Expected: FAIL because `tokens.css` and its layout import do not exist.

- [ ] **Step 3: Create the canonical tokens and load them first**

Create `tokens.css` with the approved OKLCH colors and exact spacing/radius scale:

```css
/* Hallmark · pre-emit critique: P5 H4 E5 S5 R5 V4 */
:root {
  --color-brand: #25866c;
  --color-brand-strong: #17614f;
  --color-brand-soft: #e8f5ee;
  --color-text: oklch(25% 0.018 245);
  --color-muted: oklch(50% 0.018 245);
  --color-border: oklch(90% 0.012 245);
  --color-page: #ffffff;
  --color-surface: #ffffff;
  --color-surface-subtle: oklch(97% 0.008 245);
  --space-tight: 8px;
  --space-content: 16px;
  --space-component: 24px;
  --space-section: 40px;
  --radius-control: 8px;
  --radius-card: 12px;
  --font-sans: Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-size-display: 48px;
  --font-size-display-mobile: 38px;
  --font-size-section: 36px;
  --font-size-section-mobile: 30px;
  --font-size-card: 24px;
  --font-size-card-mobile: 21px;
  --font-size-article-title: 40px;
  --font-size-article-title-mobile: 34px;
  --line-height-display: 1.12;
  --line-height-section: 1.2;
  --line-height-card: 1.35;
  --line-height-article-title: 1.22;
  --motion-duration: .2s;
  --motion-lift: translateY(-3px);
  --shadow-card-hover: 0 12px 26px color-mix(in oklch, var(--color-brand-strong) 8%, transparent);
}
```

Insert `import "../tokens.css";` as the first stylesheet import in `app/layout.tsx`.

- [ ] **Step 4: Run the token-source test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit the token source**

```bash
git add tokens.css app/layout.tsx tests/rendered-html.test.mjs
git commit -m "feat: add shared site design tokens"
```

### Task 2: Redirect legacy palettes to the canonical colors

**Files:**
- Modify: `app/home-light.css`
- Modify: `app/app-light.css`
- Modify: `app/color-reset.css`
- Test: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: the `--color-*` properties created in Task 1.
- Produces: compatibility aliases for existing selectors without maintaining duplicate literal values.

- [ ] **Step 1: Write the failing compatibility test**

Read the three files and assert that legacy variables delegate to the canonical source:

```js
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
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test --test-name-pattern="legacy page palettes" tests/rendered-html.test.mjs
```

Expected: FAIL because the legacy roots still contain literal hex values.

- [ ] **Step 3: Replace duplicate root values with aliases**

Use this mapping in both `--home-*` and `--app-*` roots:

```css
--*-ink: var(--color-text);
--*-muted: var(--color-muted);
--*-line: var(--color-border);
--*-soft: var(--color-surface-subtle);
--*-mint: var(--color-brand-soft);
--*-jade: var(--color-brand);
--*-jade-dark: var(--color-brand-strong);
```

Change the `color-reset.css` root to `--ink: var(--color-text); --paper: var(--color-surface);`.

- [ ] **Step 4: Run the compatibility test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit the compatibility layer**

```bash
git add app/home-light.css app/app-light.css app/color-reset.css tests/rendered-html.test.mjs
git commit -m "refactor: connect page palettes to shared tokens"
```

### Task 3: Migrate recurring active colors

**Files:**
- Modify: `app/globals.css`
- Modify: `app/business-overrides.css`
- Modify: `app/home-light.css`
- Modify: `app/app-light.css`
- Modify: `app/color-reset.css`
- Modify: `app/analysis-list.css`
- Modify: `app/practical-tools.css`
- Modify: `app/matrix-title.css`
- Modify: `app/talent-detail.css`
- Test: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: canonical color tokens and compatibility aliases.
- Produces: one semantic blue action language across public and admin surfaces.

- [ ] **Step 1: Write the failing active-color test**

Add a test that concatenates all production stylesheets and checks that the retired green values no longer appear as literals:

```js
test("active styles no longer hard-code the retired green palette", async () => {
  const files = ["globals.css", "business-overrides.css", "home-light.css", "app-light.css", "color-reset.css", "analysis-list.css", "practical-tools.css", "matrix-title.css", "talent-detail.css"];
  const css = (await Promise.all(files.map((file) => readFile(new URL(`../app/${file}`, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(css, /#25866c|#17614f|#e8f5ee/i);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test --test-name-pattern="retired green palette" tests/rendered-html.test.mjs
```

Expected: FAIL on existing green literals.

- [ ] **Step 3: Replace recurring role-based colors**

Apply these replacements where the values carry the matching semantic role:

```text
#25866c -> var(--color-brand)
#17614f -> var(--color-brand-strong)
#e8f5ee -> var(--color-brand-soft)
#182522 -> var(--color-text)
#62706b -> var(--color-muted)
#dce5e0 -> var(--color-border)
#ffffff / #fff -> var(--color-surface) only for page, card, input, and dialog surfaces
#f5f8f6 -> var(--color-surface-subtle)
```

Do not replace literal white used as foreground text on a colored button unless it is a true surface role. Do not introduce gradient tokens.

- [ ] **Step 4: Run the active-color test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit the color migration**

```bash
git add app/*.css tests/rendered-html.test.mjs
git commit -m "refactor: migrate site colors to semantic tokens"
```

### Task 4: Normalize shared spacing and radii

**Files:**
- Modify: `app/globals.css`
- Modify: `app/business-overrides.css`
- Modify: `app/home-light.css`
- Modify: `app/app-light.css`
- Modify: `app/color-reset.css`
- Modify: `app/analysis-list.css`
- Modify: `app/practical-tools.css`
- Modify: `app/talent-detail.css`
- Test: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: `--space-*`, `--radius-control`, and `--radius-card` from Task 1.
- Produces: consistent component and section rhythm without tokenizing one-off optical corrections.

- [ ] **Step 1: Write the failing spacing/radius test**

Assert representative cross-page consumers instead of every declaration:

```js
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
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test --test-name-pattern="semantic spacing and radius" tests/rendered-html.test.mjs
```

Expected: FAIL because representative selectors still use pixel literals.

- [ ] **Step 3: Apply semantic spacing by responsibility**

Use:

```text
--space-tight for icon/text and compact tag gaps
--space-content for heading/body/action relationships
--space-component for card padding and sibling components
--space-section for major section and article-card gaps
```

Keep values such as `6px`, `14px`, `18px`, `30px`, and responsive optical corrections local when changing them would alter the approved layout.

- [ ] **Step 4: Apply the two radius roles**

Use `--radius-control` on buttons, fields, compact filters, and small controls. Use `--radius-card` on cards, dialogs, and large containers. Preserve `0`, `50%`, and `999px` where they explicitly create square, circular, or pill shapes.

- [ ] **Step 5: Run the spacing/radius test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 6: Commit the spacing and radius migration**

```bash
git add app/*.css tests/rendered-html.test.mjs
git commit -m "refactor: standardize spacing and corner radii"
```

### Task 5: Verify the full site locally

**Files:**
- Verify: `tokens.css`
- Verify: `app/*.css`
- Verify: `app/page.tsx`
- Verify: `app/analysis/[slug]/reader.tsx`
- Verify: `app/admin/page.tsx`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: evidence that the token migration preserved behavior and responsive layout.

- [ ] **Step 1: Run the complete automated verification**

```bash
pnpm test
pnpm lint
```

Expected: all tests pass, build exits 0, lint exits 0.

- [ ] **Step 2: Check token integrity**

```bash
rg -n '#25866c|#17614f|#e8f5ee' app tokens.css
rg -n -- '--color-|--space-|--radius-' tokens.css app
```

Expected: retired green literals return no matches; semantic token usage is present across public and admin styles.

- [ ] **Step 3: Inspect core routes at desktop width**

Open and verify:

```text
/?view=home
/?view=analysis
/?view=matrix
/?view=talent
/?view=business
/admin
/analysis/article-693f6012
```

For each route, verify white surfaces, editorial-blue interactive emphasis, readable text hierarchy, consistent control/card corners, and no missing content.

- [ ] **Step 4: Inspect responsive widths**

At 320px, 375px, 414px, and 768px, verify no horizontal scrolling, no wrapped primary navigation/action labels, cards remain within the viewport, headings wrap safely, and the community QR dialog remains fully usable.

- [ ] **Step 5: Run a visual-restraint review**

Confirm there are no gradients, decorative blue blocks without meaning, newly introduced shadows, color-only state signals, or inconsistent green remnants. Record any deliberate one-off values that remain and their local purpose.

- [ ] **Step 6: Present the local preview for approval**

Keep the local preview open at `http://localhost:3001/?view=analysis`. Report automated results and responsive findings. Do not push to GitHub or deploy to Cloudflare until the user explicitly says to publish.
