"use client";
import { useEffect, useState } from "react";
import DailyEditor from "./daily-editor";
import HomeHotPreview from "./home-hot-preview";
import { prepareDailyEdition } from "./daily-edition.mjs";
import { prepareDailyNewspaper } from "./daily-newspaper.mjs";
import { invalidatePublicData, loadPublicData } from "./public-data-cache.mjs";
import "./home-daily.css";

type ReportIndex = { date: string; title: string; leadTitle?: string };
type Report = ReportIndex & { body: string; edition?: unknown };
const previewText = (body: string) => {
  const plain = body.replace(/https?:\/\/\S+/g, "").replace(/[#*>`_\[\]]/g, "").replace(/\s+/g, " ").trim();
  return plain.length > 118 ? `${plain.slice(0, 118)}…` : plain;
};
const reportTopics = (body: string) => prepareDailyNewspaper(body).sections.map(section => section.label).slice(0, 3);
const reportPreview = (body: string) => {
  const topics = reportTopics(body);
  return topics.length ? topics.join(" · ") : previewText(body);
};

export default function HomeDaily({ admin = false }: { admin?: boolean }) {
  const [items, setItems] = useState<ReportIndex[]>([]);
  const [featuredDetail, setFeaturedDetail] = useState<Report | null>(null);
  const [editor, setEditor] = useState<false | true | Report>(false);
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState("loading");
  const [retry, setRetry] = useState(0);
  const [today, setToday] = useState("");
  useEffect(() => {
    const update = () => setToday(new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10));
    update(); const timer = window.setInterval(update, 60000);
    return () => window.clearInterval(timer);
  }, []);
  const dates = today ? [today, new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)] : [];
  const featured = items[0];
  const featuredEdition = featuredDetail && featured && featuredDetail.date === featured.date ? prepareDailyEdition(featuredDetail.edition) : null;
  const featuredPreview = featuredEdition
    ? featured?.leadTitle && featured.leadTitle !== featured.title ? featured.leadTitle : featuredEdition.lead.title !== featured?.title ? featuredEdition.lead.title : featuredEdition.lead.summary
    : featuredDetail && featured && featuredDetail.date === featured.date ? reportPreview(featuredDetail.body) : featured?.leadTitle && featured.leadTitle !== featured.title ? featured.leadTitle : "打开期次阅读完整内容";
  const featuredLabel = featured?.date === dates[0] ? "今日已发布" : featured?.date === dates[1] ? "昨日已发布" : "最近一期已发布";
  const openEditor = async (report: ReportIndex | true) => {
    setNotice("");
    if (report === true) { setEditor(true); return; }
    try {
      const response = await fetch(`/api/daily-reports/${report.date}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("日报详情读取失败");
      const data = await response.json() as { item?: Report };
      if (!data.item || data.item.date !== report.date) throw new Error("日报详情无效");
      setEditor(data.item);
    } catch { setNotice("无法读取本期完整内容，请稍后再试，以免覆盖已有版面。"); }
  };
  useEffect(() => {
    let active = true;
    setStatus("loading");
    loadPublicData("/api/daily-reports?index=1", { force: retry > 0 }).then(async (data: { items?: ReportIndex[] }) => {
      if (!Array.isArray(data?.items)) throw new Error("daily");
      const sorted = [...data.items].sort((a, b) => b.date.localeCompare(a.date));
      if (active) { setItems(sorted); setStatus("ready"); setFeaturedDetail(null); }
      if (sorted[0]) {
        try {
          const response = await fetch(`/api/daily-reports/${sorted[0].date}`, { credentials: "same-origin", cache: "no-store" });
          if (response.ok) {
            const detail = await response.json() as { item?: Report };
            if (active && detail.item?.date === sorted[0].date) setFeaturedDetail(detail.item);
          }
        } catch { /* The archive index is still usable without the preview. */ }
      }
    }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [retry]);
  return <section className="section shell home-daily" aria-labelledby="home-daily-title">
    <div className="section-top"><div><p className="eyebrow">XIAOLU NEWS</p><h2 id="home-daily-title">小骆资讯</h2></div><div className="home-daily-heading-actions">
      {admin && <><button className="home-daily-admin-publish" type="button" aria-haspopup="dialog" onClick={() => { void openEditor(true); }}>发布日报 ＋</button>{featured && <button className="home-daily-admin-edit" type="button" aria-haspopup="dialog" onClick={() => { void openEditor(featured); }}>编辑最新一期</button>}</>}
      {items.length > 0 && <a className="home-daily-view-all" href="/?view=daily">查看全部日报</a>}
    </div></div>
    <p className="section-intro">海外语聊、直播与社交产品的每日观察与热点资讯。</p>
    {admin && notice && <p className="home-daily-admin-notice" role="status">{notice}</p>}
    <div className="home-daily-layout">
      {status !== "ready" ? <div className="home-daily-feature home-daily-feature-empty"><p role={status === "error" ? "alert" : "status"}>{status === "error" ? <>日报暂时无法加载。<button type="button" onClick={() => setRetry(n => n + 1)}>重试</button></> : "正在加载日报…"}</p></div> : featured ? <a className="home-daily-feature" href={`/daily/${featured.date}`}>
        <span className="home-daily-feature-top"><span className="home-daily-feature-label"><i aria-hidden="true" />{featuredLabel}</span><time dateTime={featured.date}>{featured.date.replaceAll("-", ".")}</time></span>
        <div className="home-daily-feature-main"><span className="home-daily-feature-eyebrow">LATEST RESEARCH BRIEF</span><h3>{featured.title}</h3><span className="home-daily-feature-preview">{featuredPreview}</span></div>
        <span className="home-daily-feature-bottom"><span>出海社交 · 行业观察</span><span className="home-daily-feature-read">阅读这期日报 <span aria-hidden="true">↗</span></span></span>
      </a> : <div className="home-daily-feature home-daily-feature-empty">
        <span className="home-daily-feature-top"><span className="home-daily-feature-label"><i aria-hidden="true" />日报归档</span></span>
        <div className="home-daily-feature-main"><span className="home-daily-feature-eyebrow">INDUSTRY DAILY BRIEF</span><h3>首期日报准备中</h3><span className="home-daily-feature-preview">发布后将在这里展示最新一期内容。</span></div>
      </div>}
      <HomeHotPreview />
    </div>
    {admin && editor && <DailyEditor initial={typeof editor === "object" ? editor : undefined} onClose={() => setEditor(false)} onSaved={() => { const wasEditing = typeof editor === "object"; invalidatePublicData("/api/daily-reports"); invalidatePublicData("/api/daily-reports?index=1"); setEditor(false); setRetry((value) => value + 1); setNotice(wasEditing ? "日报已更新。" : "日报已发布。"); }} />}
  </section>;
}
