export const SEARCH_LIMIT = 20;
const text = value => typeof value === "string" ? value : "";
const array = value => Array.isArray(value) ? value : [];
const records = value => array(value).filter(item => item && typeof item === "object");
export const normalizeSearch = value => text(value).normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
const plain = value => text(value).replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[#*`>|]/g, " ").replace(/\s+/g, " ").trim();

export function buildSearchIndex({ articles = [], daily = [], matrix = null, builtIns = [], talent = [], tools = [] } = {}) {
  const documents = [];
  const add = (kind, id, title, description, href, keywords = "") => {
    if (!text(title).trim() || !href) return;
    documents.push({ id: `${kind}:${id}`, kind, title, description: plain(description), href, keywords: plain(keywords) });
  };
  for (const item of records(articles)) {
    if (item.slug) add("公司分析", item.slug, item.title, item.summary, `/analysis/${encodeURIComponent(item.slug)}`, [item.company, ...array(item.tags)].join(" "));
  }
  for (const item of records(daily)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(item.date)) add("小骆日报", item.date, item.title, item.body, `/daily/${item.date}`, item.date);
  }
  // A failed matrix request must not resurrect companies deleted by the owner.
  if (Array.isArray(matrix)) {
    const overrides = new Map(records(matrix).filter(item => item.sourceCompany).map(item => [item.sourceCompany, item]));
    const merged = [...records(builtIns).map(base => ({ ...base, ...overrides.get(base.company), sourceCompany: base.company })), ...records(matrix).filter(item => !item.sourceCompany)];
    for (const item of merged.filter(item => !item.deleted)) {
      add("公司与产品", item.id || item.sourceCompany || item.company, item.company, array(item.products).join(" · "), `/?view=matrix&company=${encodeURIComponent(item.company)}`, [item.sourceCompany, item.note].join(" "));
    }
  }
  for (const item of records(talent)) {
    if (!item.id || !["jobs", "people"].includes(item.kind)) continue;
    const kind = item.kind === "jobs" ? "招聘" : "求职";
    add(kind, item.id, item.kind === "jobs" ? [item.company, item.title].filter(Boolean).join(" · ") : item.title,
      [item.city, item.focus, item.description, item.note, ...array(item.tags)].filter(Boolean).join(" · "),
      `/?view=talent&kind=${item.kind}#talent-${encodeURIComponent(item.id)}`);
  }
  for (const item of records(tools)) {
    if (/^https?:\/\//i.test(item.url)) add("实用工具", item.url, item.name, item.text, item.url, item.group);
  }
  add("入驻服务商", "jishun-animation", "极瞬动画", "为语聊与直播产品提供成品直播礼物、礼物特效与定制动画设计。", "/?view=talent&market=providers", "直播互动 视觉设计 座驾 头像框 活动视觉素材");
  add("栏目", "business", "商务合作", "海外小游戏 · 海外支付 · 成品直播礼物 · 投流与流量增长 · 内容共创 · 行业资源对接", "/?view=business");
  return [...new Map(documents.map(item => [item.id, item])).values()];
}

export function searchSite(documents, query) {
  const term = normalizeSearch(query).slice(0, 80);
  if (!term) return [];
  const words = term.split(" ");
  return documents.map(item => {
    const title = normalizeSearch(item.title);
    const keywords = normalizeSearch(item.keywords);
    const content = normalizeSearch(`${item.title} ${item.keywords} ${item.description}`);
    if (!words.every(word => content.includes(word))) return null;
    const score = title === term ? 100 : title.startsWith(term) ? 80 : title.includes(term) ? 60 : keywords.includes(term) ? 40 : 20;
    const source = item.description || item.keywords;
    const index = normalizeSearch(source).indexOf(words[0]);
    const start = Math.max(0, index - 24);
    const excerpt = `${start ? "…" : ""}${source.slice(start, start + 110)}${source.length > start + 110 ? "…" : ""}`;
    return { ...item, score, excerpt };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "zh-CN"));
}
