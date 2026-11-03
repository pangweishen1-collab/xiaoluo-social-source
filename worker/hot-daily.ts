import { buildHotList, HOT_FEEDS, PREVIOUSLY_REVIEWED_EVENT } from "../shared/hot-list.mjs";
import { createHotListHandler, mergeSavedHotList, parseHotSnapshotRow, validHotDetail, type HotPayload, type FeedItem, type RankedHotEvent } from "./hot-list";
import { enrichHotPayload, prepareHotArticles, type HotAi, type HotDetailService, type ArticleCache } from "./hot-enrichment";
import { HotIncrementalSession, hotProcessingRepository, type HotProcessingRepository } from "./hot-incremental";

const MAX_SNAPSHOT_BYTES = 512 * 1024;
const MAX_VERIFIED_EVENT_ATTEMPTS = 20;

type SnapshotDatabase = Pick<D1Database, "prepare">;
type DailyGenerator = { fetch(request: Request): Promise<Response> };
type HotDiagnostic = { id: string; title: string; status: string; reason?: string };
type RankingSource = { name: string; title?: string; url: string; publishedAt: string; category?: string };
type CollectOptions = { fetcher?: typeof fetch; now?: () => number; ai?: HotAi; detailService?: HotDetailService;
  onDiagnostic?: (result: HotDiagnostic) => void; onProcessingStats?: (stats: HotIncrementalSession["stats"]) => void;
  processingRepository?: HotProcessingRepository; maxNewEvents?: number };

const HOT_LIST_CRON = "0 0 * * *";
const DAILY_BACKUP_CRON = "15 3 * * *";

function beijingDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

const originalTitleKey = (title: string) => title.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Keep the already collected originals available beyond buildHotList's first
 * ten places. Cached verified events get only a process-local eligibility mark;
 * a short evidence quote never becomes a substitute article body. */
function reserveOriginals(prepared: FeedItem[], saved: HotPayload | null, at: number): FeedItem[] {
  const sourcesByName = new Map(HOT_FEEDS.map((source) => [source.name, source.id]));
  const byUrl = new Map(prepared.map((item) => [item.url, item]));
  for (const story of saved?.rankings ?? []) {
    const reviewed = story.detail?.status === "ready" && validHotDetail(story.detail, story.sources, at);
    for (const source of story.sources) {
      const sourceId = sourcesByName.get(source.name);
      if (!sourceId) continue;
      const existing = byUrl.get(source.url);
      if (existing) {
        if (reviewed && story.detail?.sourceUrl === source.url && existing.sourceId === sourceId
          && existing.title === (source.title || story.title)
          && (existing.publishedAt === source.publishedAt || Date.parse(existing.publishedAt) === Date.parse(source.publishedAt))) {
          const restored = { ...existing, [PREVIOUSLY_REVIEWED_EVENT]: true };
          byUrl.set(source.url, restored);
        }
        continue;
      }
      byUrl.set(source.url, { sourceId, title: source.title || story.title, url: source.url, publishedAt: source.publishedAt, category: source.category,
        ...(reviewed && story.detail?.sourceUrl === source.url ? { [PREVIOUSLY_REVIEWED_EVENT]: true } : {}),
      });
    }
  }
  return [...byUrl.values()];
}

function restoreReviewedDetail(story: RankedHotEvent, saved: HotPayload | null, at: number): RankedHotEvent {
  const previous = saved?.rankings.find((entry) => entry.detail?.status === "ready"
    && story.sources.some((source: RankingSource) => source.url === entry.detail!.sourceUrl && source.title === entry.detail!.sourceTitle
      && source.publishedAt === entry.detail!.sourceFeedPublishedAt)
    && validHotDetail(entry.detail!, story.sources, at));
  return previous ? { ...story, detail: previous.detail } : story;
}

async function verifiedRanking(payload: HotPayload, prepared: FeedItem[], saved: HotPayload | null,
  options: { fetcher: typeof fetch; ai?: HotAi; detailService?: HotDetailService; now: number; articleCache: ArticleCache; onDiagnostic?: (result: HotDiagnostic) => void; incremental?: HotIncrementalSession }): Promise<HotPayload> {
  const accepted: RankedHotEvent[] = [];
  const observed: RankedHotEvent[] = [];
  const attemptedUrls = new Set<string>();
  const attemptedTitles = new Set<string>();
  const reserve = reserveOriginals(prepared, saved, options.now);
  let attempts = 0;
  let batch = payload.rankings;
  // Every pass consumes at least one new original URL, and the separate attempt
  // ceiling bounds original reads and AI reviews even when all candidates fail.
  for (let pass = 0; pass < MAX_VERIFIED_EVENT_ATTEMPTS && batch.length && accepted.length < 10 && attempts < MAX_VERIFIED_EVENT_ATTEMPTS; pass += 1) {
    const remaining = Math.min(10 - accepted.length, MAX_VERIFIED_EVENT_ATTEMPTS - attempts);
    batch = batch.slice(0, remaining);
    for (const story of batch) {
      attemptedTitles.add(originalTitleKey(story.title));
      for (const source of story.sources) {
        attemptedUrls.add(source.url);
        if (source.title) attemptedTitles.add(originalTitleKey(source.title));
      }
    }
    attempts += batch.length;
    const reviewed = await enrichHotPayload({ ...payload, rankings: batch }, options);
    for (const story of reviewed.rankings) {
      options.onDiagnostic?.({ id: story.id, title: story.title, status: story.detail?.status ?? "unavailable", reason: story.detail?.reason });
      if (story.detail?.status === "ready" && validHotDetail(story.detail, story.sources, options.now)) accepted.push(story);
      else observed.push(story);
    }
    if (accepted.length >= 10 || attempts >= MAX_VERIFIED_EVENT_ATTEMPTS) break;
    const remainingOriginals = reserve.filter((item) => !attemptedUrls.has(item.url) && !attemptedTitles.has(originalTitleKey(item.title)));
    batch = buildHotList(remainingOriginals, new Date(options.now)).rankings
      .filter((story) => !attemptedTitles.has(originalTitleKey(story.title)) && story.sources.every((source: RankingSource) => !attemptedUrls.has(source.url)))
      .map((story) => restoreReviewedDetail(story, saved, options.now));
  }
  if (!accepted.length) throw new Error("No hot-list events passed detail verification; previous D1 snapshot was preserved");
  // Rebuild the final qualified union so a lower-heat seven-day reserve still
  // sorts before a thirty-day event accepted in an earlier review batch.
  const qualified = reserveOriginals([], { ...payload, rankings: accepted }, options.now);
  const rankings = buildHotList(qualified, new Date(options.now)).rankings
    .map((story) => restoreReviewedDetail(story, { ...payload, rankings: accepted }, options.now))
    .filter((story) => story.detail?.status === "ready" && validHotDetail(story.detail, story.sources, options.now))
    .map((story, index) => ({ ...story, rank: index + 1 }));
  if (!rankings.length) throw new Error("No hot-list events passed detail verification; previous D1 snapshot was preserved");
  const approvedUrls = new Set(rankings.flatMap((story) => story.sources.map((source: RankingSource) => source.url)));
  const leadUrls = new Set<string>();
  const leads = [...observed, ...payload.leads].filter((story) => {
    if (story.sources.some((source: RankingSource) => approvedUrls.has(source.url) || leadUrls.has(source.url))) return false;
    for (const source of story.sources) leadUrls.add(source.url);
    return true;
  }).slice(0, 16).map((story) => ({ id: story.id, title: story.title, topic: story.topic, publishedAt: story.publishedAt,
    sourceCount: story.sourceCount, verification: story.verification, sources: story.sources }));
  return { ...payload, rankings,
    stories: payload.stories.filter((story) => story.sources.some((source: RankingSource) => approvedUrls.has(source.url))), leads, status: "ready" };
}

/** Run once per UTC cron trigger; keep the last good ranking if every source fails. */
export async function publishDailyHotList(
  db: SnapshotDatabase,
  options: CollectOptions = {},
) {
  const payload = await collectHotPayload(db, options);
  const json = JSON.stringify(payload);
  if (new TextEncoder().encode(json).byteLength > MAX_SNAPSHOT_BYTES) {
    throw new Error("Hot-list snapshot exceeds the storage limit");
  }
  const result = await db.prepare(`INSERT INTO hot_list_snapshot (id, updated_at, payload_json)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, payload_json = excluded.payload_json
    WHERE excluded.updated_at > hot_list_snapshot.updated_at`)
    .bind(payload.updatedAt, json).run();
  return { updatedAt: payload.updatedAt, status: payload.status, rankings: payload.rankings.length,
    detailsReady: payload.rankings.filter((story) => story.detail?.status === "ready").length,
    failedSources: payload.failedSources, written: result.meta.changes > 0 };
}

/** Preview never writes the public snapshot; private processing verdicts are
 * saved so previews and scheduled runs cannot repeatedly spend on one article. */
export async function collectHotPayload(db: SnapshotDatabase, options: CollectOptions = {}) {
  if (!options.processingRepository) return collectHotPayloadUnlocked(db, options);
  const repository = options.processingRepository;
  const at = (options.now ?? Date.now)();
  const token = crypto.randomUUID();
  if (!await repository.acquire(token, at)) throw new Error("Hot-list processing already running; previous D1 snapshot was preserved");
  try {
    const incremental = new HotIncrementalSession(repository, at, options.maxNewEvents);
    await incremental.initialize();
    try {
      return await collectHotPayloadUnlocked(db, { ...options, now: () => at }, incremental);
    } finally {
      options.onProcessingStats?.({ ...incremental.stats });
      console.log("hot-list incremental processing", incremental.stats);
    }
  } finally {
    await repository.release(token);
  }
}

async function collectHotPayloadUnlocked(
  db: SnapshotDatabase,
  { fetcher = fetch, now = () => Date.now(), ai, detailService, onDiagnostic }: CollectOptions = {},
  incremental?: HotIncrementalSession,
) {
  const at = now();
  const articleCache: ArticleCache = new Map();
  let preparedItems: FeedItem[] | undefined;
  const handle = createHotListHandler({ fetcher, now: () => at,
    ...(ai || detailService ? { prepareItems: async (items) => {
      preparedItems = await prepareHotArticles(items, { fetcher, now: at, articleCache, detailService });
      return preparedItems;
    } } : {}),
  });
  const response = await handle(new Request("https://hot-list.invalid/api/hot-list"));
  let payload = await response.json() as HotPayload;
  let saved: HotPayload | null = null;
  if (payload.status === "unavailable" || !payload.updatedAt) {
    throw new Error("Hot-list feeds are unavailable; previous D1 snapshot was preserved");
  }
  try {
    const row = await db.prepare("SELECT updated_at, payload_json FROM hot_list_snapshot WHERE id = 1")
      .first<{ updated_at: string; payload_json: string }>();
    // Feed pagination and transient empty responses can displace still-valid
    // stories even when the new crawl itself has ten entries. Re-rank the union
    // of saved original links and their source titles; never invent a record.
    saved = parseHotSnapshotRow(row, at, true);
    payload = mergeSavedHotList(payload, saved, at, preparedItems);
  } catch {
    // A missing snapshot must not prevent the first scheduled publication.
  }
  if (!ai?.run && !detailService?.fetch) return payload;
  return verifiedRanking(payload, preparedItems ?? [], saved, { fetcher, ai, detailService, now: at, articleCache, onDiagnostic, incremental });
}

/** Backup only: a recorded rejection is a completed attempt and must never be rerun. */
export async function runMissedDailyReport(
  db: SnapshotDatabase,
  generator: DailyGenerator,
  { now = () => new Date() }: { now?: () => Date } = {},
) {
  const reportDate = beijingDate(now());
  // Deliberately do not catch D1 errors: an uncertain status must not trigger
  // a second AI review or accidentally replace a manually published report.
  const existing = await db.prepare("SELECT status FROM daily_automation_runs WHERE report_date = ?")
    .bind(reportDate).first<{ status: string }>();
  if (existing) return { reportDate, status: "skipped_recorded", existingStatus: existing.status };
  if (!generator?.fetch) throw new Error("Daily generator service binding missing");

  const response = await generator.fetch(new Request("https://generator.internal/run-if-missing", {
    method: "POST",
  }));
  if (!response.ok) throw new Error(`Daily generator HTTP ${response.status}`);
  const outcome = await response.json().catch(() => null) as {
    reportDate?: string; publicationStatus?: string; candidateCount?: number;
  } | null;
  if (outcome?.reportDate !== reportDate
    || !["published", "rejected", "skipped_existing"].includes(outcome.publicationStatus ?? "")) {
    throw new Error("Daily generator did not acknowledge a persisted outcome for today");
  }
  return { reportDate, status: outcome.publicationStatus, candidateCount: outcome.candidateCount };
}

const worker = {
  // No workers.dev or public routes: only same-account service bindings and
  // authenticated Wrangler previews can call this read-only review endpoint.
  async fetch(request: Request, env: { DB: D1Database; AI?: HotAi; HOT_DETAIL?: HotDetailService }) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/__hot-detail-preview" && !url.search && env.HOT_DETAIL) {
      // Authenticated preview/service-binding only. Child validation applies
      // identical source, size, date and AI gates; this path never touches D1.
      return env.HOT_DETAIL.fetch(new Request("https://hot-detail.internal/detail", request));
    }
    if (request.method === "POST" && url.pathname === "/__hot-detail-review" && !url.search && env.HOT_DETAIL) {
      return env.HOT_DETAIL.fetch(new Request("https://hot-detail.internal/review", request));
    }
    if (request.method === "POST" && url.pathname === "/__hot-article-preview" && !url.search && env.HOT_DETAIL) {
      return env.HOT_DETAIL.fetch(new Request("https://hot-detail.internal/article", request));
    }
    if (request.method !== "POST" || url.pathname !== "/__hot-preview" || url.search) {
      return new Response("Not found", { status: 404 });
    }
    const diagnostics: HotDiagnostic[] = [];
    let processing: HotIncrementalSession["stats"] | undefined;
    try {
      const payload = await collectHotPayload(env.DB, { ai: env.AI, detailService: env.HOT_DETAIL,
        processingRepository: hotProcessingRepository(env.DB), onDiagnostic: (result) => diagnostics.push(result),
        onProcessingStats: (stats) => { processing = stats; } });
      return Response.json({ ...payload, diagnostics, processing }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return Response.json({ status: "unavailable", reason: error instanceof Error ? error.message.slice(0, 240) : "processing_unavailable", processing, diagnostics },
        { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  },
  async scheduled(controller: ScheduledController, env: { DB: D1Database; DAILY_GENERATOR: DailyGenerator; AI?: HotAi; HOT_DETAIL?: HotDetailService }) {
    if (controller.cron === HOT_LIST_CRON) {
      const result = await publishDailyHotList(env.DB, { ai: env.AI, detailService: env.HOT_DETAIL,
        ...(env.AI || env.HOT_DETAIL ? { processingRepository: hotProcessingRepository(env.DB) } : {}) });
      console.log("hot-list daily snapshot", result);
      return;
    }
    if (controller.cron === DAILY_BACKUP_CRON) {
      const result = await runMissedDailyReport(env.DB, env.DAILY_GENERATOR);
      console.log("daily-report backup scheduler", result);
      return;
    }
    throw new Error(`Unexpected scheduled cron: ${controller.cron}`);
  },
};

export default worker;
