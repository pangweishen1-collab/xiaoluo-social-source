import { HOT_FEEDS, reviewedProductEvent } from "../../shared/hot-list.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const SOURCE_TIMEOUT_MS = 8_000;
const MAX_ARTICLE_BYTES = 768 * 1024;
const MAX_HOT_BYTES = 192 * 1024;
const MAX_ARTICLE_TEXT = 9_000;
const SOURCE_BY_NAME = new Map(HOT_FEEDS.map((feed) => [feed.name, feed]));

const DIRECT_SOCIAL = /\b(?:voice|audio\s+(?:chat|room|call)|video\s+call|chat|messag\w*|dms?|livestream\w*|live\s+stream\w*|reels?|comments?|polls?|gifts?|gifting|communities|community|group\s+(?:call|chat|room)|moderation\s+(?:controls?|tools?))\b|(?:语聊|语音房|直播|私信|群聊|评论|礼物|社区互动)/iu;
const PRODUCT_CHANGE = /\b(?:launch\w*|introduc\w*|releas\w*|roll\w*\s*out|test\w*|expand\w*|add\w*|updat\w*|chang\w*|rebuild\w*)\b|(?:推出|发布|上线|测试|扩展|新增|更新|改版)/iu;
const HOLLOW = /^(?:.{0,50}(?:updates?|patch\s+notes|release\s+notes|what['’]s\s+new)\s*[:：-]?\s*)?(?:\d{4}(?:[-/.年]\d{1,2}){0,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4})\s*$/iu;
const NON_SOCIAL_SEARCH = /\b(?:search\s+(?:chatbot|assistant|tool)|shopping\s+assistant|ai\s+search)\b/iu;
const NON_PRODUCT_NEWS = /\b(?:alleg\w*|lawsuit|sued?|settle\w*|fine[ds]?|investigat\w*|wants?\s+to|hopes?\s+to|plans?\s+to|might|may\s+bring|rumou?r\w*)\b|(?:指控|诉讼|和解|罚款|传闻|有意|希望|计划重启)/iu;

export function beijingReportDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function canonicalDay(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const day = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().startsWith(day) ? day : null;
}

export function withinDays(day, reportDate, maxDays = 6) {
  const published = canonicalDay(day);
  const report = canonicalDay(reportDate);
  if (!published || !report) return false;
  const elapsed = Date.parse(`${report}T00:00:00Z`) - Date.parse(`${published}T00:00:00Z`);
  return elapsed >= 0 && elapsed <= maxDays * DAY_MS;
}

export function isSubstantiveSocialStory(story) {
  if (!story || typeof story.title !== "string" || typeof story.topic !== "string") return false;
  const title = story.title.trim();
  if (title.length < 24 || title.length > 300 || HOLLOW.test(title) || NON_PRODUCT_NEWS.test(title)
    || NON_SOCIAL_SEARCH.test(title)) return false;
  // The hot-list collector already paired these exact, manually reviewed
  // headlines with independent coverage of concrete product changes. Do not
  // broaden the generic verb rules: the original page and a separate AI
  // reviewer still have to verify every candidate before publication.
  if (reviewedProductEvent(title, story.topic)) return true;
  return PRODUCT_CHANGE.test(title) && DIRECT_SOCIAL.test(title);
}

export function allowedOriginalUrl(rawUrl, sourceName) {
  const feed = SOURCE_BY_NAME.get(sourceName);
  if (!feed || typeof rawUrl !== "string" || rawUrl.length > 2048 || /[\u0000-\u001f\u007f]/u.test(rawUrl)) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return null;
    if (!feed.hosts.includes(url.hostname.toLowerCase())) return null;
    // Source paths are publisher-controlled, but tracking/fragment aliases
    // should not produce multiple event keys for one article.
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(?:fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

async function boundedFetchText(rawUrl, { fetcher = fetch, allowedHosts, contentType, maxBytes, timeoutMs = SOURCE_TIMEOUT_MS }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let url = rawUrl;
  try {
    for (let redirects = 0; redirects <= 2; redirects += 1) {
      const response = await fetcher(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: contentType === "html" ? "text/html, application/xhtml+xml;q=0.9" : "application/json", "User-Agent": "XiaoLuoDaily/1.0 (+https://xiaoluo-social.pages.dev/)" },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirects === 2) throw new Error("Too many redirects");
        const location = response.headers.get("location");
        if (!location) throw new Error("Redirect without location");
        const next = new URL(location, url);
        if (next.protocol !== "https:" || next.username || next.password || next.port || !allowedHosts.includes(next.hostname.toLowerCase())) throw new Error("Redirect left the publisher");
        url = next.toString();
        continue;
      }
      if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
      if (response.url) {
        const final = new URL(response.url);
        if (final.protocol !== "https:" || !allowedHosts.includes(final.hostname.toLowerCase())) throw new Error("Source left the publisher");
      }
      const type = (response.headers.get("content-type") ?? "").toLowerCase();
      if (contentType === "html" ? !/^(?:text\/html|application\/xhtml\+xml)\b/.test(type) : !/^application\/(?:json|[^;]+\+json)\b/.test(type)) throw new Error("Unexpected source content type");
      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > maxBytes) throw new Error("Source too large");
      if (!response.body) throw new Error("Source body missing");
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) throw new Error("Source too large");
          chunks.push(value);
        }
      } finally {
        if (size > maxBytes) await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return { url, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
    }
    throw new Error("Too many redirects");
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchHotRankings(fetcher = fetch, now = new Date()) {
  const { text } = await boundedFetchText("https://xiaoluo-social.pages.dev/api/hot-list", {
    fetcher, allowedHosts: ["xiaoluo-social.pages.dev"], contentType: "json", maxBytes: MAX_HOT_BYTES, timeoutMs: 6_000,
  });
  const payload = JSON.parse(text);
  if (payload?.status !== "ready" || !Array.isArray(payload.rankings) || payload.rankings.length > 10 || !payload.updatedAt) throw new Error("Hot list is not ready");
  const updatedAt = Date.parse(payload.updatedAt);
  if (!Number.isFinite(updatedAt) || updatedAt > now.getTime() + 5 * 60_000 || now.getTime() - updatedAt > DAY_MS) throw new Error("Hot list snapshot is stale");
  return payload.rankings;
}

function decodeEntities(text) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", hellip: "…" };
  return text.replace(/&(#(?:x[\da-f]+|\d+)|[a-z]+);/giu, (whole, code) => {
    const lowered = code.toLowerCase();
    if (lowered in named) return named[lowered];
    if (!lowered.startsWith("#")) return whole;
    const number = lowered.startsWith("#x") ? Number.parseInt(lowered.slice(2), 16) : Number.parseInt(lowered.slice(1), 10);
    return Number.isInteger(number) && number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : whole;
  });
}

function htmlText(html) {
  return decodeEntities(html
    .replace(/<(?:script|style|noscript|svg|form|nav|aside|footer|header)\b[^>]*>[\s\S]*?<\/\s*(?:script|style|noscript|svg|form|nav|aside|footer|header)\s*>/giu, " ")
    .replace(/<\/?(?:p|h[1-6]|li|div|section|br|blockquote)\b[^>]*>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/[\t\r ]+/gu, " ")
    .replace(/\n\s*/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim()).replace(/\s+/gu, " ");
}

function htmlAttributes(tag) {
  const attributes = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gu)) attributes[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  return attributes;
}

function metaContent(head, names) {
  const values = new Map();
  for (const tag of head.match(/<meta\b[^>]*>/giu) ?? []) {
    const attrs = htmlAttributes(tag);
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop ?? "").toLowerCase();
    if (names.includes(key) && typeof attrs.content === "string" && attrs.content.trim() && !values.has(key)) values.set(key, attrs.content.trim());
  }
  return names.map((name) => values.get(name)).find(Boolean) ?? null;
}

function publishedTimestamp(head) {
  const raw = metaContent(head, ["article:published_time", "article:published", "datepublished", "pubdate", "parsely-pub-date", "date"])
    ?? head.match(/"datePublished"\s*:\s*"([^"]+)"/iu)?.[1]
    ?? htmlAttributes(head.match(/<time\b[^>]*datetime\s*=\s*["'][^"']+["'][^>]*>/iu)?.[0] ?? "").datetime;
  if (!raw) return null;
  const day = canonicalDay(raw);
  if (!day) return null;
  // A publisher that only provides a calendar date has not provided a real
  // clock time. Use UTC noon as a neutral comparison anchor, never the feed's
  // timestamp, so the date is still sourced from the original page.
  const value = /^\d{4}-\d{2}-\d{2}$/u.test(raw) ? `${day}T12:00:00.000Z`
    : /(?:Z|[+-]\d{2}:?\d{2})$/iu.test(raw) ? raw
      : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u.test(raw) ? `${raw}Z` : null;
  const timestamp = value ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function extractArticleEvidence(html) {
  if (typeof html !== "string" || html.length > MAX_ARTICLE_BYTES) return null;
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/iu)?.[1] ?? html.slice(0, 128_000);
  const publishedAt = publishedTimestamp(head);
  const rawTitle = metaContent(head, ["og:title", "twitter:title", "title"])
    ?? head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1]
    ?? html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1];
  const title = rawTitle ? htmlText(rawTitle).replace(/\s*[|–—]\s*[^|–—]{3,50}$/u, "").trim() : "";
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/iu)?.[1]
    ?? html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/iu)?.[1];
  const text = article ? htmlText(article).slice(0, MAX_ARTICLE_TEXT) : "";
  if (!publishedAt || title.length < 15 || title.length > 320 || text.length < 180) return null;
  return { title, publishedAt, text };
}

export async function fetchOriginalArticle(source, { fetcher = fetch, reportDate }) {
  const canonicalUrl = allowedOriginalUrl(source?.url, source?.name);
  const feed = SOURCE_BY_NAME.get(source?.name);
  if (!canonicalUrl || !feed) throw new Error("Untrusted original URL");
  const { url, text } = await boundedFetchText(canonicalUrl, { fetcher, allowedHosts: feed.hosts, contentType: "html", maxBytes: MAX_ARTICLE_BYTES });
  const evidence = extractArticleEvidence(text);
  if (!evidence || !withinDays(evidence.publishedAt, reportDate, 6)) throw new Error("Original has no fresh dated article body");
  return { sourceUrl: url, sourceName: source.name, ...evidence };
}
