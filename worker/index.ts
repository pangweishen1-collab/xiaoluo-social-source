/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { handleArticleApi, authenticated } from "./articles";
import { handleDanmaku } from "./danmaku";
import { handleBusinessInquiry, listBusinessInquiries } from "./business-inquiries";
import { handleDurableHotList } from "./hot-list";
import { isCrossOriginMutation } from "../shared/request-security.mjs";
import { IMAGE_UPLOAD_RULES, webpBytesFromDataUrl } from "../shared/image-upload.mjs";
import { withAssetCache } from "../shared/asset-cache.mjs";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  MEDIA: R2Bucket;
  ARTICLE_ADMIN_USERNAME?: string;
  ARTICLE_ADMIN_PASSWORD_HASH?: string;
  BUSINESS_EMAIL_API_KEY?: string;
  BUSINESS_EMAIL_FROM?: string;
  BUSINESS_EMAIL_TO?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type VisitorStats = { total: number; today: number };
type TalentKind = "jobs" | "people";
const ADMIN_USER = "xiaoluo";
const ADMIN_PASSWORD_HASH = "a4072c6cb917d258ac84dda2fa3b524dc35728a0d6291609377300d5c3f0d8ea";

let visitorSchemaReady: Promise<void> | null = null;
let talentSchemaReady: Promise<void> | null = null;

function getCookie(request: Request, name: string) {
  const source = request.headers.get("Cookie") ?? "";
  return source.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
}

function json(data: unknown, cookie?: string, status = 200) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
  });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(data), { status, headers });
}

async function ensureVisitorSchema(db: D1Database) {
  visitorSchemaReady ??= db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS visitor_registry (visitor_id TEXT PRIMARY KEY, first_seen TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS visitor_daily (day TEXT NOT NULL, visitor_id TEXT NOT NULL, PRIMARY KEY (day, visitor_id))"),
  ]).then(() => undefined);
  return visitorSchemaReady;
}

async function recordVisitor(request: Request, env: Env) {
  await ensureVisitorSchema(env.DB);
  const existingId = getCookie(request, "xiaoluo_visitor");
  const visitorId = existingId && /^[a-zA-Z0-9-]{16,64}$/.test(existingId) ? existingId : crypto.randomUUID();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO visitor_registry (visitor_id, first_seen) VALUES (?, ?)").bind(visitorId, now),
    env.DB.prepare("INSERT OR IGNORE INTO visitor_daily (day, visitor_id) VALUES (?, ?)").bind(day, visitorId),
  ]);
  const [totalResult, todayResult] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS count FROM visitor_registry"),
    env.DB.prepare("SELECT COUNT(*) AS count FROM visitor_daily WHERE day = ?").bind(day),
  ]);
  const total = Number((totalResult.results?.[0] as { count?: number } | undefined)?.count ?? 0);
  const today = Number((todayResult.results?.[0] as { count?: number } | undefined)?.count ?? 0);
  const isSecure = new URL(request.url).protocol === "https:";
  const cookie = existingId ? undefined : `xiaoluo_visitor=${visitorId}; Path=/; Max-Age=31536000; SameSite=Lax${isSecure ? "; Secure" : ""}`;
  return json({ total, today }, cookie);
}

function text(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function ensureTalentSchema(db: D1Database) {
  talentSchemaReady ??= db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS talent_listings (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT '',
    focus TEXT NOT NULL DEFAULT '',
    employment_type TEXT NOT NULL DEFAULT '',
    experience_level TEXT NOT NULL DEFAULT '',
    experience TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    note TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    contact TEXT NOT NULL DEFAULT '',
    boss_direct INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`),
    db.prepare("CREATE TABLE IF NOT EXISTS talent_admin_sessions (token TEXT PRIMARY KEY, expires_at TEXT NOT NULL)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS matrix_submissions (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL,
      products TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    )`),
  ]).then(async () => {
    // Existing Pages deployments already have this table, so migrate them in place.
    await db.prepare("ALTER TABLE talent_listings ADD COLUMN boss_direct INTEGER NOT NULL DEFAULT 0").run().catch(() => undefined);
    await db.prepare("ALTER TABLE talent_listings ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0").run().catch(() => undefined);
    await db.prepare("ALTER TABLE talent_listings ADD COLUMN image_key TEXT NOT NULL DEFAULT ''").run().catch(() => undefined);
  });
  return talentSchemaReady;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function isAdmin(request: Request, env: Env) {
  await ensureTalentSchema(env.DB);
  const token = getCookie(request, "xiaoluo_admin");
  if (!token || !/^[a-zA-Z0-9-]{16,64}$/.test(token)) return false;
  const result = await env.DB.prepare("SELECT token FROM talent_admin_sessions WHERE token = ? AND expires_at > ?").bind(token, new Date().toISOString()).first();
  return Boolean(result);
}

async function loginAdmin(request: Request, env: Env) {
  const body = await request.json() as Partial<Record<string, unknown>>;
  const username = text(body.username, 60);
  const password = text(body.password, 120);
  if (username !== ADMIN_USER || await sha256(`${username}:${password}`) !== ADMIN_PASSWORD_HASH) return json({ error: "账号或密码错误。" }, undefined, 401);
  await ensureTalentSchema(env.DB);
  const token = crypto.randomUUID();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare("INSERT INTO talent_admin_sessions (token, expires_at) VALUES (?, ?)").bind(token, expires).run();
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return json({ authenticated: true }, `xiaoluo_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`);
}

async function logoutAdmin(request: Request, env: Env) {
  const token = getCookie(request, "xiaoluo_admin");
  if (token) { await ensureTalentSchema(env.DB); await env.DB.prepare("DELETE FROM talent_admin_sessions WHERE token = ?").bind(token).run(); }
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return json({ authenticated: false }, `xiaoluo_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}

async function listTalent(env: Env) {
  await ensureTalentSchema(env.DB);
  const result = await env.DB.prepare(`SELECT id, kind, company, title, city, focus, employment_type, experience_level, experience, tags, note, description, contact, boss_direct, sort_order, image_key, created_at
    FROM talent_listings ORDER BY boss_direct DESC, sort_order ASC, created_at DESC LIMIT 120`).all<Record<string, unknown>>();
  const items = (result.results ?? []).map((row) => ({
    id: String(row.id),
    kind: row.kind,
    company: String(row.company ?? ""),
    title: String(row.title ?? ""),
    city: String(row.city ?? ""),
    focus: String(row.focus ?? ""),
    type: String(row.employment_type ?? ""),
    level: String(row.experience_level ?? ""),
    exp: String(row.experience ?? ""),
    tags: (() => { try { return JSON.parse(String(row.tags ?? "[]")); } catch { return []; } })(),
    note: String(row.note ?? ""),
    description: String(row.description ?? ""),
    contact: String(row.contact ?? ""),
    bossDirect: Number(row.boss_direct ?? 0) === 1,
    sortOrder: Number(row.sort_order ?? 0),
    imageUrl: row.image_key ? `/api/talent-images/${row.image_key}` : "",
    createdAt: String(row.created_at ?? ""),
  }));
  return json({ items });
}

async function saveTalentImage(value: unknown, env: Env, listingId: string) {
  if (typeof value !== "string" || !value) return "";
  const bytes = webpBytesFromDataUrl(value);
  const key = `talent/${listingId}${IMAGE_UPLOAD_RULES.extension}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: IMAGE_UPLOAD_RULES.outputMimeType, cacheControl: "public, max-age=31536000, immutable" } });
  return key;
}

async function createTalent(request: Request, env: Env) {
  const body = await request.json() as Partial<Record<string, unknown>>;
  const kind = body.kind === "jobs" || body.kind === "people" ? body.kind as TalentKind : null;
  const title = text(body.title, 90);
  const company = text(body.company, 100);
  if (!kind || !title || (kind === "jobs" && !company)) return json({ error: "请填写完整的职位与公司信息。" }, undefined, 400);
  const rawTags = Array.isArray(body.tags) ? body.tags : [];
  const tags = rawTags.map((tag) => text(tag, 24)).filter(Boolean).slice(0, 4);
  const id = crypto.randomUUID();
  const imageKey = await saveTalentImage(body.imageData, env, id);
  const item = {
    id, kind, company: kind === "jobs" ? company : "", title,
    city: text(body.city, 50), focus: text(body.focus, 50), type: text(body.type, 50), level: text(body.level, 50),
    exp: text(body.exp, 50), tags, note: text(body.note, 600), description: text(body.description, 1200), contact: text(body.contact, 180),
    bossDirect: kind === "jobs" && body.bossDirect === true && await isAdmin(request, env),
    imageKey, imageUrl: imageKey ? `/api/talent-images/${imageKey}` : "", createdAt: new Date().toISOString(),
  };
  await ensureTalentSchema(env.DB);
  await env.DB.prepare(`INSERT INTO talent_listings (id, kind, company, title, city, focus, employment_type, experience_level, experience, tags, note, description, contact, boss_direct, image_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(item.id, item.kind, item.company, item.title, item.city, item.focus, item.type, item.level, item.exp, JSON.stringify(item.tags), item.note, item.description, item.contact, item.bossDirect ? 1 : 0, item.imageKey, item.createdAt).run();
  return json({ item }, undefined, 201);
}

async function updateTalent(request: Request, env: Env, id: string) {
  const body = await request.json() as Partial<Record<string, unknown>>;
  const kind = body.kind === "jobs" || body.kind === "people" ? body.kind as TalentKind : null;
  const title = text(body.title, 90); const company = text(body.company, 100);
  if (!kind || !title || (kind === "jobs" && !company)) return json({ error: "请填写完整的职位与公司信息。" }, undefined, 400);
  const tags = (Array.isArray(body.tags) ? body.tags : []).map((tag) => text(tag, 24)).filter(Boolean).slice(0, 4);
  const uploadedImageKey = await saveTalentImage(body.imageData, env, id);
  const existingImage = uploadedImageKey ? null : await env.DB.prepare("SELECT image_key FROM talent_listings WHERE id = ?").bind(id).first<{ image_key?: string }>();
  const imageKey = uploadedImageKey || String(existingImage?.image_key ?? "");
  const item = { id, kind, company: kind === "jobs" ? company : "", title, city: text(body.city, 50), focus: text(body.focus, 50), type: text(body.type, 50), level: text(body.level, 50), exp: text(body.exp, 50), tags, note: text(body.note, 600), description: text(body.description, 1200), contact: text(body.contact, 180), bossDirect: kind === "jobs" && body.bossDirect === true, imageKey, imageUrl: imageKey ? `/api/talent-images/${imageKey}` : "" };
  await ensureTalentSchema(env.DB);
  const result = await env.DB.prepare("UPDATE talent_listings SET kind = ?, company = ?, title = ?, city = ?, focus = ?, employment_type = ?, experience_level = ?, experience = ?, tags = ?, note = ?, description = ?, contact = ?, boss_direct = ?, image_key = CASE WHEN ? = '' THEN image_key ELSE ? END WHERE id = ?").bind(item.kind, item.company, item.title, item.city, item.focus, item.type, item.level, item.exp, JSON.stringify(item.tags), item.note, item.description, item.contact, item.bossDirect ? 1 : 0, imageKey, imageKey, id).run();
  if (!result.meta.changes) return json({ error: "未找到该信息。" }, undefined, 404);
  return json({ item });
}

async function deleteTalent(env: Env, id: string) {
  await ensureTalentSchema(env.DB);
  const result = await env.DB.prepare("DELETE FROM talent_listings WHERE id = ?").bind(id).run();
  return result.meta.changes ? json({ deleted: true }) : json({ error: "未找到该信息。" }, undefined, 404);
}

async function reorderTalent(request: Request, env: Env) {
  const body = await request.json() as Partial<Record<string, unknown>>;
  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id)).slice(0, 120) : [];
  if (!ids.length) return json({ error: "没有可排序的信息。" }, undefined, 400);
  await ensureTalentSchema(env.DB);
  await env.DB.batch(ids.map((id, index) => env.DB.prepare("UPDATE talent_listings SET sort_order = ? WHERE id = ?").bind(index + 1, id)));
  return json({ reordered: true });
}

async function listMatrixSubmissions(env: Env) {
  await ensureTalentSchema(env.DB);
  const result = await env.DB.prepare(`SELECT id, company, products, status, created_at
    FROM matrix_submissions
    ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 200`).all<Record<string, unknown>>();
  return json({ items: (result.results ?? []).map((row) => ({
    id: String(row.id), company: String(row.company ?? ""), products: String(row.products ?? ""),
    status: row.status === "reviewed" ? "reviewed" : "pending", createdAt: String(row.created_at ?? ""),
  })) });
}

async function createMatrixSubmission(request: Request, env: Env) {
  const body = await request.json() as Partial<Record<string, unknown>>;
  const company = text(body.company, 120); const products = text(body.products, 400);
  if (!company || !products) return json({ error: "请填写公司和产品名称。" }, undefined, 400);
  const item = { id: crypto.randomUUID(), company, products, status: "pending", createdAt: new Date().toISOString() };
  await ensureTalentSchema(env.DB);
  await env.DB.prepare("INSERT INTO matrix_submissions (id, company, products, status, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(item.id, item.company, item.products, item.status, item.createdAt).run();
  return json({ item }, undefined, 201);
}

async function updateMatrixSubmission(request: Request, env: Env, id: string) {
  const body = await request.json() as Partial<Record<string, unknown>>;
  const status = body.status === "reviewed" ? "reviewed" : "pending";
  await ensureTalentSchema(env.DB);
  const result = await env.DB.prepare("UPDATE matrix_submissions SET status = ? WHERE id = ?").bind(status, id).run();
  return result.meta.changes ? json({ item: { id, status } }) : json({ error: "未找到该线索。" }, undefined, 404);
}

async function deleteMatrixSubmission(env: Env, id: string) {
  await ensureTalentSchema(env.DB);
  const result = await env.DB.prepare("DELETE FROM matrix_submissions WHERE id = ?").bind(id).run();
  return result.meta.changes ? json({ deleted: true }) : json({ error: "未找到该线索。" }, undefined, 404);
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/danmaku") return handleDanmaku(request, env.DB);
    if (url.pathname.startsWith("/api/") && isCrossOriginMutation(request)) return json({ error: "不允许跨站修改数据。" }, undefined, 403);
    if (url.pathname === "/api/business-inquiries") return handleBusinessInquiry(request, env);
    if (url.pathname === "/api/admin/business-inquiries") return listBusinessInquiries(request, env, await authenticated(request, env));
    if (url.pathname === "/api/hot-list") return handleDurableHotList(request, {
      db: env.DB,
      cache: typeof caches === "undefined" ? undefined : caches.default,
      waitUntil: (promise) => ctx.waitUntil(promise),
    });

    const articleResponse = await handleArticleApi(request, env, url);
    if (articleResponse) return articleResponse;

    if (url.pathname === "/api/admin/session") {
      if (request.method === "GET") return json({ authenticated: await isAdmin(request, env) });
      if (request.method === "POST") return loginAdmin(request, env);
      if (request.method === "DELETE") return logoutAdmin(request, env);
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, POST, DELETE" } });
    }

    if (url.pathname === "/api/matrix-submissions") {
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin) return json({ error: "Invalid request origin" }, undefined, 403);
      try {
        if (request.method === "POST") return await createMatrixSubmission(request, env);
        if (request.method === "GET") {
          if (!await isAdmin(request, env)) return json({ error: "请先登录管理后台。" }, undefined, 401);
          return await listMatrixSubmissions(env);
        }
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, POST" } });
      } catch (error) { console.error("matrix submission failed", error); return json({ error: "提交暂时不可用，请稍后重试。" }, undefined, 503); }
    }

    if (url.pathname.startsWith("/api/matrix-submissions/")) {
      const id = url.pathname.slice("/api/matrix-submissions/".length);
      if (!/^[a-f0-9-]{36}$/i.test(id)) return json({ error: "Invalid submission id" }, undefined, 400);
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin) return json({ error: "Invalid request origin" }, undefined, 403);
      if (!await isAdmin(request, env)) return json({ error: "请先登录管理后台。" }, undefined, 401);
      try {
        if (request.method === "PATCH") return await updateMatrixSubmission(request, env, id);
        if (request.method === "DELETE") return await deleteMatrixSubmission(env, id);
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "PATCH, DELETE" } });
      } catch (error) { console.error("matrix admin update failed", error); return json({ error: "更新失败，请稍后重试。" }, undefined, 503); }
    }

    if (url.pathname.startsWith("/api/talent-images/")) {
      const key = url.pathname.slice("/api/talent-images/".length);
      if (!/^talent\/[a-f0-9-]+\.webp$/i.test(key)) return new Response("Not Found", { status: 404 });
      const object = await env.MEDIA.get(key);
      if (!object) return new Response("Not Found", { status: 404 });
      return new Response(object.body, { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" } });
    }

    if (url.pathname === "/api/talent/reorder") {
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin) return json({ error: "Invalid request origin" }, undefined, 403);
      if (!await isAdmin(request, env)) return json({ error: "请先登录管理后台。" }, undefined, 401);
      try {
        if (request.method === "POST") return await reorderTalent(request, env);
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
      } catch (error) { console.error("talent reorder failed", error); return json({ error: "排序保存失败，请稍后重试。" }, undefined, 503); }
    }

    if (url.pathname.startsWith("/api/talent/")) {
      const id = url.pathname.slice("/api/talent/".length);
      if (!/^[a-f0-9-]{36}$/i.test(id)) return json({ error: "Invalid listing id" }, undefined, 400);
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin) return json({ error: "Invalid request origin" }, undefined, 403);
      if (!await isAdmin(request, env)) return json({ error: "请先登录管理后台。" }, undefined, 401);
      try {
        if (request.method === "PATCH") return await updateTalent(request, env, id);
        if (request.method === "DELETE") return await deleteTalent(env, id);
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "PATCH, DELETE" } });
      } catch (error) { console.error("talent management failed", error); return json({ error: "管理操作失败，请稍后重试。" }, undefined, 503); }
    }

    if (url.pathname === "/api/talent") {
      if (request.method !== "GET" && request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, POST" } });
      }
      const origin = request.headers.get("Origin");
      if (request.method === "POST" && origin && origin !== url.origin) return json({ error: "Invalid request origin" }, undefined, 403);
      try {
        return request.method === "GET" ? await listTalent(env) : await createTalent(request, env);
      } catch (error) {
        console.error("talent market failed", error);
        return json({ error: "人才市场暂时无法同步，请稍后重试。" }, undefined, 503);
      }
    }

    if (url.pathname === "/api/visitors") {
      if (request.method !== "POST" && request.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, POST" } });
      }
      try {
        return await recordVisitor(request, env);
      } catch (error) {
        console.error("visitor counter failed", error);
        return new Response(JSON.stringify({ error: "Visitor counter unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    if (url.pathname.startsWith("/_next/") || (url.pathname !== "/" && !url.pathname.startsWith("/api/") && /\.[a-z0-9]+$/i.test(url.pathname))) {
      return withAssetCache(await env.ASSETS.fetch(request), url.pathname);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
