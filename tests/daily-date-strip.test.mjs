import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const bundle = await build({entryPoints:[new URL('../app/daily-issue-calendar.tsx',import.meta.url).pathname],bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime']});
const mod={exports:{}};
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
const render = props => renderToStaticMarkup(createElement(mod.exports.default,props));
const source=readFileSync(new URL('../app/daily-issue-calendar.tsx',import.meta.url),'utf8');

test('single-row calendar preserves actual published links, selected date and unavailable days',()=>{
  const html=render({selectedDate:'2026-10-22',issues:[{date:'2026-10-20'},{date:'2026-10-21'}]});
  assert.match(html,/aria-label="日报日期"/);
  assert.match(html,/2026\.10/);
  assert.equal((html.match(/href="\/daily\//g)||[]).length,6, 'three visible-row links and three archive links');
  assert.match(html,/href="\/daily\/2026-10-22" class="selected" aria-current="date"/);
  assert.match(html,/2026 年 10 月 22 日，周四，查看日报/);
  assert.match(html,/class="unpublished" aria-label="2026 年 10 月 23 日，周五，无已发布日报"/);
  assert.doesNotMatch(html,/href="\/daily\/2026-10-23"|本期日报|<select/);
  assert.match(html,/tabindex="0" role="group"/);
  assert.doesNotMatch(html,/上个月|下个月|daily-date-month/);
  assert.match(html,/<time dateTime="2026-10-22">10\.22<\/time>/);
  assert.match(html,/查看全部日报/);
  assert.match(html,/<details class="daily-date-all"/);
  assert.match(html,/class="daily-date-chevron" viewBox="0 0 16 16"/);
  assert.doesNotMatch(html,/⌄/);
});

test('date strip uses true calendar lengths and UTC weekdays across leap years',()=>{
  const leap=render({selectedDate:'2024-02-29',issues:[]});
  assert.match(leap,/2024 年 2 月 29 日，周四/);
  assert.doesNotMatch(leap,/2 月 30 日/);
  const ordinary=render({selectedDate:'2026-02-28',issues:[]});
  assert.doesNotMatch(ordinary,/2 月 29 日/);
  assert.match(source,/Date\.UTC\(year, month, 0\)/);
});

test('strip scrolls only its date viewport and supports embedded switching with modified-link behavior',()=>{
  assert.match(source,/viewport\.scrollTo\(\{ left: active \? Math.max\(0, active.offsetLeft\) : 0/);
  assert.match(source,/active\.offsetLeft/);
  assert.doesNotMatch(source,/scrollIntoView|window\.scroll/);
  assert.match(source,/\[shownMonth, selectedDate\]/);
  assert.match(source,/event.metaKey \|\| event.ctrlKey \|\| event.shiftKey \|\| event.altKey/);
  assert.match(source,/onSelectDate\(cellDate\)/);
  const css=readFileSync(new URL('../app/daily-issue.css',import.meta.url),'utf8');
  assert.match(css,/\.daily-date-days \{[^}]*display: flex;[^}]*min-width: 0; overflow-x: auto; overscroll-behavior-x: contain/);
  assert.match(css,/\.daily-date-days > :is\(a, span\) \{[^}]*flex: 0 0 auto/);
  assert.match(css,/\.daily-date-days a.selected \{ position: relative; background: transparent/);
  assert.match(css,/\.daily-date-days a.selected::after \{[^}]*height: 1px; background: #b7ccc0; opacity: \.75/);
  assert.match(css,/scrollbar-width: none/);
  assert.match(source,/return enableDateStripDrag\(scroller.current\)/);
  assert.match(css,/\.daily-date-days \{ cursor: grab; user-select: none/);
  assert.match(css,/\.daily-date-all\[open\] > summary \.daily-date-chevron \{ transform: rotate\(180deg\)/);
  assert.doesNotMatch(css,/\.daily-date-all > summary svg \{ display: none/);
});

test('current date starts at the left even at month end and resizing realigns without scrolling the page',()=>{
  assert.doesNotMatch(source,/active.offsetLeft -|viewport.clientWidth - active.offsetWidth/);
  assert.match(source,/new ResizeObserver\(alignCurrentDate\)/);
  assert.match(source,/observer.disconnect\(\)/);
  const css=readFileSync(new URL('../app/daily-issue.css',import.meta.url),'utf8');
  assert.match(css,/\.daily-date-days::after \{ content: ""; flex: 0 0 max\(0px, calc\(100% - 86px\)\)/);
  assert.match(css,/\.daily-date-days::after \{ flex-basis: max\(0px, calc\(100% - 80px\)\)/);
});

test('all reports are grouped by month without invented dates or titles and support dismissal',()=>{
  const html=render({selectedDate:'2026-10-22',issues:[{date:'2026-09-16',title:'not displayed'},{date:'2025-12-01'},{date:'2026-09-16'},{date:'invalid'}]});
  assert.match(html,/2026 年 9 月/);
  assert.match(html,/2025 年 12 月/);
  assert.match(html,/aria-label="查看 2026-09-16 日报"/);
  assert.match(html,/3 期/);
  assert.doesNotMatch(html,/not displayed|\/daily\/invalid/);
  assert.match(source,/event.key === "Escape"/);
  assert.match(source,/querySelector\("summary"\)\?\.focus\(\)/);
  assert.match(source,/document.addEventListener\("pointerdown", dismiss\)/);
  assert.match(source,/document.removeEventListener\("pointerdown", dismiss\)/);
  const css=readFileSync(new URL('../app/daily-issue.css',import.meta.url),'utf8');
  assert.match(css,/\.daily-date-all \{ position: static; flex: 0 0 auto/);
  assert.match(css,/\.daily-date-archive \{[^}]*right: 0; width: 320px; max-width: 100%/);
});
