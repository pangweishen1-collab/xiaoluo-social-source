"use client";

import { useEffect, useRef, useState } from "react";
import { loadPublicData, readPublicData } from "./public-data-cache.mjs";
import { hotTitleForDisplay } from "../shared/hot-translations.mjs";

type HotSource = {
  name: string;
  url: string;
  publishedAt: string;
  kind: "official" | "media";
};

type HotEvent = {
  id: string;
  title: string;
  topic: string;
  publishedAt: string;
  sourceCount: number;
  sources: HotSource[];
};

type RankedEvent = HotEvent & {
  rank: number;
  backfillWindowDays?: 30 | 90 | null;
  verification: "multi-source" | "single-source";
  titleZh?: string | null;
  detail?: {
    status: "ready" | "unavailable" | "rejected";
    titleZh?: string;
    change?: string;
    whyItMatters?: string;
    evidenceQuote?: string;
    sourceUrl?: string;
    market?: string;
    verifiedAt?: string;
    retained?: boolean;
  };
};

export type HotFeed = {
  methodVersion: number;
  updatedAt: string | null;
  windowHours: number;
  stories: HotEvent[];
  leads: HotEvent[];
  rankings: RankedEvent[];
  rankingWindowHours: number;
  fallbackWindowHours: number;
  sources: Array<Pick<HotSource, "name" | "url" | "kind">>;
  status: "ready" | "empty" | "unavailable";
  stale?: boolean;
  usedSavedSnapshot?: boolean;
  snapshotStale?: boolean;
  failedSources?: string[];
};

const HOT_LIST_PATH = "/api/hot-list?method=9";
const HOT_LIST_CACHE_MS = 5 * 60 * 1000;
const cacheIfAvailable = (value: HotFeed) => value.status !== "unavailable";
export const readCachedHotList = (): HotFeed | null => readPublicData(HOT_LIST_PATH, { maxAge: HOT_LIST_CACHE_MS });
export const loadHotList = (force = false): Promise<HotFeed> => loadPublicData(HOT_LIST_PATH, {
  force,
  maxAge: HOT_LIST_CACHE_MS,
  cacheIf: cacheIfAvailable,
});

export function preloadHotList() {
  void loadHotList().catch(() => undefined);
}

function formatDate(value: string, includeTime = false) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [, month, day] = value.split("-");
    return `${Number(month)}月${Number(day)}日`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待核实";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(date);
}

function sourceKind(kind: HotSource["kind"]) {
  return kind === "official" ? "官方一手" : "行业媒体";
}

function SourceLinks({ sources }: { sources: HotSource[] }) {
  return <div className="hot-story-sources" aria-label="事件来源">
    {sources.map((source) => <a key={`${source.name}-${source.url}`} href={source.url} target="_blank" rel="noopener noreferrer" title={`${sourceKind(source.kind)} · ${formatDate(source.publishedAt, true)}`}>
      <span className={source.kind === "official" ? "hot-source-mark is-official" : "hot-source-mark"} aria-hidden="true" />
      {source.name}<span className="hot-source-open" aria-hidden="true">↗</span>
    </a>)}
  </div>;
}

export function HotRankedStories({ rankings }: { rankings: RankedEvent[] }) {
  const ranked = rankings.slice(0, 10).map((story, index) => ({ ...story, rank: story.rank || index + 1 }));
  const groups = [
    { id: "recent", title: "近期事件", description: "近 7 天发布", stories: ranked.filter((story) => !story.backfillWindowDays) },
    { id: "watch", title: "持续观察", description: "较早发布的产品变化", stories: ranked.filter((story) => !!story.backfillWindowDays) },
  ];

  return <div className="hot-ranking-groups">
    {groups.filter((group) => group.stories.length > 0).map((group) => <section className="hot-ranking-group" aria-labelledby={`hot-group-${group.id}`} key={group.id}>
      <div className="hot-group-heading"><h2 id={`hot-group-${group.id}`}>{group.title}<span>{group.stories.length}</span></h2><p>{group.description}</p></div>
      <div className="hot-ranking-list">
        {group.stories.map((story, index) => {
          const detail = story.detail;
          const hasDetail = detail?.status === "ready" && !!detail.change?.trim() && !!detail.whyItMatters?.trim();
          const market = hasDetail ? detail.market?.trim() : undefined;
          const title = hotTitleForDisplay(story);
          const hasOriginalTitle = title !== story.title;
          const primaryUrl = detail?.status === "ready" && detail.sourceUrl ? detail.sourceUrl : story.sources[0]?.url;
          return <article className={`hot-story${hasOriginalTitle ? " is-bilingual" : ""}`} data-rank={story.rank || index + 1} aria-label={`${story.topic} 资讯`} key={story.id}>
            <span className="hot-story-rank" aria-label={`第 ${story.rank || index + 1} 名`}>{String(story.rank || index + 1).padStart(2, "0")}</span>
            <div className="hot-story-body">
              {(market || story.backfillWindowDays) && <div className="hot-story-context">{market && <span>{market}</span>}{story.backfillWindowDays && <span className="hot-backfill-label">持续观察 · 近 {story.backfillWindowDays} 日</span>}</div>}
              <h3 lang={/[\u3400-\u9fff]/.test(title) ? "zh-CN" : "en"}>{primaryUrl ? <a href={primaryUrl} target="_blank" rel="noopener noreferrer">{title}</a> : title}</h3>
              {hasOriginalTitle && <p className="hot-story-original" lang={/[\u3400-\u9fff]/.test(story.title) ? "zh-CN" : "en"}>{story.title}</p>}
              {hasDetail ? <dl className="hot-story-insight">
                <div><dt>具体变化</dt><dd>{detail.change}</dd></div>
                <div className="hot-story-why"><dt>关注理由</dt><dd>{detail.whyItMatters}</dd></div>
              </dl> : <p className="hot-story-detail-pending">正文暂未完成核验，先查看原文</p>}
              {hasDetail && detail.retained && <p className="hot-story-retained">沿用已核验摘要{detail.verifiedAt && <> · 核验于 <time dateTime={detail.verifiedAt}>{formatDate(detail.verifiedAt, true)}</time></>}</p>}
              {hasDetail && detail.evidenceQuote && <details className="hot-story-evidence">
                <summary>原文与依据</summary>
                {hasDetail && detail.evidenceQuote && <blockquote>{detail.evidenceQuote}</blockquote>}
              </details>}
              <div className="hot-story-bottom"><span className="hot-source-count">{story.sourceCount} 个发布者</span><SourceLinks sources={story.sources} /><time className="hot-story-time" dateTime={story.publishedAt}>发布于 {formatDate(story.publishedAt, true)}</time></div>
            </div>
          </article>;
        })}
      </div>
    </section>)}
  </div>;
}

export default function HotList() {
  const [initialFeed] = useState<HotFeed | null>(readCachedHotList);
  const [feed, setFeed] = useState<HotFeed | null>(initialFeed);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">(initialFeed ? "ready" : "loading");
  const [requestVersion, setRequestVersion] = useState(0);
  const lastAutomaticAttempt = useRef(Date.now());

  useEffect(() => {
    let active = true;
    if (!initialFeed || requestVersion > 0) setPhase("loading");
    loadHotList(requestVersion > 0)
      .then((value) => { if (active) { setFeed(value); setPhase("ready"); } })
      .catch(() => { if (active) setPhase("error"); });
    return () => { active = false; };
  }, [requestVersion]);

  useEffect(() => {
    let active = true;
    const refreshIfExpired = () => {
      if (document.visibilityState !== "visible" || readCachedHotList()) return;
      const now = Date.now();
      if (now - lastAutomaticAttempt.current < HOT_LIST_CACHE_MS) return;
      lastAutomaticAttempt.current = now;
      // Keep the current ranking visible while checking for new stories.
      void loadHotList()
        .then((value) => { if (active) { setFeed(value); setPhase("ready"); } })
        .catch(() => { if (active) setPhase("error"); });
    };
    const timer = window.setInterval(refreshIfExpired, HOT_LIST_CACHE_MS);
    document.addEventListener("visibilitychange", refreshIfExpired);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfExpired);
    };
  }, []);

  const rankings = (feed?.rankings || []).slice(0, 10);
  const backfill30Count = rankings.filter((story) => story.backfillWindowDays === 30).length;
  const backfill90Count = rankings.filter((story) => story.backfillWindowDays === 90).length;
  const recentCount = rankings.length - backfill30Count - backfill90Count;
  const isUnavailable = phase === "error" || feed?.status === "unavailable";

  return <div className="hot-page">
    <section className="hot-hero shell" aria-labelledby="hot-page-title">
      <div className="hot-hero-copy">
        <p className="eyebrow">OVERSEAS SOCIAL HOT LIST</p>
        <h1 id="hot-page-title">小骆社交热点榜 <span className="hot-top-ten">TOP10</span></h1>
        <p className="hot-hero-description">追踪语聊、直播与游戏社交产品的具体变化，重点关注 JOYY/BIGO、Yalla、赤子城及旗下产品。读懂发生了什么，以及为什么值得关注；每日 08:00 自动更新。</p>
      </div>
    </section>

    <div className="hot-content shell">
      <div className="hot-dateline" role="status" aria-live="polite">
        <div><span className="hot-live-dot" aria-hidden="true" />
          <strong>{phase === "loading" ? "正在读取公开信源" : isUnavailable ? "信源暂时不可用" : "已读取公开信源"}</strong>
          {feed?.updatedAt && <span>最近读取 · <time dateTime={feed.updatedAt}>{formatDate(feed.updatedAt, true)}（北京时间）</time>{phase === "error" || feed.status === "unavailable" ? " · 使用上次结果" : feed.snapshotStale ? " · 沿用上期已核验榜单，等待定时更新" : feed.usedSavedSnapshot ? " · 含上次快照的真实资讯" : feed.stale ? " · 部分信源暂不可用" : ""}</span>}
          {rankings.length > 0 && <span>本期 {rankings.length} 条 · 近期 {recentCount} 条 · 持续观察 {backfill30Count + backfill90Count} 条{rankings.length < 10 ? " · 合格原文不足 10 条" : ""}</span>}
          {!!feed?.failedSources?.length && <span title={feed.failedSources.join("、")}>{feed.failedSources.length} 个信源暂不可用</span>}
        </div>
        <button type="button" onClick={() => setRequestVersion((version) => version + 1)} disabled={phase === "loading"} aria-label="重新读取热点榜">{phase === "loading" ? "读取中…" : "重新读取"}</button>
      </div>

      <section className="hot-section" aria-label="热点榜排名">
        {rankings.length > 0 ? <HotRankedStories rankings={rankings} /> : <div className="hot-empty">
          <div className="hot-empty-symbol" aria-hidden="true"><span /><span /><span /></div>
          <div><strong>{phase === "loading" && !feed ? "正在整理本期榜单…" : isUnavailable ? "信源暂时无法读取" : "近 90 天暂无可排序的资讯"}</strong>
            <p>{phase === "loading" && !feed ? "正在校验发布时间、产品相关性和独立来源。" : isUnavailable ? "公开信源读取失败；请稍后刷新，不会用无法核验的资讯填榜。" : "榜单只展示有原文、日期可信且符合海外社交产品范围的资讯，不使用虚构占位。"}</p>
          </div>
        </div>}
      </section>

      <section className="hot-method" aria-labelledby="hot-method-title">
        <div className="hot-method-overview">
          <p className="eyebrow">HOW IT WORKS</p>
          <h2 id="hot-method-title">榜单如何产生</h2>
          <ol className="hot-method-steps">
            <li><span>01</span>采集公开资讯</li>
            <li><span>02</span>读取正文与核对日期</li>
            <li><span>03</span>提炼变化并合并事件</li>
            <li><span>04</span>呈现事实与关注理由</li>
          </ol>
          <p className="hot-method-note">每日 08:00 更新。读取原文正文提炼具体变化，关注理由属于行业分析，不代表已验证的产品效果。正文无法读取或提炼尚未完成时会明确标注。近 7 天的事件优先，较早内容列为持续观察；总计最多 10 条，不足时显示实际条数。每家发布者只计一次，单源资讯仍需交叉核验；排名不代表全网热度。</p>
        </div>
        <div className="hot-method-sources">
          <h3>公开信源</h3>
          {feed?.sources?.length ? <div className="hot-method-source-groups">
            {([{ kind: "official", title: "官方一手" }, { kind: "media", title: "行业媒体" }] as const).map((group) => {
              const sources = feed.sources.filter((source) => source.kind === group.kind);
              return sources.length ? <div className="hot-method-source-group" key={group.kind}>
                <h4>{group.title}</h4>
                <div className="hot-method-source-links">{sources.map((source) => <a href={source.url} target="_blank" rel="noopener noreferrer" key={source.url}>{source.name}</a>)}</div>
              </div> : null;
            })}
          </div> : <span className="hot-source-loading">{phase === "error" ? "信源列表暂时无法读取" : "信源列表正在加载…"}</span>}
        </div>
      </section>
    </div>
  </div>;
}
