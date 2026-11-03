import { HOT_FEEDS } from "../shared/hot-list.mjs";
import { fetchHotEventDetail, readHotArticle } from "../shared/hot-event-detail.mjs";
import { validHotDetail, type FeedItem, type HotPayload } from "./hot-list";
import type { HotIncrementalSession } from "./hot-incremental";

type Article = { sourceUrl: string; title: string; text: string; publishedAt?: string; contentKind?: string };
type AiBinding = { run: (model: string, input: unknown) => Promise<unknown> };
export type HotAi = AiBinding;
export type HotDetailService = { fetch: (request: Request) => Promise<Response> };
export type ArticleCache = Map<string, Promise<Article> | Article>;
const DAY = 86_400_000;

async function concurrentMap<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await task(items[index]);
    }
  }));
  return output;
}

/** Read a bounded set of original core-company reports before title filtering.
 * Product release notes and publisher-owned JSON article bodies are already
 * first-party originals; RSS descriptions alone never qualify as full text. */
export async function prepareHotArticles(items: FeedItem[], {
  fetcher = fetch, now = Date.now(), articleCache = new Map(), detailService,
}: { fetcher?: typeof fetch; now?: number; articleCache?: ArticleCache; detailService?: HotDetailService } = {}): Promise<FeedItem[]> {
  const sources = new Map(HOT_FEEDS.map((source) => [source.id, source]));
  for (const item of items) {
    if (item.contentText && ["article", "release-notes"].includes(item.contentKind ?? "")) {
      articleCache.set(item.url, {
        sourceUrl: item.url, title: item.title, text: item.contentText.slice(0, 18_000), publishedAt: item.publishedAt,
        contentKind: item.contentKind,
      });
    }
  }
  const candidates = items.filter((item) => {
    const source = sources.get(item.sourceId);
    const at = Date.parse(item.publishedAt);
    return source?.kind === "official" && ["joyy", "yalla", "newborn-town"].includes(source.owner)
      && !articleCache.has(item.url) && Number.isFinite(at) && at <= now && now - at <= 90 * DAY
      && !/\b(?:to (?:announce|report)|repurchase|buyback|dividend|annual general meeting)\b|回购|股息|董事会|股份变动/iu.test(item.title)
      && /\b(?:results|financial|earnings|social|voice|chat|live|mico|yoho|sugo|toptop)\b|财报|业绩|社交|语聊|直播/iu.test(item.title);
  }).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 8);
  const read = new Map(await concurrentMap(candidates, 3, async (item) => {
    const source = sources.get(item.sourceId)!;
    try {
      const pending = source.id === "newborn-ir" && /\.pdf$/iu.test(new URL(item.url).pathname)
        ? (async () => {
          if (!detailService?.fetch) throw new Error("pdf_article_service_unavailable");
          const response = await detailService.fetch(new Request("https://hot-detail.internal/article", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: { name: source.name, url: item.url, publishedAt: item.publishedAt } }) }));
          if (!response.ok) throw new Error(`pdf_article_service_http_${response.status}`);
          const article = await response.json() as Article;
          if (article.sourceUrl !== item.url || typeof article.title !== "string" || article.title.length < 8 || article.title.length > 320
            || typeof article.text !== "string" || article.text.length < 180 || article.text.length > 18_000 || article.contentKind !== "article") throw new Error("invalid_pdf_article_result");
          return article;
        })()
        : readHotArticle(item.url, { fetcher, allowedHosts: source.hosts, timeoutMs: 8_000 });
      articleCache.set(item.url, pending);
      const article = await pending;
      const sourceAt = Date.parse(item.publishedAt);
      const articleAt = Date.parse(article.publishedAt ?? "");
      if (!Number.isFinite(articleAt) || articleAt > now || Math.abs(sourceAt - articleAt) > 36 * 60 * 60_000) {
        console.warn("hot-list core original unavailable", source.id, "original_date_mismatch");
        articleCache.delete(item.url);
        return [item.url, null] as const;
      }
      return [item.url, article] as const;
    } catch (error) {
      console.warn("hot-list core original unavailable", source.id, error instanceof Error ? error.message.slice(0, 160) : "article_unavailable");
      articleCache.delete(item.url);
      return [item.url, null] as const;
    }
  }));
  return items.map((item) => {
    const article = read.get(item.url);
    return article ? { ...item, contentText: article.text, contentKind: "article" } : item;
  });
}

/** This runs in the scheduled publisher, never in the public page request. */
export async function enrichHotPayload(payload: HotPayload, {
  fetcher = fetch, ai, detailService, now = Date.now(), articleCache = new Map(), incremental,
}: { fetcher?: typeof fetch; ai?: HotAi; detailService?: HotDetailService; now?: number; articleCache?: ArticleCache; incremental?: HotIncrementalSession } = {}): Promise<HotPayload> {
  if (!ai?.run && !detailService?.fetch) return payload;
  const rankings = await concurrentMap(payload.rankings, incremental ? 1 : 3, async (story) => {
    let detail;
    try {
      const articles = (await Promise.all(story.sources.slice(0, 2).map(async (source: { url: string; name: string }) => {
        try {
          if (incremental && !articleCache.has(source.url)) {
            const feed = HOT_FEEDS.find((feed) => feed.name === source.name);
            if (!feed || /\.pdf$/iu.test(new URL(source.url).pathname)) return null;
            articleCache.set(source.url, readHotArticle(source.url, { fetcher, allowedHosts: feed.hosts, timeoutMs: 8_000 }));
          }
          const cached = await articleCache.get(source.url);
          return cached ? { ...cached, sourceUrl: source.url, contentKind: cached.contentKind ?? "article" } : null;
        } catch { return null; }
      }))).filter((article): article is Article => article !== null);
      // Fingerprint and AI must use the very same originals, not a child-side
      // fallback article that was never compared with the cache.
      const processingStory = { ...story, sources: incremental
        ? story.sources.filter((source: { url: string }) => articles.some((article) => article.sourceUrl === source.url))
        : story.sources.slice(0, 3) };
      const run = async () => {
      if (detailService?.fetch) {
        const response = await detailService.fetch(new Request("https://hot-detail.internal/detail", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ story: processingStory, articles }),
        }));
        if (!response.ok) throw new Error(`detail_service_http_${response.status}`);
        const result = await response.json() as import("./hot-list").HotDetail;
        if (!validHotDetail(result, story.sources, now)) throw new Error("invalid_detail_result");
        return result;
      } else {
        return fetchHotEventDetail(processingStory, {
          fetcher, ai, now: new Date(now), articleCache, timeoutMs: 8_000, aiTimeoutMs: 25_000, maxSources: 2,
        });
      }
      };
      detail = incremental ? await incremental.process(story, articles, run) : await run();
    } catch (error) {
      console.warn("hot-list detail unavailable", story.id, error instanceof Error ? error.message.slice(0, 180) : "detail_service_unavailable");
      detail = { status: "unavailable" as const, reason: error instanceof Error ? error.message.slice(0, 240) : "detail_service_unavailable" };
    }
    if (detail.status === "unavailable" && (!incremental || detail.reason === "original_unreadable")
      && story.detail?.status === "ready" && validHotDetail(story.detail, story.sources, now)) {
      return { ...story, detail: { ...story.detail, retained: true } };
    }
    return { ...story, detail };
  });
  return { ...payload, rankings };
}
