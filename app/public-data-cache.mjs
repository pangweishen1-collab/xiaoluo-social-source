const pending = new Map();
const memory = new Map();
const prefix = "xiaoluo:public:v1:";
const ttl = 30000;
/** @type {(data: any) => boolean} */
const cacheAll = () => true;
function storage() { try { return globalThis.sessionStorage; } catch { return null; } }
export function invalidatePublicData(path) {
  memory.delete(path);
  pending.delete(path);
  try { storage()?.removeItem(prefix + path); } catch {}
}
export function readPublicData(path, { now = Date.now, maxAge = ttl } = {}) {
  let cached = memory.get(path);
  if (!cached) { try { cached = JSON.parse(storage()?.getItem(prefix + path) || "null"); } catch {} }
  return cached && now() - cached.at < maxAge ? cached.data : null;
}
export function loadPublicData(path, { force = false, fetcher = globalThis.fetch, now = Date.now, maxAge = ttl, cacheIf = cacheAll } = {}) {
  if (force) invalidatePublicData(path);
  if (pending.has(path)) return pending.get(path);
  const cached = readPublicData(path, { now, maxAge });
  if (cached !== null) return Promise.resolve(cached);
  const request = Promise.resolve().then(() => fetcher(path, { credentials: "same-origin", cache: "no-store" }))
    .then(response => { if (!response.ok) throw new Error("数据暂时无法加载"); return response.json(); })
    .then(data => {
      if (pending.get(path) === request && cacheIf(data)) {
        const entry = { at: now(), data };
        memory.set(path, entry);
        try { storage()?.setItem(prefix + path, JSON.stringify(entry)); } catch {}
      }
      return data;
    }).finally(() => { if (pending.get(path) === request) pending.delete(path); });
  pending.set(path, request);
  return request;
}
