import { isCrossOriginMutation } from "../shared/request-security.mjs";
export async function handleDanmaku(request: Request, db: D1Database) {
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  if (isCrossOriginMutation(request)) return json({ error: "不允许跨站提交。" }, 403);
  try {
    if (request.method === "GET") return json({ messages: (await db.prepare("SELECT id, nickname, content, created_at AS createdAt FROM danmaku_messages ORDER BY created_at DESC LIMIT 60").all()).results });
    if (request.method !== "POST") return json({ error: "不支持此操作。" }, 405);
    const raw = await request.text();
    if (raw.length > 2048) return json({ error: "留言过长。" }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: "提交格式不正确。" }, 400); }
    const nickname = typeof body?.nickname === "string" ? body.nickname.trim() : "";
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!nickname || nickname.length > 16 || !content || content.length > 80) return json({ error: "昵称需 1–16 字，留言需 1–80 字。" }, 400);
    const sender = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(request.headers.get("CF-Connecting-IP") || "local-preview")))).map(n => n.toString(16).padStart(2, "0")).join("");
    const id = crypto.randomUUID(), now = Date.now();
    const result = await db.prepare("INSERT INTO danmaku_messages (id, nickname, content, sender, created_at) SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM danmaku_messages WHERE sender = ? AND created_at > ?)").bind(id, nickname, content, sender, now, sender, now - 30000).run();
    if (!result.meta.changes) return json({ error: "发送太快了，请 30 秒后再试。" }, 429);
    return json({ message: { id, nickname, content, createdAt: now } }, 201);
  } catch { return json({ error: "留言服务暂时不可用，请稍后重试。" }, 503); }
}
