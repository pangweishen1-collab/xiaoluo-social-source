"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { renderMarkdown } from "./daily-markdown";
import { validateDailyEdition } from "../shared/daily-edition.mjs";
const defaultTitle = (date: string) => {
  const parts = date.split("-");
  return parts.length === 3 ? `${Number(parts[1])}月${Number(parts[2])}日海外语聊直播行业日报` : "";
};

export default function DailyEditor({ onClose, onSaved, initial }: { onClose: () => void; onSaved: (date: string) => void; initial?: { date: string; title: string; body: string; edition?: unknown } }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState(() => initial?.date ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  const [body, setBody] = useState(initial?.body ?? "");
  const [editionText, setEditionText] = useState(() => initial?.edition ? JSON.stringify(initial.edition, null, 2) : "");
  const initialEditionText = initial?.edition ? JSON.stringify(initial.edition, null, 2) : "";
  const firstLine = body.trimStart().split(/\r?\n/)[0] ?? "";
  const heading = firstLine.match(/^#\s+(.+?)(?:\s+#+)?\s*$/)?.[1]?.trim();
  const title = (heading || initial?.title || defaultTitle(date)).slice(0, 160);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; const el = dialog.current; el?.showModal(); return () => { el?.close(); previous?.focus(); }; }, []);
  const dirty = initial ? body !== initial.body || editionText !== initialEditionText : Boolean(body.trim() || editionText.trim());
  const close = () => { if (!busy && (!dirty || window.confirm("关闭后未保存的内容不会保留，确定关闭？"))) onClose(); };
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setError("");
    let edition: unknown;
    if (editionText.trim()) {
      try {
        const parsed = JSON.parse(editionText) as { edition?: unknown };
        edition = parsed && typeof parsed === "object" && "edition" in parsed ? parsed.edition : parsed;
      } catch { setError("版面 JSON 格式有误，请检查括号和引号。"); return; }
      const validation = validateDailyEdition(edition);
      if (!validation.ok) { setError(`版面 JSON 校验未通过：${validation.errors.slice(0, 2).join("；")}`); return; }
    }
    if (initial?.edition && body !== initial.body && editionText === initialEditionText) {
      setError("正文已修改。请同步更新版面 JSON，或清空 JSON 后保存为旧版全文，以免两份内容不一致。");
      return;
    }
    setBusy(true);
    try {
      const payload = { date, title, body, ...(editionText.trim() ? { edition } : initial?.edition ? { edition: null } : {}) };
      const response = await fetch("/api/daily-reports", { method: initial ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "发布失败，请重试。");
      onSaved(date);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "网络异常，请重试。"); }
    finally { setBusy(false); }
  }
  return <dialog className="daily-editor" ref={dialog} aria-labelledby="daily-editor-title" onCancel={event => { event.preventDefault(); close(); }}>
    <form onSubmit={submit}>
      <header><h2 id="daily-editor-title">{initial ? "编辑日报" : "发布日报"}</h2><button type="button" aria-label="关闭弹窗" disabled={busy} onClick={close}>×</button></header>
      <label>日报日期<input type="date" value={date} required disabled={busy || Boolean(initial)} onChange={e => setDate(e.target.value)} /></label>
      <div className="daily-editor-tabs"><button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>填写正文</button><button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>预览</button></div>
      <label hidden={preview}>正文（支持 Markdown，旧版全文保留）<textarea autoFocus value={body} required={!preview} maxLength={80000} rows={12} disabled={busy} placeholder={"# 日报标题\n\n### 一、产品雷达\n\n填写已核实内容。"} onChange={e => setBody(e.target.value)} /></label>
      <div className="daily-editor-edition"><div><strong>网站版面 JSON（可选）</strong><span>粘贴 Skill 输出的 edition，或导入 .json 文件；未提供时仍按旧版全文展示。</span></div><label className="daily-editor-json-file">导入 JSON 文件<input type="file" accept=".json,application/json" disabled={busy} onChange={async e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 300000) { setError("JSON 文件过大，请检查内容。"); return; } try { setEditionText(await file.text()); setError(""); } catch { setError("无法读取 JSON 文件，请改为粘贴内容。"); } }} /></label><textarea aria-label="网站版面 JSON" spellCheck={false} value={editionText} maxLength={300000} rows={editionText ? 9 : 4} disabled={busy} placeholder={'{"schemaVersion":1,"leadItemId":"...","highlightIds":[],"sections":[...]}' } onChange={e => { setEditionText(e.target.value); setError(""); }} />{Boolean(initial?.edition) && !editionText.trim() && <p className="daily-editor-edition-warning">本期原有结构化版面将被清除，页面改用上方 Markdown 全文。</p>}</div>
      {preview && <div className="daily-report-body daily-editor-preview">{body.trim() ? renderMarkdown(body) : <p>填写正文后可预览。</p>}{editionText.trim() && <p className="daily-editor-edition-preview">已填写结构化版面 JSON；保存后页面会按头条、看点与三栏展示。</p>}</div>}
      <p className="daily-editor-hint">{initial ? "编辑不会改变归档日期。正文与版面 JSON 要保持一致，服务端会再次校验。" : "同一天只发布一期；网站版面 JSON 是可选增强，不影响旧版 Markdown 正文。"}</p>
      {error && <p role="alert">{error}</p>}
      <footer><button type="button" onClick={close} disabled={busy}>取消</button><button type="submit" disabled={busy || !title.trim() || !body.trim() || !date}>{busy ? "保存中…" : initial ? "保存修改" : "发布日报"}</button></footer>
    </form>
  </dialog>;
}
