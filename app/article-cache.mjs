const key = (slug) => `xiaoluo:article:${slug}`;
const pending = new Map();
const prefetchedRoutes = new Set();

export function readCachedArticle(slug, storage = globalThis.sessionStorage) {
  if (!slug || !storage) return null;
  try { return JSON.parse(storage.getItem(key(slug)) || "null")?.item || null; } catch { storage.removeItem(key(slug)); return null; }
}

export async function prefetchArticle(slug, version = "", { storage = globalThis.sessionStorage, fetcher = globalThis.fetch } = {}) {
  if (!slug || !storage || !fetcher) return null;
  try {
    const cached = JSON.parse(storage.getItem(key(slug)) || "null");
    if (cached?.item && cached.version === version) return cached.item;
  } catch { storage.removeItem(key(slug)); }
  const requestKey = `${slug}:${version}`;
  if (pending.has(requestKey)) return pending.get(requestKey);
  const request = fetcher(`/api/articles/${encodeURIComponent(slug)}`, { credentials: "same-origin" }).then(async (response) => {
    if (!response.ok) throw new Error("文章暂时无法读取。");
    const item = (await response.json()).item;
    storage.setItem(key(slug), JSON.stringify({ version, item }));
    return item;
  }).finally(() => pending.delete(requestKey));
  pending.set(requestKey, request);
  return request;
}

export function prefetchArticleRoute(slug, documentRef = globalThis.document) {
  if (!slug || !documentRef || prefetchedRoutes.has(slug)) return;
  prefetchedRoutes.add(slug);
  const link = documentRef.createElement("link");
  link.rel = "prefetch";
  link.href = `/analysis/${encodeURIComponent(slug)}`;
  link.as = "document";
  documentRef.head.append(link);
}

export async function incrementArticleView(slug, fetcher = globalThis.fetch) {
  if (!slug || !fetcher) return 0;
  const response = await fetcher(`/api/articles/${encodeURIComponent(slug)}/view`, { method: "POST", credentials: "same-origin" });
  if (!response.ok) throw new Error("阅读量暂时无法更新。");
  return Number((await response.json()).views || 0);
}
