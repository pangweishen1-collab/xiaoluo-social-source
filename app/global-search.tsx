"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { loadPublicData } from "./public-data-cache.mjs";
import { matrixCompanies } from "./matrix-data";
import { tools } from "./practical-tools";
import { buildSearchIndex, searchSite, SEARCH_LIMIT } from "./site-search-index.mjs";

type SearchDocument = { id: string; kind: string; title: string; description: string; keywords: string; href: string };
const sources = [{ key: "articles", path: "/api/articles", name: "公司分析" }, { key: "daily", path: "/api/daily-reports", name: "日报" }, { key: "matrix", path: "/api/matrix", name: "产品矩阵" }, { key: "talent", path: "/api/talent", name: "人才信息" }] as const;

export default function GlobalSearch() {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [documents, setDocuments] = useState<SearchDocument[]>([]);
  const results = useMemo(() => searchSite(documents, query), [documents, query]);
  const visible = results.slice(0, SEARCH_LIMIT);
  const selected = active >= 0 && active < visible.length ? active : -1;
  const load = async (force = false) => {
    const sequence = ++requestId.current;
    setLoading(true);
    const responses = await Promise.allSettled(sources.map(source => loadPublicData(source.path, { force })));
    if (sequence !== requestId.current) return;
    const values: Record<string, unknown> = { builtIns: matrixCompanies, tools };
    const failed: string[] = [];
    responses.forEach((response, index) => {
      const source = sources[index];
      if (response.status === "fulfilled" && Array.isArray(response.value?.items)) values[source.key] = response.value.items;
      else failed.push(source.name);
    });
    setDocuments(buildSearchIndex(values)); setErrors(failed); setLoading(false); setActive(-1);
  };
  useEffect(() => () => { requestId.current += 1; }, []);
  useEffect(() => {
    if (open && selected >= 0) document.getElementById(`${id}-result-${selected}`)?.scrollIntoView({ block: "nearest" });
  }, [id, open, selected]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return <div className="global-search" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <div className="global-search-field">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>
      <input ref={input} type="search" role="combobox" aria-label="全站搜索" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-results`} aria-activedescendant={open && selected >= 0 ? `${id}-result-${selected}` : undefined} autoComplete="off" maxLength={80} placeholder="搜索全站内容…" value={query}
        onFocus={() => { setOpen(true); void load(); }}
        onChange={event => { setQuery(event.target.value); setOpen(true); setActive(-1); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") { setOpen(false); setActive(-1); }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setOpen(true);
            if (visible.length) setActive(current => event.key === "ArrowDown" ? (current + 1) % visible.length : (current <= 0 ? visible.length : current) - 1);
          }
          if (event.key === "Enter" && open && visible.length) { event.preventDefault(); document.getElementById(`${id}-result-${selected < 0 ? 0 : selected}`)?.click(); }
        }} />
      {query && <button className="global-search-clear" type="button" aria-label="清空全站搜索" onClick={() => { setQuery(""); setActive(-1); input.current?.focus(); }}>×</button>}
    </div>
    {open && <div className="global-search-panel">
      <div className="global-search-status" role="status">{loading ? "正在搜索全站内容…" : !query.trim() ? "搜索公司、产品、服务商、研究文章、日报和人才信息" : errors.length ? `已匹配 ${results.length} 条 · 部分栏目暂不可用` : `找到 ${results.length} 条结果`}</div>
      {errors.length > 0 && <div className="global-search-error" role="alert">{errors.join("、")}加载失败。<button type="button" onClick={() => void load(true)}>重试</button></div>}
      <div className="global-search-results" id={`${id}-results`} role="listbox" aria-label="全站搜索结果" aria-busy={loading}>
        {visible.map((item: SearchDocument & { excerpt: string }, index: number) => <a key={item.id} id={`${id}-result-${index}`} role="option" aria-selected={selected === index} className={selected === index ? "is-active" : undefined} href={item.href} onClick={() => setOpen(false)}>
          <span className="global-search-kind">{item.kind}</span><strong>{item.title}</strong>{item.excerpt && <span className="global-search-excerpt">{item.excerpt}</span>}
        </a>)}
      </div>
      {!loading && query.trim() && !results.length && <p className="global-search-empty">{errors.length ? "已加载的栏目中暂无匹配，请重试或换个关键词。" : "没有找到相关内容，试试公司名、产品名或更短的关键词。"}</p>}
      {results.length > SEARCH_LIMIT && <p className="global-search-hint">显示前 {SEARCH_LIMIT} 条，输入更具体的关键词可缩小范围。</p>}
    </div>}
  </div>;
}
