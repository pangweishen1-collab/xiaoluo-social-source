"use client";
import { useEffect, useRef, useState } from "react";

type Inquiry = { id: string; companyProduct: string; region: string; type: string; description: string; budget: string; timeline: string; contact: string; createdAt: string };
export default function BusinessInbox({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<Inquiry[]>([]);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
    const modal = dialog.current;
    modal?.showModal(); document.body.style.overflow = "hidden";
    return () => { modal?.close(); document.body.style.overflow = previous; trigger?.focus(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setItems([]);
    fetch(`/api/admin/business-inquiries?page=${page}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "加载失败"); return data; })
      .then(data => { setItems(data.items); setHasMore(data.hasMore); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message || "加载失败，请重试。"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, retry]);
  return <dialog ref={dialog} className="business-inbox" aria-labelledby="business-inbox-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose(); } }}>
    <header><div><h2 id="business-inbox-title">行业需求</h2><p>仅管理员可见 · 按提交时间倒序排列</p></div><button type="button" aria-label="关闭需求列表" onClick={onClose}>×</button></header>
    <div className="business-inbox-list">
      {loading ? <p role="status">正在加载需求…</p> : error ? <div role="alert"><p>{error}</p><button onClick={() => setRetry(v => v + 1)}>重新加载</button></div> : items.length ? items.map(item => <article key={item.id}>
        <div className="business-inbox-item-head"><h3>{item.companyProduct}</h3><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</time></div>
        <dl>{[["地区", item.region], ["需求类型", item.type], ["预算区间", item.budget], ["预计时间", item.timeline], ["联系方式", item.contact], ["需求描述", item.description]].map(([label, value]) => <div key={label} className={label === "需求描述" || label === "联系方式" ? "wide" : ""}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </article>) : <p role="status">暂无收到的需求。</p>}
    </div>
    <footer><button disabled={loading || page === 1} onClick={() => setPage(v => v - 1)}>上一页</button><span>第 {page} 页</span><button disabled={loading || !!error || !hasMore} onClick={() => setPage(v => v + 1)}>下一页</button><button disabled={loading} onClick={() => setRetry(v => v + 1)}>刷新</button></footer>
  </dialog>;
}
