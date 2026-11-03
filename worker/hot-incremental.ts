import { HOT_FEEDS } from "../shared/hot-list.mjs";
import { validHotDetail, type HotDetail, type RankedHotEvent } from "./hot-list";

// Bump whenever extraction, eligibility, prompts or review rules change.
export const HOT_PROCESSING_VERSION = "hot-detail-2026-10-20-incremental-1";
const DAY = 86_400_000;
type Article = { sourceUrl: string; title: string; text: string; publishedAt?: string; contentKind?: string };
type Stored = { expiresAt: string; value: unknown };
export interface HotProcessingRepository {
  load(at: number): Promise<Map<string, Stored>>;
  get(key: string, at: number): Promise<Stored | null>;
  put(key: string, value: unknown, expiresAt: string): Promise<void>;
  acquire(token: string, at: number): Promise<boolean>;
  release(token: string): Promise<void>;
}

export function hotProcessingRepository(db: Pick<D1Database, "prepare">): HotProcessingRepository {
  return {
    async load(at) {
      const rows = await db.prepare("SELECT cache_key, expires_at, result_json FROM hot_event_processing_cache WHERE expires_at > ? AND cache_key = 'ai-quota-pause'")
        .bind(new Date(at).toISOString()).all<{ cache_key: string; expires_at: string; result_json: string }>();
      if (!rows.success) throw new Error("Hot-list processing cache could not be read");
      const values = new Map<string, Stored>();
      for (const row of rows.results) {
        try { values.set(row.cache_key, { expiresAt: row.expires_at, value: JSON.parse(row.result_json) }); } catch { /* Never reuse malformed records. */ }
      }
      return values;
    },
    async get(key, at) {
      const row = await db.prepare("SELECT expires_at, result_json FROM hot_event_processing_cache WHERE cache_key = ? AND expires_at > ?")
        .bind(key, new Date(at).toISOString()).first<{ expires_at: string; result_json: string }>();
      if (!row) return null;
      try { return { expiresAt: row.expires_at, value: JSON.parse(row.result_json) }; } catch { return null; }
    },
    async put(key, value, expiresAt) {
      const result = await db.prepare("INSERT INTO hot_event_processing_cache (cache_key, expires_at, result_json) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET expires_at = excluded.expires_at, result_json = excluded.result_json")
        .bind(key, expiresAt, JSON.stringify(value)).run();
      if (!result.success) throw new Error("Hot-list processing result could not be saved");
    },
    async acquire(token, at) {
      const result = await db.prepare("INSERT INTO hot_event_processing_cache (cache_key, expires_at, result_json) VALUES ('processing-lock', ?, ?) ON CONFLICT(cache_key) DO UPDATE SET expires_at = excluded.expires_at, result_json = excluded.result_json WHERE hot_event_processing_cache.expires_at <= ?")
        .bind(new Date(at + 30 * 60_000).toISOString(), JSON.stringify(token), new Date(at).toISOString()).run();
      if (!result.success) throw new Error("Hot-list processing lock unavailable");
      return result.meta.changes === 1;
    },
    async release(token) {
      await db.prepare("UPDATE hot_event_processing_cache SET expires_at = ? WHERE cache_key = 'processing-lock' AND result_json = ?")
        .bind(new Date(0).toISOString(), JSON.stringify(token)).run();
    },
  };
}

const digest = async (value: unknown) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value))))]
  .map((byte) => byte.toString(16).padStart(2, "0")).join("");
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const quotaError = (reason: string) => /4006|10[,.]?000\s*neurons|free allocation|quota|rate.?limit|\b429\b/iu.test(reason);

export class HotIncrementalSession {
  readonly stats = { reused: 0, rejectedReused: 0, newEvents: 0, deferred: 0, quotaBlocked: false };
  private records = new Map<string, Stored>();
  private stopped = false;
  constructor(private repository: HotProcessingRepository, private at: number, private maxNewEvents = 10) {
    this.maxNewEvents = Number.isFinite(maxNewEvents) ? Math.max(0, Math.min(20, Math.floor(maxNewEvents))) : 10;
  }
  async initialize() {
    this.records = await this.repository.load(this.at);
    const pause = this.records.get("ai-quota-pause");
    this.stopped = !!pause && Date.parse(pause.expiresAt) > this.at;
    this.stats.quotaBlocked = this.stopped;
  }
  private async save(key: string, value: unknown, lifetime = 90 * DAY) {
    const expiresAt = new Date(this.at + lifetime).toISOString();
    await this.repository.put(key, value, expiresAt);
    this.records.set(key, { expiresAt, value });
  }
  private async find(key: string) {
    const stored = this.records.get(key) ?? await this.repository.get(key, this.at);
    if (stored) this.records.set(key, stored);
    return stored;
  }
  async process(story: RankedHotEvent, articles: Article[], run: () => Promise<HotDetail>): Promise<HotDetail> {
    const fingerprints = await Promise.all(articles.map(async (article) => {
      const source = story.sources.find((source: { url: string }) => source.url === article.sourceUrl);
      const feed = HOT_FEEDS.find((feed) => feed.name === source?.name);
      if (!source || !feed || article.text.length < (article.contentKind === "release-notes" ? 80 : 180) || article.text.length > 18_000
        || !article.publishedAt || !Number.isFinite(Date.parse(article.publishedAt))
        || Date.parse(article.publishedAt) > this.at || this.at - Date.parse(article.publishedAt) > 90 * DAY
        || (article.contentKind === "release-notes" && feed.format !== "apple-lookup")
        || Math.abs(Date.parse(source.publishedAt) - Date.parse(article.publishedAt)) > 36 * 60 * 60_000) return null;
      const key = await digest([HOT_PROCESSING_VERSION, story.topic, source.name, source.url, source.title || story.title, source.publishedAt,
        article.title, article.publishedAt, article.contentKind || "article", article.text.replace(/\s+/gu, " ").trim()]);
      return { key: `article:${key}`, article, source };
    }));
    const originals = fingerprints.filter((value): value is NonNullable<typeof value> => !!value);
    for (const original of originals) {
      const stored = await this.find(original.key);
      const entry = stored?.value;
      if (!stored || Date.parse(stored.expiresAt) <= this.at || !object(entry) || entry.version !== HOT_PROCESSING_VERSION || !object(entry.detail)) continue;
      const detail = entry.detail as HotDetail;
      if (detail.status === "ready" && validHotDetail(detail, story.sources, this.at)
        && detail.sourceUrl === original.source.url && detail.sourceName === original.source.name
        && original.article.text.replace(/\s+/gu, " ").includes((detail.evidenceQuote || "").replace(/\s+/gu, " "))) {
        this.stats.reused += 1;
        return { ...detail, retained: false };
      }
    }
    const rejectionKey = originals.length ? `rejected:${await digest([HOT_PROCESSING_VERSION, story.topic, story.title, originals.map((entry) => entry.key).sort()])}` : null;
    const rejected = rejectionKey && await this.find(rejectionKey);
    if (rejected && Date.parse(rejected.expiresAt) > this.at && object(rejected.value) && rejected.value.version === HOT_PROCESSING_VERSION && rejected.value.status === "rejected") {
      this.stats.rejectedReused += 1;
      return { status: "rejected", reason: "unchanged_original_previously_rejected" };
    }
    // Never infer an unchanged original from its URL alone or spend AI on an
    // unreadable article. Cached successes remain usable even while AI is paused.
    if (!originals.length || this.stopped || this.stats.newEvents >= this.maxNewEvents) {
      this.stats.deferred += 1;
      return { status: "unavailable", reason: !originals.length ? "original_unreadable" : this.stopped ? "ai_quota_paused" : "incremental_run_budget" };
    }
    this.stats.newEvents += 1;
    let detail: HotDetail;
    try { detail = await run(); }
    catch (error) { detail = { status: "unavailable", reason: error instanceof Error ? error.message : "detail_service_unavailable" }; }
    if (detail.status === "ready") {
      const original = originals.find((entry) => entry.source.url === detail.sourceUrl && entry.source.name === detail.sourceName);
      if (!validHotDetail(detail, story.sources, this.at) || !original
        || !original.article.text.replace(/\s+/gu, " ").includes((detail.evidenceQuote || "").replace(/\s+/gu, " "))) {
        return { status: "unavailable", reason: "invalid_original_bound_detail" };
      }
      await this.save(original.key, { version: HOT_PROCESSING_VERSION, detail });
    } else if (detail.status === "rejected" && rejectionKey) {
      // Persist only the verdict, never rejected copy or a full article.
      await this.save(rejectionKey, { version: HOT_PROCESSING_VERSION, status: "rejected" });
    } else if (quotaError(detail.reason || "")) {
      this.stopped = true;
      this.stats.quotaBlocked = true;
      const nextUtcDay = Date.UTC(new Date(this.at).getUTCFullYear(), new Date(this.at).getUTCMonth(), new Date(this.at).getUTCDate() + 1) + 60_000;
      await this.save("ai-quota-pause", { status: "quota_paused" }, Math.min(60 * 60_000, nextUtcDay - this.at));
    }
    return detail;
  }
}
