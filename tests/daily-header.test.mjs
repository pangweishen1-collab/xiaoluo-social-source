import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('daily header is reduced to a date strip and an accessible document title', async () => {
  const source=await readFile(new URL('../app/daily-issue-reader.tsx',import.meta.url),'utf8');
  assert.match(source, /<h1 className="daily-issue-accessible-title">\{item.title\}<\/h1>/);
  assert.doesNotMatch(source, /daily-issue-masthead|daily-issue-stats|daily-issue-back|daily-issue-mobile-switch/);
  assert.match(source, /<IssueCalendar selectedDate=\{date\}/);
});

test('daily reader shares the public page width and heading scale', async () => {
  const css = await readFile(new URL('../app/daily-issue.css', import.meta.url), 'utf8');
  assert.match(css, /\.daily-date-strip \{[^}]*display: flex;[^}]*min-width: 0; max-width: 100%/);
  assert.match(css, /\.daily-issue-accessible-title \{[^}]*clip-path: inset\(50%\)/);
  assert.doesNotMatch(css, /\.daily-issue(?:-page|-embedded)? \.daily-issue-shell \{[^}]*\bwidth:/);
});

test('daily reader uses spacing instead of stacked divider lines', async () => {
  const source = await readFile(new URL('../app/daily-issue-reader.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../app/daily-issue.css', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /daily-issue-masthead-top|本期全文/);
  assert.match(css, /\.daily-issue-page \.daily-issue-legacy \.daily-report-body \{[^}]*margin-top: 0;[^}]*padding-top: 0;[^}]*border-top: 0;/);
  assert.doesNotMatch(css, /\.daily-issue-archive(?:-head|-month)? \{[^}]*border-(?:right|bottom):/);
});
