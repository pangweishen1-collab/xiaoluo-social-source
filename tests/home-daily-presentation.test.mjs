import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const source = read("../app/home-daily.tsx");
const styles = read("../app/home-daily.css");
const reader = read("../app/daily-issue-reader.tsx");
const page = read("../app/page.tsx");
const hotPreview = read("../app/home-hot-preview.tsx");
const hotWatch = read("../app/hot-feed-watch.ts");

test("homepage news keeps Beijing labels for the latest daily and replaces the old timeline with hot rankings", () => {
  assert.match(source, /Date\.now\(\) \+ 8 \* 3600000/);
  assert.match(source, /- 86400000\)/);
  assert.match(source, /"今日已发布".*"昨日已发布".*"最近一期已发布"/);
  assert.match(source, /<h2 id="home-daily-title">小骆资讯<\/h2>/);
  assert.match(source, /<HomeHotPreview \/>/);
  assert.doesNotMatch(source, /今天与昨天|等待今日更新|昨日未发布|home-daily-timeline/);
  assert.doesNotMatch(source, /status === "ready" && <div className="home-daily-layout"/, "hot rankings must remain available when the daily API fails");
});

test("homepage uses compact archive index and direct issue links, not a reading modal", () => {
  assert.match(source, /loadPublicData\("\/api\/daily-reports\?index=1"/);
  assert.match(source, /const featured = items\[0\]/);
  assert.match(source, /featured \? <a className="home-daily-feature" href=\{`\/daily\/\$\{featured\.date\}`\}/);
  assert.match(source, /className="home-daily-view-all" href="\/\?view=daily"/);
  assert.doesNotMatch(source, /HomeDailyDialog|setDialogDate/);
  assert.match(reader, /from "\.\/daily-issue-calendar"/);
  assert.doesNotMatch(reader, /daily-issue-archive/);
  assert.match(reader, /<IssueCalendar/);
});

test("structured latest issue previews its chosen lead, while legacy reports preview Markdown", () => {
  assert.match(source, /const featuredEdition = .*prepareDailyEdition\(featuredDetail\.edition\)/);
  assert.doesNotMatch(source, /featuredDetail\?\.date === featured\?\.date/, "empty SSR state must not compare two undefined dates as a match");
  assert.match(source, /featured\?\.leadTitle && featured\.leadTitle !== featured\.title/);
  assert.match(source, /featuredEdition\.lead\.title/);
  assert.match(source, /reportPreview\(featuredDetail\.body\)/);
});

test("management mode retains publish and edit, loading full detail before editing", () => {
  assert.match(page, /<HomeDaily admin=\{admin\} \/>/);
  assert.match(source, /\{admin && <>\s*<button className="home-daily-admin-publish"/);
  assert.match(source, /\{featured && <button className="home-daily-admin-edit"/);
  assert.match(source, /fetch\(`\/api\/daily-reports\/\$\{report\.date\}`/);
  assert.match(source, /setEditor\(data\.item\)/);
  assert.match(source, /\{admin && editor && <DailyEditor/);
  assert.match(source, /invalidatePublicData\("\/api\/daily-reports\?index=1"\)/);
});

test("daily and top-three cards remain responsive and keyboard accessible", () => {
  assert.match(source, /className="home-daily-layout"/);
  assert.match(hotPreview, /className="home-hot-preview"/);
  assert.match(styles, /\.home-daily-layout \{[\s\S]*?grid-template-columns: minmax\(0, 1\.38fr\) minmax\(310px, \.82fr\)/);
  assert.match(styles, /@media \(max-width: 900px\) \{[\s\S]*?\.home-daily-layout \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /a\.home-daily-feature:focus-visible/);
  assert.match(styles, /\.home-hot-preview :is\(a, button\):focus-visible/);
  assert.match(styles, /\.home-hot-list > li \{[^}]*minmax\(0, 1fr\)/);
  assert.match(styles, /\.home-hot-title \{[^}]*overflow-wrap: anywhere/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("homepage preview reuses the published hot feed cache with independent failure and empty states", () => {
  assert.match(hotPreview, /loadHotList, readCachedHotList, type HotFeed/);
  assert.match(hotPreview, /useState<HotFeed \| null>\(null\)/, "SSR and hydration start with identical loading markup even when a browser cache exists");
  assert.match(hotPreview, /return watchHotFeed\(/);
  assert.match(hotPreview, /load: loadHotList/);
  assert.match(hotPreview, /read: readCachedHotList/);
  assert.match(hotWatch, /clock\.clearInterval\(timer\)/);
  assert.match(hotWatch, /HOT_FEED_CHECK_MS = 60 \* 1000/);
  assert.match(hotPreview, /热点榜暂时无法加载/);
  assert.match(hotPreview, /暂无已发布热点/);
  assert.match(hotPreview, /正在加载热点/);
  assert.match(hotPreview, /沿用已发布榜单/);
  assert.doesNotMatch(hotPreview, /fetch\(|\/refresh|\.run\(/);
});

test("homepage trophies use restrained metallic palettes, a tinted background and smaller mobile badges", () => {
  assert.match(styles, /\.home-hot-preview \{[^}]*background: radial-gradient\([\s\S]*?linear-gradient\(145deg, #fffdf7, #f6f9f3\)/);
  for (const metal of ["gold", "silver", "bronze"]) assert.match(styles, new RegExp(`\\.home-hot-rank\\.is-${metal} \\{ --trophy-light:`));
  assert.match(styles, /\.home-hot-trophy-number \{ fill: var\(--trophy-ink\)/);
  assert.match(styles, /@media \(max-width: 640px\) \{[\s\S]*?\.home-hot-rank \{ width: 42px; height: 42px/);
});

test("featured hover remains visible after entrance animation", () => {
  assert.match(styles, /\.home-daily-feature \{ animation: home-daily-rise \.55s backwards; \}/);
  assert.match(styles, /a\.home-daily-feature:hover \{ transform: translateY\(-7px\); border-color: #79b18a; box-shadow:/);
  assert.match(styles, /a\.home-daily-feature:hover::after \{ opacity: 1; transform: translate\(0, 0\) scale\(1\); \}/);
  assert.match(styles, /a\.home-daily-feature:hover \.home-daily-feature-read::after \{ transform: scaleX\(1\); \}/);
});
