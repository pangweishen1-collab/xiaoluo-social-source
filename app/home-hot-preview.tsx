"use client";

import { useEffect, useId, useState } from "react";
import { loadHotList, readCachedHotList, type HotFeed } from "./hot-list";
import { watchHotFeed } from "./hot-feed-watch";
import { hotTitleForDisplay } from "../shared/hot-translations.mjs";

function publishedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待核实";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric" }).format(date);
}

function RankTrophy({ rank }: { rank: number }) {
  const id = useId();
  const metal = rank === 1 ? "gold" : rank === 2 ? "silver" : "bronze";
  const label = rank === 1 ? "金杯" : rank === 2 ? "银杯" : "铜杯";
  return <span className={`home-hot-rank is-${metal}`} role="img" aria-label={`第 ${rank} 名 · ${label}`}>
    <svg className="home-hot-trophy" viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
      <defs><linearGradient id={id} x1="12" y1="9" x2="35" y2="37" gradientUnits="userSpaceOnUse"><stop stopColor="var(--trophy-light)" /><stop offset=".48" stopColor="var(--trophy-color)" /><stop offset="1" stopColor="var(--trophy-dark)" /></linearGradient></defs>
      <path className="home-hot-trophy-handles" d="M13 11H7v5c0 5 3 8 8 9m20-14h6v5c0 5-3 8-8 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 7h22v10c0 7-4.3 12-11 12s-11-5-11-12V7Z" fill={`url(#${id})`} />
      <path d="M17 10v7c0 4 1.4 6.6 3.5 8" stroke="white" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" />
      <path d="M21.5 28h5v8h-5z" fill={`url(#${id})`} />
      <path d="M18 35h12l3 5H15l3-5Z" fill={`url(#${id})`} />
      <path d="M15 41h18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <text x="24" y="21" textAnchor="middle" className="home-hot-trophy-number">{rank}</text>
    </svg>
  </span>;
}

export function HomeHotStories({ rankings }: { rankings: HotFeed["rankings"] }) {
  return <ol className="home-hot-list" aria-label="热点榜前三名">
    {rankings.slice(0, 3).map((story, index) => {
      const title = hotTitleForDisplay(story);
      const url = story.detail?.status === "ready" && story.detail.sourceUrl ? story.detail.sourceUrl : story.sources[0]?.url;
      return <li key={story.id}>
        <RankTrophy rank={story.rank || index + 1} />
        <div className="home-hot-story">
          <a className="home-hot-title" href={url || "/?view=hot"} target={url ? "_blank" : undefined} rel={url ? "noopener noreferrer" : undefined} lang={/[\u3400-\u9fff]/.test(title) ? "zh-CN" : "en"}>{title}</a>
          <p className="home-hot-meta">{story.sources[0]?.name && <span>{story.sources[0].name}</span>}<time dateTime={story.publishedAt}>{publishedDate(story.publishedAt)}</time>{story.backfillWindowDays && <span>持续观察</span>}</p>
        </div>
      </li>;
    })}
  </ol>;
}

export default function HomeHotPreview() {
  // Hydrate the same loading markup as the server; loadHotList reuses cached data after mount.
  const [feed, setFeed] = useState<HotFeed | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setFailed(false);
    return watchHotFeed({
      load: loadHotList,
      read: readCachedHotList,
      onFeed: value => {
        setFeed(previous => value.status === "unavailable" && !value.rankings.length ? previous : value);
        setFailed(value.status === "unavailable");
      },
      onError: () => setFailed(true),
    });
  }, [retry]);
  const rankings = feed?.rankings || [];
  return <aside className="home-hot-preview" aria-labelledby="home-hot-title">
    <div className="home-hot-head"><h3 id="home-hot-title">热点榜 <span>TOP 3</span></h3><a href="/?view=hot">查看榜单 <span aria-hidden="true">↗</span></a></div>
    {rankings.length > 0 ? <HomeHotStories rankings={rankings} /> : <p className="home-hot-state" role={failed ? "alert" : "status"}>{failed ? "热点榜暂时无法加载。" : feed ? "暂无已发布热点。" : "正在加载热点…"}{failed && <button type="button" onClick={() => setRetry(value => value + 1)}>重试</button>}</p>}
    {(failed || feed?.snapshotStale || feed?.stale || feed?.usedSavedSnapshot) && rankings.length > 0 && <p className="home-hot-note">沿用已发布榜单{feed?.updatedAt && <> · 更新于 <time dateTime={feed.updatedAt}>{publishedDate(feed.updatedAt)}</time></>}</p>}
  </aside>;
}
