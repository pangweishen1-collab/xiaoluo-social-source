"use client";

import { useEffect, useState } from "react";
import GlobalSearch from "./global-search";
import SiteFooter from "./site-footer";
import DailyEditor from "./daily-editor";
import { formatDailyMarkdown, renderMarkdown } from "./daily-markdown";
import { prepareDailyEdition } from "./daily-edition.mjs";
import { prepareDailyNewspaper, splitDailyHeadlineIntro } from "./daily-newspaper.mjs";
import DailyNewspaper, { type Newspaper } from "./daily-newspaper";
import IssueCalendar from "./daily-issue-calendar";
import { invalidatePublicData } from "./public-data-cache.mjs";
import "./daily-issue.css";

type DailyItem = { id: string; title: string; summary: string; eventDate: string; sourceUrls: string[]; sectionLabel: string };
type DailySection = { key: string; label: string; originalCount: number; items: DailyItem[] };
type PreparedEdition = { lead: DailyItem; highlights: DailyItem[]; sections: DailySection[]; total: number };
type DailyReport = { date: string; title: string; body: string; edition?: unknown };
type DailyIndexItem = { date: string; title: string; leadTitle?: string };

const issueHref = (date: string) => `/daily/${encodeURIComponent(date)}`;
const readableDate = (date: string) => date.replaceAll("-", ".");

function IssueSourceLinks({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  return <div className="daily-issue-sources" aria-label="原文链接">
    <span>原文</span>
    {urls.map((url, index) => <a href={url} target="_blank" rel="noopener noreferrer" key={url} aria-label={`查看原文 ${index + 1}（新窗口打开）`}>来源 {index + 1} ↗</a>)}
  </div>;
}

function EditionItem({ item, featured = false }: { item: DailyItem; featured?: boolean }) {
  return <div className={featured ? "daily-edition-lead-content" : "daily-edition-item-content"}>
    <div className="daily-edition-item-meta"><span>{item.sectionLabel}</span>{item.eventDate && <time dateTime={item.eventDate}>{readableDate(item.eventDate)}</time>}</div>
    {featured ? <h2>{item.title}</h2> : <h3>{item.title}</h3>}
    {item.summary && <p>{item.summary}</p>}
    <IssueSourceLinks urls={item.sourceUrls} />
  </div>;
}

function EditionContent({ edition }: { edition: PreparedEdition }) {
  return <div className="daily-edition-body">
    <div className="daily-edition-main">
      <section className="daily-edition-lead" aria-labelledby="daily-issue-lead-heading">
        <div className="daily-lead-kicker" id="daily-issue-lead-heading"><span>头条</span><small aria-hidden="true">TOP STORY</small></div>
        <EditionItem item={edition.lead} featured />
      </section>
      {edition.sections.map((section, index) => <section id={"daily-section-" + section.key} className="daily-edition-section" aria-labelledby={"daily-section-heading-" + section.key} key={section.key}>
        <header><span>{String(index + 1).padStart(2, "0")}</span><h2 id={"daily-section-heading-" + section.key}>{section.label}</h2><small>{section.items.length} 条</small></header>
        {section.items.length ? <div className="daily-edition-section-list">{section.items.map((item) => <article key={item.id}><EditionItem item={item} /></article>)}</div> : <p className="daily-edition-empty">{section.originalCount ? "本栏内容已在头条或今日看点展示。" : "本期该栏暂无已核实内容。"}</p>}
      </section>)}
    </div>
    <aside className="daily-edition-rail" aria-label="本期阅读导览">
      {edition.highlights.length > 0 && <section className="daily-edition-highlights" aria-labelledby="daily-issue-highlights-heading">
        <div className="daily-edition-section-kicker" id="daily-issue-highlights-heading"><span aria-hidden="true" /> 今日看点</div>
        <div className="daily-edition-highlight-list">{edition.highlights.map((item, index) => <article key={item.id} className="daily-edition-highlight"><span className="daily-edition-highlight-number">{String(index + 1).padStart(2, "0")}</span><EditionItem item={item} /></article>)}</div>
      </section>}
      <nav className="daily-edition-contents" aria-label="本期栏目目录">
        <div className="daily-edition-section-kicker"><span aria-hidden="true" /> 本期版面</div>
        {edition.sections.map((section, index) => <a key={section.key} href={"#daily-section-" + section.key}><span>{String(index + 1).padStart(2, "0")}</span>{section.label}<small>{section.originalCount} 条</small></a>)}
      </nav>
    </aside>
  </div>;
}

function IssueNavigation() {
  return <><div className="article-nav-bar"><header className="nav shell article-site-nav site-navigation daily-issue-site-nav">
    <div className="brand"><a className="avatar-login" href="/" aria-label="回到首页"><img src="/optimized/xiaohongshu-avatar.webp" alt="小骆" /></a><span className="site-brand-name">小骆出海观察</span></div>
    <nav aria-label="主导航"><a href="/">首页</a><a className="active" href="/?view=daily" aria-current="page">小骆资讯</a><a href="/?view=analysis">公司分析</a><a href="/?view=matrix">出海矩阵</a><a href="/?view=talent">资源市场</a></nav>
    <GlobalSearch />
  </header></div><div className="news-tabs-wrap"><nav className="news-tabs shell" aria-label="小骆资讯栏目"><a className="active" href="/?view=daily" aria-current="page">小骆日报</a><a href="/?view=hot">热点榜</a></nav></div></>;
}

export default function DailyIssueReader({ embedded = false }: { embedded?: boolean }) {
  const [date, setDate] = useState("");
  const [item, setItem] = useState<DailyReport | null>(null);
  const [issues, setIssues] = useState<DailyIndexItem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [admin, setAdmin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (embedded) {
      fetch("/api/daily-reports?index=1", { credentials: "same-origin", cache: "no-store" })
        .then(async (response) => response.ok ? response.json() as Promise<{ items?: DailyIndexItem[] }> : null)
        .then((data) => {
          const available = Array.isArray(data?.items) ? data.items.filter((issue) => /^\d{4}-\d{2}-\d{2}$/.test(issue.date)).sort((a, b) => b.date.localeCompare(a.date)) : [];
          setIssues(available);
          if (available[0]) setDate(available[0].date);
          else setState("missing");
        }).catch(() => setState("error"));
      return;
    }
    let pathDate = "";
    try { pathDate = decodeURIComponent(window.location.pathname.split("/").filter(Boolean).at(-1) || ""); } catch { pathDate = ""; }
    setDate(pathDate);
  }, [embedded]);
  useEffect(() => {
    fetch("/api/admin/session", { credentials: "same-origin", cache: "no-store" })
      .then((response) => response.ok ? response.json() : { authenticated: false })
      .then((data) => setAdmin(Boolean(data.authenticated))).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!date) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setState("missing"); return; }
    const controller = new AbortController();
    setState("loading");
    fetch(`/api/daily-reports/${date}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) { setState("missing"); return; }
        if (!response.ok) throw new Error("日报读取失败");
        const data = await response.json() as { item?: DailyReport };
        if (!data.item || data.item.date !== date) throw new Error("日报数据无效");
        setItem(data.item); setState("ready");
      }).catch((error) => { if (error.name !== "AbortError") setState("error"); });
    fetch("/api/daily-reports?index=1", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ items?: DailyIndexItem[] }> : null)
      .then((data) => { if (Array.isArray(data?.items)) setIssues(data.items.filter((issue) => /^\d{4}-\d{2}-\d{2}$/.test(issue.date)).sort((a, b) => b.date.localeCompare(a.date))); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [date, reload]);

  const edition = item ? prepareDailyEdition(item.edition) as PreparedEdition | null : null;
  const paper = item && !edition ? prepareDailyNewspaper(item.body) as Newspaper : null;
  const archiveIssues = issues.length ? issues : item ? [{ date, title: item.title }] : [];
  const currentIndex = issues.findIndex((issue) => issue.date === date);
  const newer = currentIndex > 0 ? issues[currentIndex - 1] : null;
  const older = currentIndex >= 0 ? issues[currentIndex + 1] || null : null;
  const selectDate = embedded ? (selectedDate: string) => { setDate(selectedDate); } : undefined;
  const RootTag: "main" | "div" = embedded ? "div" : "main";
  return <RootTag className={"daily-issue-page" + (embedded ? " daily-issue-embedded" : "")}>
    {!embedded && <IssueNavigation />}
    <div className="shell daily-issue-shell">
      {state === "loading" && <div className="daily-issue-loading" role="status">正在读取这期日报…</div>}
      {state === "missing" && <div className="daily-issue-empty-state"><h1>{embedded ? "暂无已发布日报" : "找不到这期日报"}</h1><p>{embedded ? "新一期发布后会显示在这里。" : "链接可能有误，或这期内容尚未发布。"}</p>{!embedded && <a href="/?view=daily">查看已发布日报</a>}</div>}
      {state === "error" && <div className="daily-issue-empty-state" role="alert"><h1>日报暂时无法读取</h1><p>请稍后重试，往期归档仍可查看。</p><button type="button" onClick={() => setReload((value) => value + 1)}>重试</button></div>}
      {state === "ready" && item && <>
        <div className="daily-issue-layout">
          <article className="daily-issue-article">
            <h1 className="daily-issue-accessible-title">{item.title}</h1>
            <IssueCalendar selectedDate={date} issues={archiveIssues} onSelectDate={selectDate} />
            {admin && <div className="daily-issue-admin"><button type="button" onClick={() => setEditing(true)}>编辑本期</button><span role="status">{notice}</span></div>}
            {edition ? <EditionContent edition={edition} /> : paper && (paper.sections.length || paper.lead || splitDailyHeadlineIntro(paper.intro).lead) ? <DailyNewspaper paper={paper} showDocumentTitle={false} /> : <section className="daily-issue-legacy" aria-label="日报正文"><div className="daily-report-body">{renderMarkdown(formatDailyMarkdown(item.body))}</div></section>}
            <nav className="daily-issue-adjacent" aria-label="日报翻页"><div>{older ? <a href={issueHref(older.date)} onClick={selectDate ? (event) => { event.preventDefault(); selectDate(older.date); } : undefined}>← 上一期 <span>{readableDate(older.date)}</span></a> : <span>已是最早一期</span>}</div><div>{newer ? <a href={issueHref(newer.date)} onClick={selectDate ? (event) => { event.preventDefault(); selectDate(newer.date); } : undefined}>下一期 → <span>{readableDate(newer.date)}</span></a> : <span>已是最新一期</span>}</div></nav>
          </article>
        </div>
      </>}
    </div>
    {admin && editing && item && <DailyEditor initial={item} onClose={() => setEditing(false)} onSaved={() => { invalidatePublicData("/api/daily-reports"); setEditing(false); setNotice("日报已更新。"); setReload((value) => value + 1); }} />}
    {!embedded && <SiteFooter />}
  </RootTag>;
}
