import { type ReactNode } from "react";

export const formatDailyMarkdown = (body: string) => body.split("\n").map(line => {
  if (/^[一二三四五六七八九十]+、/.test(line)) return `### ${line}`;
  const source = line.trim();
  const linkedSource = source.match(/^\[https?:\/\/[^\]]+\]\((https?:\/\/[^\s)]+)\)$/);
  const sourceUrl = linkedSource?.[1] ?? (/^https?:\/\/\S+$/.test(source) ? source : null);
  if (sourceUrl) {
    try {
      const hostname = new URL(sourceUrl).hostname.replace(/^www\./, "");
      const label = hostname === "play.google.com" ? "Google Play" : hostname.endsWith(".linkedin.com") ? "LinkedIn" : hostname === "t.me" ? "Telegram" : hostname;
      return `\n[${label}](${sourceUrl})\n`;
    } catch { /* Keep an invalid URL as plain text. */ }
  }
  if (line.startsWith("• ")) return `- ${line.slice(2)}`;
  return line;
}).join("\n");

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((item) => item.trim());
const tableDivider = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

function inline(text: string, highlight = true): ReactNode {
  // Triple emphasis must be tokenized before ordinary bold. Code and link
  // destinations stay opaque; no HTML is evaluated or injected.
  const parts = text.split(/(`[^`]+`|\[[^\]]+\]\([^\s)]+\)|\*\*\*[^*\n]+\*\*\*|\*\*[^*]+\*\*)/g).filter(Boolean);
  return <>{parts.map((part, index) => {
    if (part.startsWith("***") && part.endsWith("***")) {
      const content = inline(part.slice(3, -3), false);
      return <strong key={index}>{highlight ? <em className="daily-markdown-highlight">{content}</em> : content}</strong>;
    }
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
    return link && /^https?:\/\//i.test(link[2]) ? <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a> : part;
  })}</>;
}

export function renderMarkdown(body: string, options: { paragraphClassName?: (text: string) => string | undefined } = {}) {
  const lines = body.replace(/\r\n?/g, "\n").split("\n"); const nodes: ReactNode[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    if (/^\|/.test(line) && tableDivider(lines[index + 1] || "")) { const header = cells(line); index += 2; const rows: string[][] = []; while (/^\|/.test(lines[index] || "") && !tableDivider(lines[index])) { rows.push(cells(lines[index])); index += 1; } nodes.push(<div className="article-markdown-table" key={`table-${index}`}><table><thead><tr>{header.map((value, cellIndex) => <th key={cellIndex}>{inline(value)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{header.map((_, cellIndex) => <td key={cellIndex}>{inline(row[cellIndex] || "")}</td>)}</tr>)}</tbody></table></div>); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/); if (heading) { const content = inline(heading[2], false); nodes.push(heading[1].length === 3 ? <h3 key={index}>{content}</h3> : <h2 key={index}>{content}</h2>); index += 1; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { nodes.push(<hr key={index} />); index += 1; continue; }
    if (/^>\s?/.test(line)) { const quote: string[] = []; while (/^>\s?/.test(lines[index] || "")) { quote.push(lines[index].replace(/^>\s?/, "")); index += 1; } nodes.push(<blockquote key={index}>{inline(quote.join("\n"))}</blockquote>); continue; }
    const isOrdered = /^\s*\d+\. /.test(line); if (isOrdered || /^\s*[-*+] /.test(line)) { const items: string[] = []; const rule = isOrdered ? /^\s*\d+\. / : /^\s*[-*+] /; while (rule.test(lines[index] || "")) { items.push(lines[index].replace(rule, "")); index += 1; } const List = isOrdered ? "ol" : "ul"; nodes.push(<List key={index}>{items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}</List>); continue; }
    const paragraph: string[] = [line]; index += 1; while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s+|^\||^>\s?|^\s*([-*+] |\d+\. )|^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[index])) { paragraph.push(lines[index]); index += 1; }
    const text = paragraph.join("\n");
    const roleClass = options.paragraphClassName?.(text);
    nodes.push(<p className={`article-markdown-inline${roleClass ? ` ${roleClass}` : ""}`} key={index}>{inline(text)}</p>);
  }
  return nodes;
}
