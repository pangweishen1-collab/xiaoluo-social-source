"use client";

import { useEffect, useRef } from "react";
import type { MouseEvent } from "react";
import { enableDateStripDrag } from "./date-strip-drag.mjs";

const weekday = (date: string) => "日一二三四五六"[new Date(date + "T00:00:00Z").getUTCDay()];

export default function IssueCalendar({ selectedDate, issues, onSelectDate }: {
  selectedDate: string;
  issues: { date: string }[];
  onSelectDate?: (date: string) => void;
}) {
  const shownMonth = selectedDate.slice(0, 7);
  const scroller = useRef<HTMLDivElement>(null);
  const archive = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (scroller.current) return enableDateStripDrag(scroller.current);
  }, []);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && archive.current && !archive.current.contains(event.target)) archive.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  useEffect(() => {
    const viewport = scroller.current;
    const active = viewport?.querySelector<HTMLElement>('[aria-current="date"]');
    if (!viewport) return;
    const alignCurrentDate = () => viewport.scrollTo({ left: active ? Math.max(0, active.offsetLeft) : 0, behavior: "instant" });
    alignCurrentDate();
    const observer = new ResizeObserver(alignCurrentDate);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [shownMonth, selectedDate]);
  const [year, month] = shownMonth.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const issueDates = new Set(issues.map(issue => issue.date));
  issueDates.add(selectedDate);
  const availableDates = [...issueDates].filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort((a, b) => b.localeCompare(a));
  const months = [...new Set(availableDates.map(date => date.slice(0, 7)))];
  const selectDate = (event: MouseEvent<HTMLAnchorElement>, cellDate: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (archive.current) archive.current.open = false;
    if (onSelectDate) { event.preventDefault(); onSelectDate(cellDate); }
  };
  return <nav className="daily-date-strip" aria-label="日报日期">
    <div className="daily-date-days" ref={scroller} tabIndex={0} role="group" aria-label={`${shownMonth.replace("-", ".")} 日期，可左右滑动`}>
      {Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const cellDate = shownMonth + "-" + String(day).padStart(2, "0");
        const label = `${year} 年 ${month} 月 ${day} 日，周${weekday(cellDate)}`;
        const content = <><time dateTime={cellDate}>{month}.{String(day).padStart(2, "0")}</time><small>周{weekday(cellDate)}</small></>;
        return issueDates.has(cellDate)
          ? <a key={cellDate} href={`/daily/${cellDate}`} className={cellDate === selectedDate ? "selected" : undefined} aria-current={cellDate === selectedDate ? "date" : undefined} aria-label={`${label}，查看日报`} onClick={event => selectDate(event, cellDate)}>{content}</a>
          : <span key={cellDate} className="unpublished" aria-label={`${label}，无已发布日报`}>{content}</span>;
      })}
    </div>
    <details className="daily-date-all" ref={archive} onKeyDown={event => {
      if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
    }}>
      <summary><svg className="daily-date-calendar-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="4.5" width="14" height="13" rx="2" /><path d="M6.5 2.5v4M13.5 2.5v4M3 8.5h14M6.5 12h2M11.5 12h2" /></svg>查看全部日报<svg className="daily-date-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></summary>
      <div className="daily-date-archive" role="region" aria-label="全部已发布日报">
        <div className="daily-date-archive-heading"><strong>全部日报</strong><small>{availableDates.length} 期</small></div>
        <div className="daily-date-archive-list">{months.map(value => <section key={value}>
          <h3>{Number(value.slice(0, 4))} 年 {Number(value.slice(5))} 月</h3>
          <div>{availableDates.filter(date => date.startsWith(value + "-")).map(cellDate => <a key={cellDate} href={`/daily/${cellDate}`} aria-current={cellDate === selectedDate ? "date" : undefined} aria-label={`查看 ${cellDate} 日报`} onClick={event => selectDate(event, cellDate)}>
            <time dateTime={cellDate}>{Number(cellDate.slice(5, 7))}.{cellDate.slice(-2)}</time><small>周{weekday(cellDate)}</small>
          </a>)}</div>
        </section>)}</div>
      </div>
    </details>
  </nav>;
}
