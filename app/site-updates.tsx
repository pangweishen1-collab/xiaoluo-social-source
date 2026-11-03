"use client";

import { useEffect, useRef, useState } from "react";
export type UpdateEntry = { id: string; version: string; date: string | null; status: string; title: string; summary: string; changes: { type: string; text: string }[] };
const updateDate = (value: string) => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium" }).format(new Date(value));

export function UpdatesDialog({ entries, loadError, onClose }: { entries: UpdateEntry[]; loadError: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [filter, setFilter] = useState("全部");
  useEffect(() => {
    const element = dialog.current;
    const previous = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previous; };
  }, []);
  const contentEntries = entries.map((entry) => ({ ...entry, changes: entry.changes.filter((change) => ["行业文章", "矩阵产品"].includes(change.type)) })).filter((entry) => entry.changes.length);
  const shown = contentEntries.map((entry) => ({ ...entry, changes: entry.changes.filter((change) => filter === "全部" || change.type === filter) })).filter((entry) => entry.changes.length);
  return <dialog ref={dialog} className="updates-dialog" aria-labelledby="updates-dialog-title" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}>
    <header className="updates-dialog-header"><div><p className="eyebrow">WHAT’S NEW</p><h2 id="updates-dialog-title">更新记录</h2><p>每一次改进，都在这里留下一笔。</p></div><button autoFocus onClick={onClose} aria-label="关闭更新记录">×</button></header>
    <div className="updates-dialog-layout">
      {loadError && <p role="alert">后台内容更新暂时无法加载，当前仅展示已读取的记录。</p>}
      <aside className="updates-directory"><span>版本目录</span><nav aria-label="更新版本">{shown.map((entry) => <a key={entry.id} href={`#release-${entry.id}`}>{entry.status === "draft" ? "待发布" : entry.date ? updateDate(entry.date) : ""}{entry.version !== "内容更新" && <small>{entry.version}</small>}</a>)}</nav><p>{contentEntries.filter((entry) => entry.status === "published").length} 次发布{contentEntries.some((entry) => entry.status === "draft") && " · 含本地待发布记录"}</p></aside>
      <div className="updates-main"><div className="updates-filters" role="group" aria-label="按更新类型筛选">{["全部", "行业文章", "矩阵产品"].map((type) => <button key={type} aria-pressed={filter === type} onClick={() => setFilter(type)}>{type}</button>)}</div>
        <div className="updates-timeline">{shown.map((entry) => <article id={`release-${entry.id}`} key={entry.id} className="release-entry"><div className="release-meta">{entry.date ? <time dateTime={entry.date}>{updateDate(entry.date)}</time> : <span>待发布</span>}</div><h3>{entry.title}</h3>{entry.summary && entry.summary !== "后台发布" && <p>{entry.summary}</p>}<ul>{entry.changes.map((change, index) => <li key={index}><span>{change.text}</span></li>)}</ul></article>)}</div>
        {!shown.length && <p className="updates-empty" role="status">{contentEntries.length ? "暂时没有这一类更新。" : "更新记录将从下一次发布开始整理，过往未核实的版本不作补记。"}</p>}
      </div>
    </div>
  </dialog>;
}
