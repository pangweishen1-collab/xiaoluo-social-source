import provinces from "../shared/provinces.json";
import { productUpdateDetail, readProductUpdate } from "../shared/product-update.mjs";
import { matrixCompanies } from "../app/matrix-data";
import { isCrossOriginMutation } from "../shared/request-security.mjs";
import { parseDailyEdition, validateDailyEdition } from "../shared/daily-edition.mjs";
export interface ArticleEnv {
  DB: D1Database;
  MEDIA: R2Bucket;
  ARTICLE_ADMIN_USERNAME?: string;
  ARTICLE_ADMIN_PASSWORD_HASH?: string;
}

type Recommendation = { title: string; url: string };
type ArticleInput = { title: string; company: string; matrixCompany: string; category: string; slug: string; summary: string; tags: string[]; body: string; recommendations: Recommendation[] };

const articleCookie = "xiaoluo_article_admin";
let schemaReady: Promise<void> | null = null;

const json = (data: unknown, status = 200, cookie?: string) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(cookie ? { "Set-Cookie": cookie } : {}) } });
const cookie = (request: Request, name: string) => (request.headers.get("Cookie") ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((part) => part.toString(16).padStart(2, "0")).join("");

async function ensureSchema(db: D1Database) {
  schemaReady ??= db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS analysis_articles (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, company TEXT NOT NULL, category TEXT NOT NULL, summary TEXT NOT NULL, tags TEXT NOT NULL, body TEXT NOT NULL, recommendations TEXT NOT NULL DEFAULT '[]', view_count INTEGER NOT NULL DEFAULT 0, published_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS article_admin_sessions (token TEXT PRIMARY KEY, expires_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS matrix_companies (id TEXT PRIMARY KEY, company TEXT NOT NULL, products TEXT NOT NULL, category TEXT NOT NULL, logo TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', source_company TEXT NOT NULL DEFAULT '', deleted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
  ]).then(async () => { await Promise.all([
    db.prepare("ALTER TABLE analysis_articles ADD COLUMN recommendations TEXT NOT NULL DEFAULT '[]'").run().catch(() => undefined),
    db.prepare("ALTER TABLE analysis_articles ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0").run().catch(() => undefined),
    db.prepare("ALTER TABLE matrix_companies ADD COLUMN source_company TEXT NOT NULL DEFAULT ''").run().catch(() => undefined),
    db.prepare("ALTER TABLE matrix_companies ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0").run().catch(() => undefined),
  ]);
  const columns = await db.prepare("PRAGMA table_info(analysis_articles)").all<{ name: string }>();
  if (!columns.results.some(column => column.name === "matrix_company")) {
    await db.prepare("ALTER TABLE analysis_articles ADD COLUMN matrix_company TEXT NOT NULL DEFAULT ''").run();
  }
  const matrixColumns = await db.prepare("PRAGMA table_info(matrix_companies)").all<{ name: string }>();
  if (!matrixColumns.results.some(column => column.name === "province")) await db.prepare("ALTER TABLE matrix_companies ADD COLUMN province TEXT NOT NULL DEFAULT ''").run();
  }).catch(error => { schemaReady = null; throw error; });
  return schemaReady;
}

async function articleAuthenticated(request: Request, env: ArticleEnv) {
  await ensureSchema(env.DB);
  const token = cookie(request, articleCookie);
  if (!token || !/^[a-z0-9-]{16,64}$/i.test(token)) return false;
  return Boolean(await env.DB.prepare("SELECT token FROM article_admin_sessions WHERE token = ? AND expires_at > ?").bind(token, new Date().toISOString()).first());
}

async function siteAdminAuthenticated(request: Request, env: ArticleEnv) {
  const token = cookie(request, "xiaoluo_admin");
  if (!token || !/^[a-z0-9-]{16,64}$/i.test(token)) return false;
  return Boolean(await env.DB.prepare("SELECT token FROM talent_admin_sessions WHERE token = ? AND expires_at > ?").bind(token, new Date().toISOString()).first());
}

export async function authenticated(request: Request, env: ArticleEnv) {
  return await siteAdminAuthenticated(request, env) || await articleAuthenticated(request, env);
}

const contentUpdate = (db: D1Database, type: string, title: string, detail: string, now: string) => db.prepare("INSERT INTO site_content_updates (id,type,title,detail,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), type, title, detail, now);

function input(value: unknown): ArticleInput | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const slug = clean(raw.slug, 96) || `article-${crypto.randomUUID().slice(0, 8)}`;
  const recommendations = Array.isArray(raw.recommendations) ? raw.recommendations.map((recommendation) => { const item = recommendation as Record<string, unknown>; const title = clean(item?.title, 120); const url = clean(item?.url, 1500); return title && /^https?:\/\//i.test(url) ? { title, url } : null; }).filter((recommendation): recommendation is Recommendation => Boolean(recommendation)).slice(0, 5) : [];
  const article = { title: clean(raw.title, 120), company: clean(raw.company, 120), matrixCompany: clean(raw.matrixCompany, 140), category: clean(raw.category, 40) || "公司分析", slug, summary: clean(raw.summary, 500), tags: Array.isArray(raw.tags) ? raw.tags.map((tag) => clean(tag, 24)).filter(Boolean).slice(0, 6) : [], body: clean(raw.body, 30000), recommendations };
  return article.title && article.company && article.summary && article.body && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug) ? article : null;
}

const row = (item: Record<string, unknown>, detail = true) => ({ id: String(item.id), slug: String(item.slug), title: String(item.title), company: String(item.company), matrixCompany: String(item.matrix_company || ""), category: String(item.category), summary: String(item.summary), tags: (() => { try { return JSON.parse(String(item.tags)); } catch { return []; } })(), recommendations: (() => { try { const value = JSON.parse(String(item.recommendations || "[]")); return Array.isArray(value) ? value.filter((recommendation): recommendation is Recommendation => Boolean(recommendation && typeof recommendation.title === "string" && typeof recommendation.url === "string")).slice(0, 5) : []; } catch { return []; } })(), views: Number(item.view_count || 0), ...(detail ? { body: String(item.body) } : {}), publishedAt: String(item.published_at), updatedAt: String(item.updated_at) });

const matrixRow = (item: Record<string, unknown>) => {
  const logo = String(item.logo || "");
  return { id: String(item.id), company: String(item.company), products: (() => { try { const value = JSON.parse(String(item.products || "[]")); return Array.isArray(value) ? value.map(String) : []; } catch { return []; } })(), category: String(item.category), province: String(item.province || ""), logoUrl: logo.startsWith("matrix-logo/") ? `/api/matrix-logos/${encodeURIComponent(String(item.id))}.webp?v=${encodeURIComponent(String(item.updated_at || ""))}` : logo, note: String(item.note || ""), sourceCompany: String(item.source_company || ""), deleted: Number(item.deleted || 0) === 1 };
};

type DailyEditionLead = { leadItemId: string | null; sections: { items: { id: string; title: string }[] }[] };
const dailyEdition = (value: unknown) => parseDailyEdition(value) as DailyEditionLead | null;
const dailyLeadTitle = (edition: DailyEditionLead | null, fallback: string) => {
  if (!edition?.leadItemId) return fallback;
  return edition.sections.flatMap((section) => section.items).find((item) => item.id === edition.leadItemId)?.title || fallback;
};

async function saveMatrixLogo(value: unknown, env: ArticleEnv, id: string, fallback = "") {
  if (typeof value !== "string" || !value) return fallback;
  if (!value.startsWith("data:")) return clean(value, 1500);
  const match = /^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error("公司 Logo 格式无效，请重新上传 PNG、JPG 或 WebP 图片。");
  const bytes = Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0));
  if (!bytes.byteLength || bytes.byteLength > 2 * 1024 * 1024) throw new Error("公司 Logo 必须是小于 2MB 的 WebP 图片。");
  const key = `matrix-logo/${id}.webp`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=0, must-revalidate" } });
  return key;
}

export async function handleArticleApi(request: Request, env: ArticleEnv, url: URL): Promise<Response | null> {
  if (url.pathname.startsWith("/api/") && isCrossOriginMutation(request)) return json({ error: "不允许跨站修改数据。" }, 403);
  const secure = url.protocol === "https:" ? "; Secure" : "";
  if (url.pathname === "/api/daily-automation-status") {
    if (request.method !== "GET") return json({ error: "Method Not Allowed" }, 405);
    try {
      const result = await env.DB.prepare("SELECT report_date AS date,attempted_at AS attemptedAt,status FROM daily_automation_runs ORDER BY report_date DESC LIMIT 7").all<Record<string, unknown>>();
      return json({ items: (result.results ?? []).map(item => ({ date: String(item.date), attemptedAt: String(item.attemptedAt), status: String(item.status) })) });
    } catch { return json({ items: [], configured: false }, 503); }
  }
  if (url.pathname === "/api/daily-automation-drafts") {
    if (request.method !== "GET") return json({ error: "Method Not Allowed" }, 405);
    if (!await authenticated(request, env)) return json({ error: "请先登录管理员账号。" }, 401);
    const result = await env.DB.prepare("SELECT report_date AS date,attempted_at AS attemptedAt,status,reason,draft_json AS draft FROM daily_automation_runs ORDER BY report_date DESC LIMIT 14").all<Record<string, unknown>>();
    return json({ items: (result.results ?? []).map(item => ({ date: String(item.date), attemptedAt: String(item.attemptedAt), status: String(item.status), reason: String(item.reason || ""), draft: (() => { try { return JSON.parse(String(item.draft)); } catch { return null; } })() })) });
  }
  if (url.pathname === "/api/daily-reports" || url.pathname.startsWith("/api/daily-reports/")) {
    if (url.pathname !== "/api/daily-reports") {
      if (request.method !== "GET") return json({ error: "Method Not Allowed" }, 405);
      const date = url.pathname.slice("/api/daily-reports/".length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "日报日期无效。" }, 400);
      const item = await env.DB.prepare("SELECT report_date AS date,title,body,edition_json FROM daily_reports WHERE report_date=?").bind(date).first<Record<string, unknown>>();
      return item ? json({ item: { date: String(item.date), title: String(item.title), body: String(item.body), edition: dailyEdition(item.edition_json) } }) : json({ error: "日报不存在。" }, 404);
    }
    if (request.method === "POST" || request.method === "PATCH") {
      if (!await authenticated(request, env)) return json({ error: "请先登录管理员账号。" }, 401);
      const raw = await request.text();
      if (raw.length > 220000) return json({ error: "日报内容过长。" }, 413);
      let data;
      try { data = JSON.parse(raw); } catch { return json({ error: "提交格式不正确。" }, 400); }
      if (!data || typeof data !== "object" || Array.isArray(data)) return json({ error: "提交格式不正确。" }, 400);
      const date = typeof data?.date === "string" ? data.date : "";
      const title = typeof data?.title === "string" ? data.title.trim() : "";
      const body = typeof data?.body === "string" ? data.body.trim() : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || !title || title.length > 160 || !body || body.length > 80000) return json({ error: "请填写有效日期、标题（最多 160 字）和正文（最多 80000 字）。" }, 400);
      const hasEdition = Object.hasOwn(data, "edition");
      if (hasEdition && data.edition !== null) {
        const validation = validateDailyEdition(data.edition);
        if (!validation.ok) return json({ error: "日报结构化内容格式不正确。", details: validation.errors.slice(0, 3) }, 400);
      }
      const editionJson = hasEdition && data.edition !== null ? JSON.stringify(data.edition) : null;
      if (editionJson && editionJson.length > 120000) return json({ error: "日报结构化内容过长。" }, 413);
      try {
        if (request.method === "PATCH") {
          const updated = await env.DB.prepare("UPDATE daily_reports SET title=?,body=?,edition_json=CASE WHEN ?=1 THEN ? WHEN body<>? THEN NULL ELSE edition_json END,updated_at=? WHERE report_date=?").bind(title,body,hasEdition ? 1 : 0,editionJson,body,new Date().toISOString(),date).run();
          if (!updated.meta.changes) return json({ error: "日报不存在，请刷新列表。" }, 404);
          const saved = await env.DB.prepare("SELECT edition_json FROM daily_reports WHERE report_date=?").bind(date).first<Record<string, unknown>>();
          return json({ item: { date, title, body, edition: dailyEdition(saved?.edition_json) } });
        }
        const result = await env.DB.prepare("INSERT OR IGNORE INTO daily_reports (report_date,title,body,source_thread,updated_at,edition_json) VALUES (?,?,?,?,?,?)").bind(date,title,body,"manual-admin",new Date().toISOString(),editionJson).run();
        if (!result.meta.changes) return json({ error: "这一天已有日报，请勿重复发布。" }, 409);
        return json({ item: { date, title, body, edition: dailyEdition(editionJson) } }, 201);
      } catch { return json({ error: "发布失败，请稍后重试。" }, 503); }
    }
    if (request.method !== "GET") return json({error:"Method Not Allowed"},405);
    if (url.searchParams.get("index") === "1") {
      const result = await env.DB.prepare("SELECT report_date AS date,title,edition_json FROM daily_reports ORDER BY report_date DESC LIMIT 90").all<Record<string, unknown>>();
      return json({ items: (result.results ?? []).map((item) => ({ date: String(item.date), title: String(item.title), leadTitle: dailyLeadTitle(dailyEdition(item.edition_json), String(item.title)) })) });
    }
    const result = await env.DB.prepare("SELECT report_date AS date,title,body FROM daily_reports ORDER BY report_date DESC LIMIT 90").all();
    return json({items:result.results ?? []});
  }
  if (url.pathname === "/api/site-updates" && request.method === "GET") {
    const result = await env.DB.prepare("SELECT id,type,title,detail,created_at FROM site_content_updates ORDER BY created_at DESC, id DESC").all<Record<string, unknown>>();
    return json({ items: (result.results ?? []).map((item) => ({ id: String(item.id), version: "内容更新", date: String(item.created_at), status: "published", title: String(item.title), summary: "后台发布", productAdditions: readProductUpdate(String(item.detail)).productAdditions, addedProducts: readProductUpdate(String(item.detail)).addedProducts ?? null, changes: [{ type: String(item.type), text: readProductUpdate(String(item.detail)).text }] })) });
  }
  if (url.pathname === "/api/article-admin/session") {
    if (request.method === "GET") return json({ authenticated: await authenticated(request, env) });
    if (request.method === "DELETE") { const token = cookie(request, articleCookie); if (token) { await ensureSchema(env.DB); await env.DB.prepare("DELETE FROM article_admin_sessions WHERE token = ?").bind(token).run(); } return json({ authenticated: false }, 200, `${articleCookie}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`); }
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const username = clean(body.username, 60); const password = clean(body.password, 120);
    if (!env.ARTICLE_ADMIN_USERNAME || !env.ARTICLE_ADMIN_PASSWORD_HASH || username !== env.ARTICLE_ADMIN_USERNAME || await hash(`${username}:${password}`) !== env.ARTICLE_ADMIN_PASSWORD_HASH) return json({ error: "账号或密码错误。" }, 401);
    await ensureSchema(env.DB); const token = crypto.randomUUID(); const expires = new Date(Date.now() + 604800000).toISOString();
    await env.DB.prepare("INSERT INTO article_admin_sessions (token, expires_at) VALUES (?, ?)").bind(token, expires).run();
    return json({ authenticated: true }, 200, `${articleCookie}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`);
  }
  if (url.pathname === "/api/articles" && request.method === "GET") { await ensureSchema(env.DB); const result = await env.DB.prepare("SELECT id, slug, title, company, matrix_company, category, summary, tags, view_count, published_at, updated_at FROM analysis_articles ORDER BY published_at DESC").all<Record<string, unknown>>(); return json({ items: (result.results ?? []).map((item) => row(item, false)) }); }
  if (url.pathname.startsWith("/api/articles/") && url.pathname.endsWith("/view") && request.method === "POST") { const slug = url.pathname.slice(14, -5); await ensureSchema(env.DB); const result = await env.DB.prepare("UPDATE analysis_articles SET view_count = view_count + 1 WHERE slug = ?").bind(slug).run(); if (!result.meta.changes) return json({ error: "文章不存在。" }, 404); const item = await env.DB.prepare("SELECT view_count FROM analysis_articles WHERE slug = ?").bind(slug).first<Record<string, unknown>>(); return json({ views: Number(item?.view_count || 0) }); }
  if (url.pathname.startsWith("/api/articles/") && request.method === "GET") { const slug = url.pathname.slice(14); await ensureSchema(env.DB); const item = await env.DB.prepare("SELECT * FROM analysis_articles WHERE slug = ?").bind(slug).first<Record<string, unknown>>(); return item ? json({ item: row(item) }) : json({ error: "文章不存在。" }, 404); }
  if (url.pathname === "/api/matrix" && request.method === "GET") { await ensureSchema(env.DB); const result = await env.DB.prepare("SELECT * FROM matrix_companies ORDER BY created_at DESC").all<Record<string, unknown>>(); return json({ items: (result.results ?? []).map(matrixRow) }); }
  if (url.pathname.startsWith("/api/matrix-logos/") && request.method === "GET") {
    const id = url.pathname.slice("/api/matrix-logos/".length).replace(/\.webp$/i, "");
    if (!/^[a-f0-9-]{36}$/i.test(id)) return new Response("Not Found", { status: 404 });
    await ensureSchema(env.DB);
    const item = await env.DB.prepare("SELECT logo FROM matrix_companies WHERE id = ? AND deleted = 0").bind(id).first<Record<string, unknown>>();
    if (!item || !String(item.logo).startsWith("matrix-logo/")) return new Response("Not Found", { status: 404 });
    const object = await env.MEDIA.get(String(item.logo));
    return object ? new Response(object.body, { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=0, must-revalidate" } }) : new Response("Not Found", { status: 404 });
  }
  if (!url.pathname.startsWith("/api/article-admin/articles") && !url.pathname.startsWith("/api/article-admin/matrix")) return null;
  if (url.pathname === "/api/article-admin/matrix" || url.pathname.startsWith("/api/article-admin/matrix/")) {
    if (request.headers.get("Origin") && request.headers.get("Origin") !== url.origin) return json({ error: "Invalid request origin" }, 403);
    if (!await authenticated(request, env)) return json({ error: "请先登录文章后台。" }, 401);
    await ensureSchema(env.DB);
    const id = url.pathname.slice("/api/article-admin/matrix/".length);
    if (request.method === "DELETE") {
      if (!/^[a-f0-9-]{36}$/i.test(id)) return json({ error: "无效矩阵标识。" }, 400);
      const result = await env.DB.prepare("DELETE FROM matrix_companies WHERE id=?").bind(id).run();
      return result.meta.changes ? json({ deleted: true }) : json({ error: "公司不存在。" }, 404);
    }
    if (url.pathname === "/api/article-admin/matrix" && request.method === "GET") { const result = await env.DB.prepare("SELECT * FROM matrix_companies ORDER BY created_at DESC").all<Record<string, unknown>>(); return json({ items: (result.results ?? []).map(matrixRow) }); }
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const company = clean(body?.company, 140); const products = Array.isArray(body?.products) ? body.products.map((item) => clean(item, 60)).filter(Boolean).slice(0, 40) : []; const category = clean(body?.category, 40) || "voice"; const note = clean(body?.note, 500); const sourceCompany = clean(body?.sourceCompany, 140); const deleted = Boolean(body?.deleted);
    if (!company || (!products.length && !deleted)) return json({ error: "请填写公司名称和至少一个产品。" }, 400);
    let province = clean(body?.province, 40);
    if (province && province !== "unknown" && !provinces.includes(province)) return json({ error: "请选择有效省份或地区。" }, 400);
    if (!deleted && request.method === "POST" && !province) return json({ error: "请选择所在省份或所在地待核实。" }, 400);
    const now = new Date().toISOString();
    if (url.pathname === "/api/article-admin/matrix" && request.method === "POST") { const id = crypto.randomUUID(); const logo = await saveMatrixLogo(body?.logo, env, id); const item={id,company,products,category,logo,note,sourceCompany,deleted,province}; const insert = env.DB.prepare("INSERT INTO matrix_companies (id,company,products,category,logo,note,source_company,deleted,province,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(item.id,item.company,JSON.stringify(item.products),item.category,item.logo,item.note,item.sourceCompany,item.deleted ? 1 : 0,item.province,now,now); await env.DB.batch([insert, ...(!deleted ? [contentUpdate(env.DB, "矩阵产品", `${sourceCompany ? "更新" : "新增"}矩阵：${company}`, productUpdateDetail(products, sourceCompany ? matrixCompanies.find(c => c.company === sourceCompany)?.products ?? null : []), now)] : [])]); return json({ item: matrixRow({ ...item, products: JSON.stringify(item.products), source_company: item.sourceCompany, updated_at: now }) },201); }
    if (!/^[a-f0-9-]{36}$/i.test(id)) return json({ error: "无效矩阵标识。" }, 400);
    if (request.method === "PATCH") { const previous = await env.DB.prepare("SELECT logo, products, deleted, province FROM matrix_companies WHERE id=?").bind(id).first<Record<string, unknown>>(); if (!previous) return json({ error:"公司不存在。" },404); if (!body || !Object.hasOwn(body, "province")) province = String(previous.province || ""); else if (!province && !deleted) return json({ error: "请选择所在省份或所在地待核实。" }, 400); const logo = await saveMatrixLogo(body?.logo, env, id, String(previous.logo || "")); const update=env.DB.prepare("UPDATE matrix_companies SET company=?,products=?,category=?,logo=?,note=?,source_company=?,deleted=?,province=?,updated_at=? WHERE id=?").bind(company,JSON.stringify(products),category,logo,note,sourceCompany,deleted ? 1 : 0,province,now,id); const changed = !deleted && (String(previous.products) !== JSON.stringify(products) || Number(previous.deleted) || String(previous.province || "") !== province); const [result] = await env.DB.batch([update, ...(changed ? [env.DB.prepare("INSERT INTO site_content_updates (id,type,title,detail,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM matrix_companies WHERE id=?)").bind(crypto.randomUUID(), "矩阵产品", `更新矩阵：${company}`, productUpdateDetail(products, Number(previous.deleted) ? null : JSON.parse(String(previous.products))), now, id)] : [])]); return result.meta.changes?json({item: matrixRow({id,company,products:JSON.stringify(products),category,logo,note,source_company:sourceCompany,province,updated_at:now,deleted:deleted ? 1 : 0})}):json({error:"公司不存在。"},404); }
    return new Response("Method Not Allowed",{status:405});
  }
  if (request.headers.get("Origin") && request.headers.get("Origin") !== url.origin) return json({ error: "Invalid request origin" }, 403);
  if (!await authenticated(request, env)) return json({ error: "请先登录文章后台。" }, 401);
  await ensureSchema(env.DB);
  const id = url.pathname.slice("/api/article-admin/articles/".length);
  if (url.pathname === "/api/article-admin/articles" && request.method === "GET") { const result = await env.DB.prepare("SELECT * FROM analysis_articles ORDER BY published_at DESC").all<Record<string, unknown>>(); return json({ items: (result.results ?? []).map((item) => row(item)) }); }
  if (url.pathname === "/api/article-admin/articles" && request.method === "POST") { const rawInput = await request.json().catch(() => null) as Record<string, unknown> | null; const article = input(rawInput); if (!article) return json({ error: "请完整填写文章字段。" }, 400); const now = new Date().toISOString(); const item = { id: crypto.randomUUID(), ...article, publishedAt: now, updatedAt: now }; try { const insert = env.DB.prepare("INSERT INTO analysis_articles (id, slug, title, company, category, summary, tags, body, recommendations, matrix_company, published_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(item.id, item.slug, item.title, item.company, item.category, item.summary, JSON.stringify(item.tags), item.body, JSON.stringify(item.recommendations), item.matrixCompany, item.publishedAt, item.updatedAt); await env.DB.batch([insert, contentUpdate(env.DB, "行业文章", `新增文章：${item.title}`, `${item.company}｜${item.summary}`, now)]); return json({ item }, 201); } catch (error) { if (String(error).includes("UNIQUE constraint")) return json({ error: "文章标识已存在。" }, 409); return json({ error: "发布失败，文章与更新记录均未保存，请重试。" }, 500); } }
  if (!/^[a-f0-9-]{36}$/i.test(id)) return json({ error: "无效文章标识。" }, 400);
  if (request.method === "DELETE") { const result = await env.DB.prepare("DELETE FROM analysis_articles WHERE id = ?").bind(id).run(); return result.meta.changes ? json({ deleted: true }) : json({ error: "文章不存在。" }, 404); }
  if (request.method === "PATCH") { const rawInput = await request.json().catch(() => null) as Record<string, unknown> | null; const article = input(rawInput); if (!article) return json({ error: "请完整填写文章字段。" }, 400); try { const result = await env.DB.prepare("UPDATE analysis_articles SET slug=?, title=?, company=?, category=?, summary=?, tags=?, body=?, recommendations=?, matrix_company=COALESCE(?, matrix_company), updated_at=? WHERE id=?").bind(article.slug, article.title, article.company, article.category, article.summary, JSON.stringify(article.tags), article.body, JSON.stringify(article.recommendations), rawInput && Object.hasOwn(rawInput, "matrixCompany") ? article.matrixCompany : null, new Date().toISOString(), id).run(); return result.meta.changes ? json({ item: { id, ...article } }) : json({ error: "文章不存在。" }, 404); } catch { return json({ error: "文章标识已存在。" }, 409); } }
  return new Response("Method Not Allowed", { status: 405 });
}
