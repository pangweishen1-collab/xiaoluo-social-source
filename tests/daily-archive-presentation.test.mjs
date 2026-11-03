import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const tab = read("../app/daily-reports.tsx");
const reader = read("../app/daily-issue-reader.tsx");
const calendar = read("../app/daily-issue-calendar.tsx");
const route = read("../app/daily/[date]/page.tsx");
const issueStyles = read("../app/daily-issue.css");

test("daily tab opens the latest full issue while each date retains a shareable page", () => {
  assert.match(tab, /<DailyIssueReader key=\{readerVersion\} embedded \/>/);
  assert.match(reader, /if \(available\[0\]\) setDate\(available\[0\]\.date\)/);
  assert.match(reader, /const selectDate = embedded \?/);
  assert.match(route, /generateStaticParams\(\)/);
  assert.match(tab, /window\.location\.replace\(`\/daily\/\$\{date\}`\)/);
});

test("issue reader removes the archive rail but retains calendar, lead, sections, and legacy full text", () => {
  assert.doesNotMatch(reader, /IssueArchive|daily-issue-archive|DAILY ARCHIVE|往期日报/);
  assert.match(reader, /from "\.\/daily-issue-calendar"/);
  assert.match(calendar, /aria-label="日报日期"/);
  assert.doesNotMatch(reader, /daily-issue-mobile-switch/);
  assert.match(reader, /daily-edition-lead/);
  assert.match(reader, /daily-edition-contents/);
  assert.match(reader, /renderMarkdown\(formatDailyMarkdown\(item\.body\)\)/);
  assert.match(issueStyles, /@media \(max-width: 720px\)/);
  assert.doesNotMatch(issueStyles, /daily-issue-archive/);
});

test("the article takes the full page column and dates remain accessible without an archive rail", () => {
  assert.match(calendar, /aria-current=\{cellDate === selectedDate \? "date" : undefined\}/);
  assert.match(issueStyles, /\.daily-issue-layout \{ display: block; min-width: 0; \}/);
  assert.doesNotMatch(issueStyles, /\.daily-issue-layout \{[^}]*grid-template-columns/);
  assert.match(reader, /<IssueCalendar selectedDate=\{date\} issues=\{archiveIssues\} onSelectDate=\{selectDate\}/);
  assert.match(calendar, /const issueDates = new Set\(issues\.map/);
  assert.match(calendar, /onSelectDate\(cellDate\)/);
  assert.match(reader, /aria-label="日报翻页"/);
  assert.match(reader, /selectDate\(older\.date\)/);
  assert.match(reader, /selectDate\(newer\.date\)/);
});

test("management retains publishing and editing entry points", () => {
  assert.match(tab, /发布日报/);
  assert.match(tab, /<DailyEditor onClose=/);
  assert.match(reader, /编辑本期/);
  assert.match(reader, /<DailyEditor initial=\{item\}/);
});
