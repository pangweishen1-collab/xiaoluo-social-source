import { isCrossOriginMutation } from "../shared/request-security.mjs";

type InquiryEnv = { DB: D1Database };

const inquiryTypes = new Set([
  "资源入驻", "行业内容合作", "年度合作伙伴",
  "海外公司注册", "包体上架", "海外支付", "海外小游戏与 SLG",
  "直播礼物特效与定制", "投流与增长", "其他",
]);
const recentSenders = new Map<string, number>();

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function field(body: Record<string, unknown>, key: string, maxLength: number) {
  const value = body[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(trimmed) ? trimmed : null;
}

export async function handleBusinessInquiry(request: Request, env: InquiryEnv) {
  if (request.method !== "POST") return reply({ error: "不支持此操作。" }, 405);
  if (isCrossOriginMutation(request)) return reply({ error: "不允许跨站提交。" }, 403);
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) return reply({ error: "提交格式不正确。" }, 415);
  if (Number(request.headers.get("Content-Length")) > 6000) return reply({ error: "需求内容过长。" }, 413);

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 6000) return reply({ error: "需求内容过长。" }, 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid body");
    body = parsed as Record<string, unknown>;
  } catch { return reply({ error: "提交格式不正确。" }, 400); }

  // A hidden field slows down basic form bots without exposing the recipient address.
  if (body.website) return reply({ ok: true });

  const companyProduct = field(body, "companyProduct", 100);
  const region = field(body, "region", 80);
  const type = field(body, "type", 40);
  const description = field(body, "description", 1200);
  const budget = field(body, "budget", 80);
  const timeline = field(body, "timeline", 80);
  const contact = field(body, "contact", 160);
  if (!companyProduct || !region || !type || !inquiryTypes.has(type) || !description || !budget || !timeline || !contact) {
    return reply({ error: "请完整填写行业需求，每项内容不要超过字数限制。" }, 400);
  }

  const sender = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "local";
  const now = Date.now();
  if ((recentSenders.get(sender) ?? 0) > now - 60_000) return reply({ error: "提交太频繁，请一分钟后再试。" }, 429);
  if (recentSenders.size > 1000) for (const [key, sentAt] of recentSenders) if (sentAt < now - 60_000) recentSenders.delete(key);
  recentSenders.set(sender, now);

  try {
    await env.DB.prepare("INSERT INTO business_inquiries (id, company_product, region, type, description, budget, timeline, contact, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), companyProduct, region, type, description, budget, timeline, contact, new Date(now).toISOString()).run();
    return reply({ ok: true }, 201);
  } catch {
    recentSenders.delete(sender);
    return reply({ error: "需求保存失败，请稍后重试。" }, 503);
  }
}

export async function listBusinessInquiries(request: Request, env: InquiryEnv, authorized: boolean) {
  if (!authorized) return reply({ error: "请先登录后台。" }, 401);
  if (request.method !== "GET") return reply({ error: "不支持此操作。" }, 405);
  const page = Math.max(1, Math.min(10000, Number.parseInt(new URL(request.url).searchParams.get("page") || "1", 10) || 1));
  try {
    const result = await env.DB.prepare("SELECT id, company_product AS companyProduct, region, type, description, budget, timeline, contact, created_at AS createdAt FROM business_inquiries ORDER BY created_at DESC, id DESC LIMIT 21 OFFSET ?").bind((page - 1) * 20).all();
    return reply({ items: result.results.slice(0, 20), hasMore: result.results.length > 20, page });
  } catch {
    return reply({ error: "需求列表暂时无法加载，请重试。" }, 503);
  }
}
