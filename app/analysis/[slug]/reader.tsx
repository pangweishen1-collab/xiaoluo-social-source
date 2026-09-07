"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { incrementArticleView, prefetchArticle, readCachedArticle } from "../../article-cache.mjs";

type Article = { slug: string; title: string; company: string; category: string; summary: string; tags: string[]; body: string; publishedAt: string; views: number };
type ArticleIndexItem = { slug: string; title: string; publishedAt: string };
function BackToAnalysis() { return <a className="article-back" href="/?view=analysis">← 返回公司分析</a>; }
function SiteNavigation() { return <div className="article-nav-bar"><header className="nav shell article-site-nav"><div className="brand"><a className="brand-home" href="/" aria-label="回到首页"><span>小骆 <small>语聊出海观察</small></span></a><a className="avatar-login" href="/?view=talent" aria-label="前往人才市场"><img src="/xiaohongshu-avatar.webp" alt="" /></a></div><nav aria-label="主导航"><a href="/">首页</a><a className="active" href="/?view=analysis">公司分析</a><a href="/?view=matrix">出海矩阵</a><a href="/?view=talent">人才市场</a><a href="/?view=business">商务合作</a></nav></header></div>; }
function ReturnToTop() { return <div className="article-return-top"><button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>返回顶部 ↑</button></div>; }
function ArticleFooter({ previous, next }: { previous: ArticleIndexItem | null; next: ArticleIndexItem | null }) { return <nav className="article-footer-navigation" aria-label="文章翻页"><div>{previous ? <a className="article-adjacent-link" href={`/analysis/${previous.slug}`}>← 上一篇</a> : <span>← 上一篇</span>}</div><ReturnToTop /><div>{next ? <a className="article-adjacent-link" href={`/analysis/${next.slug}`}>下一篇 →</a> : <span>下一篇 →</span>}</div></nav>; }
const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((item) => item.trim());
const tableDivider = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^\s)]+\))/g).filter(Boolean);
  return <>{parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
    return link ? <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a> : part;
  })}</>;
}

function renderMarkdown(body: string) {
  const lines = body.replace(/\r\n?/g, "\n").split("\n"); const nodes: ReactNode[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    if (/^\|/.test(line) && tableDivider(lines[index + 1] || "")) { const header = cells(line); index += 2; const rows: string[][] = []; while (/^\|/.test(lines[index] || "") && !tableDivider(lines[index])) { rows.push(cells(lines[index])); index += 1; } nodes.push(<div className="article-markdown-table" key={`table-${index}`}><table><thead><tr>{header.map((value, cellIndex) => <th key={cellIndex}>{inline(value)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{header.map((_, cellIndex) => <td key={cellIndex}>{inline(row[cellIndex] || "")}</td>)}</tr>)}</tbody></table></div>); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/); if (heading) { const content = inline(heading[2]); nodes.push(heading[1].length === 3 ? <h3 key={index}>{content}</h3> : <h2 key={index}>{content}</h2>); index += 1; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { nodes.push(<hr key={index} />); index += 1; continue; }
    if (/^>\s?/.test(line)) { const quote: string[] = []; while (/^>\s?/.test(lines[index] || "")) { quote.push(lines[index].replace(/^>\s?/, "")); index += 1; } nodes.push(<blockquote key={index}>{inline(quote.join("\n"))}</blockquote>); continue; }
    const isOrdered = /^\s*\d+\. /.test(line); if (isOrdered || /^\s*[-*+] /.test(line)) { const items: string[] = []; const rule = isOrdered ? /^\s*\d+\. / : /^\s*[-*+] /; while (rule.test(lines[index] || "")) { items.push(lines[index].replace(rule, "")); index += 1; } const List = isOrdered ? "ol" : "ul"; nodes.push(<List key={index}>{items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}</List>); continue; }
    const paragraph: string[] = [line]; index += 1; while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s+|^\||^>\s?|^\s*([-*+] |\d+\. )|^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[index])) { paragraph.push(lines[index]); index += 1; } nodes.push(<p className="article-markdown-inline" key={index}>{inline(paragraph.join("\n"))}</p>);
  }
  return nodes;
}

export default function ArticleReader() {
  const slug = typeof location === "undefined" ? "" : location.pathname.split("/").pop() || "";
  const [article, setArticle] = useState<Article | null>(null); const [articles, setArticles] = useState<ArticleIndexItem[]>([]); const [missing, setMissing] = useState(false);
  const countedSlug = useRef("");
  useEffect(() => {
    if (!slug) return;
    const cached = readCachedArticle(slug);
    if (cached) { setArticle(cached); return; }
    prefetchArticle(slug).then((item) => item ? setArticle(item) : setMissing(true)).catch(() => setMissing(true));
  }, [slug]);
  useEffect(() => {
    if (!article || !slug || countedSlug.current === slug) return;
    countedSlug.current = slug;
    incrementArticleView(slug).then((views) => setArticle((current) => current ? { ...current, views } : current)).catch(() => undefined);
  }, [article?.slug, slug]);
  useEffect(() => { fetch("/api/articles", { credentials: "same-origin", cache: "no-store" }).then(async (response) => response.ok ? setArticles(((await response.json()).items || []).sort((a: ArticleIndexItem, b: ArticleIndexItem) => +new Date(b.publishedAt) - +new Date(a.publishedAt))) : undefined).catch(() => undefined); }, []);
  if (missing) return <main className="article-reader-shell"><SiteNavigation /><section className="article-reader-card shell"><BackToAnalysis /><h1>文章不存在</h1><p>这篇分析可能已被删除，或链接有误。</p></section></main>;
  if (!article) return <main className="article-reader-shell"><SiteNavigation /><section className="article-reader-card shell article-reader-loading"><p className="eyebrow">RESEARCH ARCHIVE</p><p>正在读取文章…</p></section></main>;
  const articleIndex = articles.findIndex((item) => item.slug === slug); const previous = articleIndex >= 0 ? articles[articleIndex + 1] || null : null; const next = articleIndex > 0 ? articles[articleIndex - 1] || null : null;
  return <main className="article-reader-shell"><SiteNavigation /><article className="article-reader-card shell"><header className="article-reader-header"><BackToAnalysis /><p className="eyebrow">{article.category} · {article.company}</p><h1>{article.title}</h1><div className="article-reader-meta"><time>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "long" }).format(new Date(article.publishedAt))}</time><span>小骆研究档案</span></div><p className="article-summary">{article.summary}</p><div className="article-tags">{article.tags.map((tag) => <i key={tag}>{tag}</i>)}</div></header><div className="article-reader-content">{renderMarkdown(article.body)}</div><ArticleFooter previous={previous} next={next} /></article></main>;
}
