import { HOT_FEEDS } from "../shared/hot-list.mjs";
import { fetchHotEventDetail, readHotArticle, reviewHotEventDetail } from "../shared/hot-event-detail.mjs";

const MAX_REQUEST_BYTES = 128 * 1024;
const MAX_ARTICLE_CHARS = 18_000;
const MAX_PDF_BYTES = 2 * 1024 * 1024;
type AiBinding = {
  run(model: string, input: unknown): Promise<unknown>;
  toMarkdown?(file: { name: string; blob: Blob }, options?: { conversionOptions: { pdf: { metadata: boolean; images: { convert: boolean } } } }): Promise<unknown>;
};
type HotDetailEnv = { AI: AiBinding };
type Feed = (typeof HOT_FEEDS)[number];
type Source = { name: string; title?: string; url: string; publishedAt: string; kind: "official" | "media" };
type Story = { id: string; title: string; topic: string; publishedAt: string; sources: Source[] };
type Article = { sourceUrl: string; title: string; text: string; publishedAt: string; contentKind: "article" | "release-notes" };
type Input = { story: Story; articles: Article[] };

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
const date = (value: unknown): value is string => text(value, 80) && /^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:?\d{2}))?$/u.test(value) && Number.isFinite(Date.parse(value));
const feedsByName = new Map<string, Feed>(HOT_FEEDS.map((source) => [source.name, source]));

function sourceUrl(raw: unknown, feed: Feed): string | null {
  if (!text(raw, 2048) || raw !== raw.trim() || /[\u0000-\u0020\u007f]/u.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash
      || !feed.hosts.includes(url.hostname.toLowerCase())) return null;
    if ("format" in feed && feed.format === "apple-lookup" && !url.pathname.endsWith(`/id${feed.appId}`)) return null;
    if (feed.id === "joyy-wire" && !/^\/news-release\/\d{4}\/\d{2}\/\d{2}\/\d+\/23553\/en\/[a-z0-9][a-z0-9-]*\.html$/iu.test(url.pathname)) return null;
    return raw;
  } catch { return null; }
}

function validateInput(value: unknown): Input | null {
  if (!record(value) || !record(value.story)) return null;
  const candidate = value.story;
  if (!text(candidate.title, 320) || !text(candidate.topic, 80) || !date(candidate.publishedAt)
    || !Array.isArray(candidate.sources) || candidate.sources.length < 1 || candidate.sources.length > 3
    || (candidate.id !== undefined && !text(candidate.id, 160))) return null;
  const sources: Source[] = [];
  const seen = new Set<string>();
  for (const raw of candidate.sources) {
    if (!record(raw) || !text(raw.name, 120) || !date(raw.publishedAt)
      || (raw.title !== undefined && !text(raw.title, 320))) return null;
    const feed = feedsByName.get(raw.name);
    const url = feed && sourceUrl(raw.url, feed);
    if (!feed || !url || seen.has(url) || raw.kind !== feed.kind) return null;
    seen.add(url);
    sources.push({ name: feed.name, ...(typeof raw.title === "string" ? { title: raw.title } : {}), url,
      kind: feed.kind === "official" ? "official" : "media", publishedAt: raw.publishedAt });
  }
  const articles: Article[] = [];
  if (value.articles !== undefined) {
    if (!Array.isArray(value.articles) || value.articles.length > sources.length) return null;
    const seenArticles = new Set<string>();
    for (const raw of value.articles) {
      if (!record(raw) || !text(raw.sourceUrl, 2048) || !seen.has(raw.sourceUrl) || seenArticles.has(raw.sourceUrl)
        || !text(raw.title, 320) || !text(raw.text, MAX_ARTICLE_CHARS) || !date(raw.publishedAt)
        || (raw.contentKind !== "article" && raw.contentKind !== "release-notes")) return null;
      const source = sources.find((entry) => entry.url === raw.sourceUrl)!;
      const feed = feedsByName.get(source.name)!;
      // A store's evergreen description cannot be supplied as an article body.
      if (("format" in feed && feed.format === "apple-lookup") !== (raw.contentKind === "release-notes")) return null;
      seenArticles.add(raw.sourceUrl);
      articles.push({ sourceUrl: raw.sourceUrl, title: raw.title, text: raw.text, publishedAt: raw.publishedAt, contentKind: raw.contentKind });
    }
  }
  return {
    story: { id: text(candidate.id, 160) ? candidate.id : "hot-detail", title: candidate.title, topic: candidate.topic, publishedAt: candidate.publishedAt, sources },
    articles,
  };
}

async function readInput(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) throw new RangeError("request_too_large");
  if (!request.body) throw new Error("body_required");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) throw new RangeError("request_too_large");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
}

const json = (value: unknown, status = 200, extraHeaders: Record<string, string> = {}) => Response.json(value, { status, headers: { "cache-control": "no-store", ...extraHeaders } });

function pdfConverter(ai: AiBinding) {
  if (typeof ai?.toMarkdown !== "function") return undefined;
  return async (file: { name: string; blob: Blob }) => {
    if (file.blob.size > MAX_PDF_BYTES) throw new Error("pdf_too_large");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let result: unknown;
    try {
      result = await Promise.race([
        ai.toMarkdown!(file, { conversionOptions: { pdf: { metadata: false, images: { convert: false } } } }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("pdf_conversion_timeout")), 30_000); }),
      ]);
    } finally { clearTimeout(timer); }
    const converted = Array.isArray(result) && result.length === 1 ? result[0] : result;
    if (!record(converted) || converted.format !== "markdown" || typeof converted.data !== "string"
      || !converted.data.trim() || converted.data.length > MAX_PDF_BYTES) throw new Error("pdf_conversion_unavailable");
    return converted.data;
  };
}

function pdfSource(value: unknown): { name: string; url: string; publishedAt: string } | null {
  if (!record(value) || !record(value.source)) return null;
  const source = value.source;
  const feed = HOT_FEEDS.find((entry) => entry.id === "newborn-ir")!;
  const url = sourceUrl(source.url, feed);
  if (source.name !== feed.name || !url || !date(source.publishedAt)) return null;
  const parsed = new URL(url);
  if (parsed.search || !/^\/listedco\/listconews\/sehk\/\d{4}\/\d{4}\/\d{8,}\.pdf$/iu.test(parsed.pathname)) return null;
  return { name: feed.name, url, publishedAt: source.publishedAt };
}

/** This Worker has no public route: only same-account service bindings invoke
 * /detail, /review or /article. Hostname remains unrestricted for previews. */
export function createHotDetailService({ fetcher = fetch, now = () => new Date() }: { fetcher?: typeof fetch; now?: () => Date } = {}) {
  return async function handle(request: Request, env: HotDetailEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path !== "/detail" && path !== "/review" && path !== "/article") return json({ error: "not_found" }, 404);
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, { allow: "POST" });
    if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? "")) return json({ error: "json_required" }, 415);
    let input: Input | null = null;
    let articleSource: { name: string; url: string; publishedAt: string } | null = null;
    let proposedDetail: Record<string, unknown> | undefined;
    try {
      const value = await readInput(request);
      if (path === "/article") articleSource = pdfSource(value);
      input = validateInput(value);
      if (path === "/review") {
        const proposal = record(value) ? value.proposedDetail : null;
        if (!input || !record(proposal) || proposal.status !== "ready"
          || !input.story.sources.some((source) => source.url === proposal.sourceUrl)) return json({ error: "invalid_detail_request" }, 400);
        proposedDetail = proposal;
      }
    }
    catch (error) { return json({ error: error instanceof RangeError ? "request_too_large" : "invalid_detail_request" }, error instanceof RangeError ? 413 : 400); }
    if (path === "/article") {
      if (!articleSource) return json({ error: "invalid_article_request" }, 400);
      const converter = pdfConverter(env.AI);
      if (!converter) return json({ status: "unavailable", reason: "pdf_conversion_unavailable" }, 503);
      try {
        const article = await readHotArticle(articleSource.url, { fetcher, allowedHosts: ["www1.hkexnews.hk"], timeoutMs: 40_000, maxBytes: MAX_PDF_BYTES,
          source: { name: articleSource.name, publishedAt: articleSource.publishedAt }, pdfConverter: converter });
        return json(article);
      } catch { return json({ status: "unavailable", reason: "pdf_article_unavailable" }, 422); }
    }
    if (!input) return json({ error: "invalid_detail_request" }, 400);
    const articleCache = new Map(input.articles.map((article) => [article.sourceUrl, article]));
    try {
      const hasIssuerPdf = input.story.sources.some((source) => feedsByName.get(source.name)?.id === "newborn-ir" && /\.pdf$/iu.test(new URL(source.url).pathname));
      const options = { ai: env.AI, fetcher, articleCache, now: now(), timeoutMs: hasIssuerPdf ? 40_000 : 8_000, aiTimeoutMs: 25_000, maxSources: 2, pdfConverter: pdfConverter(env.AI) };
      const detail = path === "/review"
        ? await reviewHotEventDetail(input.story, proposedDetail, options)
        : await fetchHotEventDetail(input.story, options);
      return json(detail);
    } catch { return json({ status: "unavailable", reason: "detail_service_unavailable" }, 503); }
  };
}

export default { fetch: createHotDetailService() };
