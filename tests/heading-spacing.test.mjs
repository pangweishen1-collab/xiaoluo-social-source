import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public section headings share one responsive content gap", async () => {
  const [tokens, layout, spacing, daily] = await Promise.all([
    readFile(new URL("../tokens.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/heading-spacing.css", import.meta.url), "utf8"),
    readFile(new URL("../app/home-daily.css", import.meta.url), "utf8"),
  ]);

  assert.match(tokens, /--space-heading-content:\s*28px/);
  assert.match(tokens, /--space-heading-intro:\s*14px/);
  assert.match(layout, /import "\.\/heading-spacing\.css";/);
  for (const selector of [
    ".home-theme.research-home .section-top",
    ".collab-page .collab-section-head",
    ".matrix-explorer .atlas-directory-header",
    ".resource-provider-heading",
    ".hot-hero",
  ]) assert.ok(spacing.includes(selector), `${selector} should use the shared gap`);
  assert.match(spacing, /\.section-top:has\(\+ \.section-intro\)\s*\{\s*margin-bottom:\s*0/);
  assert.match(spacing, /\.section-intro\s*\{[^}]*margin-bottom:\s*var\(--space-heading-content\)/);
  assert.match(spacing, /\.collab-section-head\s*\{\s*gap:\s*var\(--space-heading-intro\)/);
  assert.match(spacing, /\.hot-method h2\s*\{\s*margin-bottom:\s*var\(--space-heading-intro\)/);
  assert.match(spacing, /@media \(max-width: 720px\)[\s\S]*--space-heading-content:\s*20px/);
  assert.match(daily, /\.home-daily-layout\s*\{[^}]*margin-top:\s*0/);
});
