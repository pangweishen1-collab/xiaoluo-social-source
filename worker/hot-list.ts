import { buildHotList, HOT_FEEDS, PREVIOUSLY_REVIEWED_EVENT, parseAppStoreLookupJson, parseBigoNewsHtml, parseJoyyWireHtml, parseNewbornDisclosuresJson, parseNewbornNewsJson, parseRssFeed, RANKING_ARCHIVE_WINDOW_MS } from "../shared/hot-list.mjs";

const CACHE_MS = 5 * 60 * 1000;
const EDGE_CACHE_MS = 5 * 60 * 1000;
const DURABLE_SNAPSHOT_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 30 * 1000;
const FETCH_TIMEOUT_MS = 8 * 1000;
const MAX_FEED_BYTES = 256 * 1024;
const HOT_LIST_METHOD_VERSION = 9;
const LEGACY_HOT_LIST_METHOD_VERSIONS = new Set([7, 8]);

type FeedSource = (typeof HOT_FEEDS)[number];
export type FeedItem = { sourceId: string; title: string; url: string; publishedAt: string; category?: string; contentText?: string; contentKind?: string; productTopic?: string; version?: string };
type SavedSource = { name: string; title?: string; url: string; publishedAt: string; category?: string };
export type HotDetail = {
  status: "ready" | "unavailable" | "rejected";
  titleZh?: string;
  change?: string;
  whyItMatters?: string;
  evidenceQuote?: string;
  sourceUrl?: string;
  sourceName?: string;
  sourcePublishedAt?: string;
  sourceTitle?: string;
  sourceFeedPublishedAt?: string;
  verifiedAt?: string;
  reason?: string;
  retained?: boolean;
};
export type RankedHotEvent = ReturnType<typeof buildHotList>["rankings"][number] & { detail?: HotDetail };
type SourceResult = { sourceId: string; items: FeedItem[]; ok: boolean };
export type HotPayload = {
  methodVersion: number;
  usedSavedSnapshot?: boolean;
  snapshotStale?: boolean;
  updatedAt: string | null;
  windowHours: 48;
  rankingWindowHours: 168;
  fallbackWindowHours: 2160;
  stories: ReturnType<typeof buildHotList>["stories"];
  leads: ReturnType<typeof buildHotList>["leads"];
  rankings: RankedHotEvent[];
  sources: Array<{ name: string; url: string; kind: string }>;
  status: "ready" | "empty" | "unavailable";
  stale: boolean;
  failedSources: string[];
};
type Snapshot = { payload: HotPayload; bySource: Map<string, FeedItem[]> };
type HotSnapshotRow = { updated_at: string; payload_json: string };

const publicSources = HOT_FEEDS.map(({ name, url, displayUrl, kind }) => ({ name, url: displayUrl ?? url, kind }));
const feedsByName = new Map(HOT_FEEDS.map((source) => [source.name, source]));

function snapshotDate(value: unknown, at: number): number | null {
  if (typeof value !== "string") return null;
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!dayOnly && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  // Official date-only notices describe a Beijing calendar day, not UTC midnight.
  const time = Date.parse(dayOnly ? `${value}T00:00:00+08:00` : value);
  if (!Number.isFinite(time) || time > at || at - time > RANKING_ARCHIVE_WINDOW_MS) return null;
  const canonical = new Date(time + (dayOnly ? 8 * 60 * 60 * 1000 : 0)).toISOString();
  return (dayOnly ? canonical.slice(0, 10) : canonical) === value ? time : null;
}

function validSnapshotSource(source: SavedSource & { kind?: string }, at: number): boolean {
  const feed = typeof source?.name === "string" ? feedsByName.get(source.name) : undefined;
  if (!feed || source.kind !== feed.kind || snapshotDate(source.publishedAt, at) === null
    || (source.category !== undefined && typeof source.category !== "string")
    || (source.title !== undefined && (typeof source.title !== "string" || source.title.length > 320))
    || typeof source.url !== "string" || source.url.length > 2048 || /[\u0000-\u001f\u007f]/.test(source.url)) return false;
  try {
    const url = new URL(source.url);
    if ("appId" in feed && !new RegExp(`/id${feed.appId}$`).test(url.pathname)) return false;
    if (feed.id === "joyy-wire" && !/^\/news-release\/\d{4}\/\d{2}\/\d{2}\/\d+\/23553\/en\/[a-z0-9][a-z0-9-]*\.html$/i.test(url.pathname)) return false;
    for (const key of url.searchParams.keys()) {
      if (key.toLowerCase().startsWith("utm_") || ["fbclid", "gclid", "mc_cid", "mc_eid"].includes(key.toLowerCase())) return false;
    }
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash
      && url.toString() === source.url && feed.hosts.includes(url.hostname.toLowerCase());
  } catch { return false; }
}

export function parseHotSnapshotRow(row: HotSnapshotRow | null, at: number, allowLegacyVersion = false): HotPayload | null {
  if (!row) return null;
  try {
    const payload = JSON.parse(row.payload_json) as HotPayload;
    const updated = Date.parse(row.updated_at);
    if (!Number.isFinite(updated) || updated > at || at - updated > RANKING_ARCHIVE_WINDOW_MS
      || new Date(updated).toISOString() !== row.updated_at
      || (payload?.methodVersion !== HOT_LIST_METHOD_VERSION
        && !(allowLegacyVersion && LEGACY_HOT_LIST_METHOD_VERSIONS.has(payload?.methodVersion)))
      || payload.updatedAt !== row.updated_at || (payload.status !== "ready" && payload.status !== "empty")
      || !Array.isArray(payload.rankings) || payload.rankings.length > 10
      || !Array.isArray(payload.stories) || !Array.isArray(payload.leads) || !Array.isArray(payload.sources)
      || (payload.status === "ready") !== (payload.rankings.length > 0)) return null;
    const seenIds = new Set<string>();
    const seenUrls = new Set<string>();
    if (!payload.rankings.every((entry, index) => {
      if (!entry || entry.rank !== index + 1 || typeof entry.id !== "string" || !entry.id
        || seenIds.has(entry.id) || typeof entry.title !== "string" || !entry.title.trim()
        || typeof entry.topic !== "string" || !entry.topic.trim()
        || (entry.titleZh != null && typeof entry.titleZh !== "string")
        || !Array.isArray(entry.sources) || entry.sources.length === 0 || entry.sources.length > HOT_FEEDS.length
        || entry.sourceCount !== entry.sources.length
        || entry.verification !== (entry.sources.length >= 2 ? "multi-source" : "single-source")
        || ![null, 30, 90].includes(entry.backfillWindowDays ?? null)) return false;
      if (entry.detail && !validHotDetail(entry.detail, entry.sources, at)) return false;
      const publishedAt = snapshotDate(entry.publishedAt, at);
      if (publishedAt === null) return false;
      seenIds.add(entry.id);
      const sourceDates: number[] = [];
      const owners = new Set<string>();
      for (const source of entry.sources) {
        if (!validSnapshotSource(source, at) || seenUrls.has(source.url)) return false;
        const owner = feedsByName.get(source.name)!.owner;
        if (owners.has(owner)) return false;
        owners.add(owner);
        seenUrls.add(source.url);
        sourceDates.push(snapshotDate(source.publishedAt, at)!);
      }
      return publishedAt === Math.max(...sourceDates);
    })) return null;
    return payload;
  } catch { return null; }
}

/** Re-rank saved original links against today's date; the 90-day boundary still applies. */
export function mergeSavedHotList(current: HotPayload, saved: HotPayload | null, at: number, preparedItems?: FeedItem[]): HotPayload {
  if (!saved) return current;
  const restoredCurrent = { ...current, rankings: restoreHotDetails(current.rankings, saved.rankings, at) };
  const sourcesByName = new Map(HOT_FEEDS.map((source) => [source.name, source.id]));
  const currentUrls = new Set(current.rankings.flatMap((story) => story.sources.map((source: SavedSource) => source.url)));
  const preparedByUrl = new Map(preparedItems?.map((item) => [item.url, item]));
  const raw = [...current.rankings, ...saved.rankings].flatMap((story) => story.sources.flatMap((source: SavedSource) => {
    const sourceId = sourcesByName.get(source.name);
    const ready = story.detail?.status === "ready" && validHotDetail(story.detail, story.sources, at);
    const original = preparedByUrl.get(source.url);
    return sourceId && typeof source.url === "string" && typeof source.publishedAt === "string"
      ? [{ ...(original ?? {}), sourceId, title: source.title || story.title, url: source.url, publishedAt: source.publishedAt, category: source.category,
          ...(ready && story.detail?.sourceUrl === source.url ? { [PREVIOUSLY_REVIEWED_EVENT]: true } : {}) }]
      : [];
  }));
  const merged = buildHotList(raw, new Date(at));
  if (merged.rankings.length < current.rankings.length
    || !merged.rankings.some((story) => story.sources.some((source: SavedSource) => !currentUrls.has(source.url)))) return restoredCurrent;
  return {
    ...current,
    stories: merged.stories,
    leads: merged.leads,
    rankings: restoreHotDetails(merged.rankings, [...current.rankings, ...saved.rankings], at),
    status: current.status === "unavailable" ? "unavailable" : "ready",
    updatedAt: current.status === "unavailable" ? saved.updatedAt : current.updatedAt,
    stale: true,
    usedSavedSnapshot: true,
  };
}

export function validHotDetail(detail: HotDetail, sources: SavedSource[], at = Date.now()): boolean {
  if (!detail || !["ready", "unavailable", "rejected"].includes(detail.status)) return false;
  if (detail.status !== "ready") return true;
  const source = sources.find((item) => item.url === detail.sourceUrl && item.name === detail.sourceName);
  const verifiedAt = Date.parse(detail.verifiedAt ?? "");
  const originalAt = Date.parse(detail.sourcePublishedAt ?? "");
  return !!source && detail.sourceTitle === source.title && detail.sourceFeedPublishedAt === source.publishedAt
    && Number.isFinite(verifiedAt) && verifiedAt <= at + 300_000 && at - verifiedAt <= RANKING_ARCHIVE_WINDOW_MS
    && Number.isFinite(originalAt) && originalAt <= at + 300_000
    && Math.abs(Date.parse(source.publishedAt) - originalAt) <= 36 * 60 * 60_000
    && typeof detail.titleZh === "string" && /[\u3400-\u9fff]/.test(detail.titleZh) && detail.titleZh.length <= 160
    && typeof detail.change === "string" && detail.change.length >= 12 && detail.change.length <= 600
    && typeof detail.whyItMatters === "string" && detail.whyItMatters.length >= 12 && detail.whyItMatters.length <= 500
    && typeof detail.evidenceQuote === "string" && detail.evidenceQuote.length >= 18 && detail.evidenceQuote.length <= 500
    && typeof detail.sourceUrl === "string" && sources.some((source) => source.url === detail.sourceUrl)
    && typeof detail.verifiedAt === "string";
}

function restoreHotDetails(rankings: RankedHotEvent[], previous: RankedHotEvent[], at: number): RankedHotEvent[] {
  return rankings.map((story) => {
    const earlier = previous.find((entry) => entry.detail?.status === "ready"
      && story.sources.some((source: SavedSource) => source.url === entry.detail!.sourceUrl
        && source.title === entry.detail!.sourceTitle && source.publishedAt === entry.detail!.sourceFeedPublishedAt)
      && validHotDetail(entry.detail!, story.sources, at));
    return earlier ? { ...story, detail: earlier.detail } : story;
  });
}

async function limitedText(response: Response, maxBytes: number) {
  const declaredLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error("Feed too large");
  if (!response.body) throw new Error("Feed body missing");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new Error("Feed too large");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
}

async function fetchSource(source: FeedSource, fetcher: typeof fetch, timeoutMs: number): Promise<SourceResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("Feed timed out")); }, timeoutMs);
  });
  try {
    const items = await Promise.race([
      (async () => {
        let url = source.url;
        let response: Response | undefined;
        const format = "format" in source ? source.format : "rss";
        const feedHosts: readonly string[] = "feedHosts" in source && source.feedHosts ? source.feedHosts : source.hosts;
        for (let redirects = 0; redirects < 3; redirects += 1) {
          response = await fetcher(url, {
            signal: controller.signal,
            redirect: "manual",
            headers: {
              Accept: format === "bigo-html" || format === "globe-company-html" ? "text/html" : format === "newborn-json" || format === "newborn-news-json" || format === "apple-lookup" ? "application/json" : "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
            },
          });
          if (![301, 302, 303, 307, 308].includes(response.status)) break;
          const location = response.headers.get("Location");
          if (!location) throw new Error("Feed redirect missing location");
          const next = new URL(location, url);
          if (next.protocol !== "https:" || next.username || next.password || next.port || !feedHosts.includes(next.hostname.toLowerCase())) {
            throw new Error("Feed redirected outside its publisher");
          }
          url = next.toString();
          response = undefined;
        }
        if (!response) throw new Error("Too many feed redirects");
        if (!response.ok) throw new Error(`Feed HTTP ${response.status}`);
        if (response.url) {
          const finalUrl = new URL(response.url);
          if (finalUrl.protocol !== "https:" || !feedHosts.includes(finalUrl.hostname.toLowerCase())) throw new Error("Feed redirected outside its publisher");
        }
        const body = await limitedText(response, "maxBytes" in source && source.maxBytes ? source.maxBytes : MAX_FEED_BYTES);
        const parsed = format === "bigo-html" ? parseBigoNewsHtml(body)
          : format === "globe-company-html" ? parseJoyyWireHtml(body)
          : format === "newborn-json" ? parseNewbornDisclosuresJson(body)
            : format === "newborn-news-json" ? parseNewbornNewsJson(body)
              : format === "apple-lookup" ? parseAppStoreLookupJson(body, source)
            : parseRssFeed(body);
        return parsed.map((item: Omit<FeedItem, "sourceId">) => ({ ...item, sourceId: source.id }));
      })(),
      timeout,
    ]);
    return { sourceId: source.id, items, ok: true };
  } catch (error) {
    console.warn("hot-list source unavailable", source.id, error instanceof Error ? error.message.slice(0, 180) : "source_read_failed");
    return { sourceId: source.id, items: [], ok: false };
  } finally {
    clearTimeout(timer);
  }
}

function unavailable(previous: Snapshot | undefined, at: number): Snapshot {
  const current = previous ? buildHotList([...previous.bySource.values()].flat(), new Date(at)) : { stories: [], leads: [], rankings: [] };
  return {
    payload: {
      methodVersion: HOT_LIST_METHOD_VERSION,
      updatedAt: previous?.payload.updatedAt ?? null, windowHours: 48, rankingWindowHours: 168, fallbackWindowHours: 2160,
      stories: current.stories, leads: current.leads, rankings: current.rankings, sources: publicSources,
      status: "unavailable", stale: Boolean(previous), failedSources: HOT_FEEDS.map((source) => source.name),
    },
    bySource: previous?.bySource ?? new Map(),
  };
}

/** A factory makes the five-minute warm-isolate cache testable without affecting production callers. */
export function createHotListHandler({
  fetcher = fetch,
  now = () => Date.now(),
  timeoutMs = FETCH_TIMEOUT_MS,
  prepareItems,
}: { fetcher?: typeof fetch; now?: () => number; timeoutMs?: number; prepareItems?: (items: FeedItem[]) => Promise<FeedItem[]> } = {}) {
  let snapshot: Snapshot | null = null;
  let expiresAt = 0;
  let inFlight: Promise<Snapshot> | null = null;

  async function refresh(at: number): Promise<Snapshot> {
    // A bounded queue avoids starting 22 independent timeout clocks while the
    // runtime is still waiting for its available outbound connections.
    const results: SourceResult[] = [];
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, HOT_FEEDS.length) }, async () => {
      while (cursor < HOT_FEEDS.length) {
        const index = cursor++;
        results[index] = await fetchSource(HOT_FEEDS[index], fetcher, timeoutMs);
      }
    }));
    // A previously populated feed suddenly returning no items is not evidence
    // that its earlier, dated articles vanished. Retain only their real links;
    // buildHotList still expires each one at the 90-day boundary.
    const failed = results.filter((result) => !result.ok
      || (result.items.length === 0 && (snapshot?.bySource.get(result.sourceId)?.length ?? 0) > 0));
    const failedIds = new Set(failed.map((result) => result.sourceId));
    const succeeded = results.length - failed.length;
    if (succeeded === 0) return unavailable(snapshot ?? undefined, at);
    const bySource = new Map<string, FeedItem[]>();
    for (const result of results) {
      bySource.set(result.sourceId, failedIds.has(result.sourceId) ? snapshot?.bySource.get(result.sourceId) ?? [] : result.items);
    }
    const allItems = [...bySource.values()].flat();
    const prepared = prepareItems ? await prepareItems(allItems) : allItems;
    for (const source of HOT_FEEDS) bySource.set(source.id, prepared.filter((item) => item.sourceId === source.id));
    const { stories, leads, rankings } = buildHotList(prepared, new Date(at));
    return {
      payload: {
        methodVersion: HOT_LIST_METHOD_VERSION,
        updatedAt: new Date(at).toISOString(), windowHours: 48, rankingWindowHours: 168, fallbackWindowHours: 2160,
        stories, leads, rankings, sources: publicSources,
        status: rankings.length ? "ready" : "empty",
        stale: failed.length > 0,
        failedSources: failed.map((result) => HOT_FEEDS.find((source) => source.id === result.sourceId)!.name),
      },
      bySource,
    };
  }

  return async function handle(request: Request): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const at = now();
    if (!snapshot || at >= expiresAt) {
      inFlight ??= refresh(at).catch(() => unavailable(snapshot ?? undefined, at)).then((next) => {
        snapshot = next;
        expiresAt = at + (next.payload.status === "unavailable" ? RETRY_MS : CACHE_MS);
        return next;
      }).finally(() => { inFlight = null; });
      await inFlight;
    }
    const payload = snapshot!.payload;
    return new Response(request.method === "HEAD" ? null : JSON.stringify(payload), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": payload.status === "unavailable" ? "no-store" : "public, max-age=60, must-revalidate",
      },
    });
  };
}

export const handleHotList = createHotListHandler();

type HotSnapshotDatabase = Pick<D1Database, "prepare">;

/** Prefer the scheduled D1 snapshot; fall back to the existing live fetch when it is absent or too old. */
export async function handleDurableHotList(
  request: Request,
  {
    db,
    cache,
    waitUntil,
    handler = handleHotList,
    now = () => Date.now(),
  }: {
    db?: HotSnapshotDatabase;
    cache?: Pick<Cache, "match" | "put">;
    waitUntil?: (promise: Promise<void>) => void;
    handler?: (request: Request) => Promise<Response>;
    now?: () => number;
  } = {},
): Promise<Response> {
  const readOrFetch = async (incoming: Request) => {
    let saved: HotPayload | null = null;
    if (db && (incoming.method === "GET" || incoming.method === "HEAD")) {
      try {
        const row = await db.prepare("SELECT updated_at, payload_json FROM hot_list_snapshot WHERE id = 1")
          .first<HotSnapshotRow>();
        saved = parseHotSnapshotRow(row, now());
        const fullyReviewed = saved && saved.rankings.length > 0 && saved.rankings.every((story) => story.detail?.status === "ready");
        const fresh = saved && now() - Date.parse(saved.updatedAt!) < DURABLE_SNAPSHOT_MS;
        // The public endpoint cannot perform AI review. A short or delayed
        // verified edition must not be replaced by ten headline-only results.
        if (saved && (fullyReviewed || (saved.rankings.length >= 10 && fresh))) {
          const served = !fresh ? { ...saved, stale: true, snapshotStale: true } : saved;
          return new Response(incoming.method === "HEAD" ? null : JSON.stringify(served), {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "public, max-age=60, must-revalidate",
            },
          });
        }
        // Previous-method links are never served as-is. They may only be
        // revalidated and re-ranked together with a fresh crawl below.
        saved ??= parseHotSnapshotRow(row, now(), true);
      } catch {
        // An unapplied migration or transient D1 outage must not take down the ranking.
      }
    }
    const live = await handler(incoming);
    if (!saved || incoming.method !== "GET" || !live.ok) return live;
    try {
      const payload = await live.clone().json() as HotPayload;
      if (payload.methodVersion !== HOT_LIST_METHOD_VERSION || !Array.isArray(payload.rankings)) return live;
      const merged = mergeSavedHotList(payload, saved, now());
      if (merged === payload) return live;
      return new Response(JSON.stringify(merged), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": merged.status === "unavailable" ? "no-store" : "public, max-age=60, must-revalidate",
        },
      });
    } catch { return live; }
  };
  return handleEdgeCachedHotList(request, { cache, waitUntil, handler: readOrFetch });
}

/** Share successful snapshots across Worker isolates in the same Cloudflare cache region. */
export async function handleEdgeCachedHotList(
  request: Request,
  {
    cache,
    waitUntil,
    handler = handleHotList,
  }: {
    cache?: Pick<Cache, "match" | "put">;
    waitUntil?: (promise: Promise<void>) => void;
    handler?: (request: Request) => Promise<Response>;
  } = {},
): Promise<Response> {
  if (request.method !== "GET" || !cache) return handler(request);

  // A versioned, query-independent key keeps cache behavior predictable if the
  // public endpoint receives tracking parameters or its payload shape changes.
  const key = new Request(new URL("/api/hot-list?edge-cache=v9", request.url));
  try {
    const cached = await cache.match(key);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("Cache-Control", "public, max-age=60, must-revalidate");
      return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers });
    }
  } catch {
    // A cache outage must not stop live public feeds from loading.
  }

  const response = await handler(request);
  if (response.ok && !response.headers.get("Cache-Control")?.includes("no-store")) {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", `public, max-age=${EDGE_CACHE_MS / 1000}`);
    const stored = new Response(response.clone().body, { status: response.status, statusText: response.statusText, headers });
    const write = cache.put(key, stored).catch(() => undefined);
    if (waitUntil) waitUntil(write);
    else await write;
  }
  return response;
}
