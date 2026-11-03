export function beijingDay(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
// Calendar days in Beijing: today plus the preceding six days, not the latest event date.
export function activityWindow(entries, now) {
  const today = beijingDay(now);
  if (!today) return null;
  const start = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10);
  const records = [...new Map(entries.filter(e => {
    const day = beijingDay(e.date);
    return e.status === 'published' && day && day >= start && day <= today &&
      e.changes?.some(c => ['矩阵产品', '行业文章'].includes(c.type));
  }).map(e => [e.id, e])).values()];
  return { start, today, week: records.length, day: records.filter(e => beijingDay(e.date) === today).length };
}
export function activityByType(entries, articles, now) {
  const range = activityWindow(entries, now);
  if (!range) return null;
  const count = start => {
    const inside = value => { const day = beijingDay(value); return day && day >= start && day <= range.today; };
    const matrices = [...new Map(entries.filter(e => e.status === 'published' && inside(e.date) && e.changes?.some(c => c.type === '矩阵产品')).map(e => [e.id, e])).values()];
    const known = matrices.filter(e => Number.isInteger(e.productAdditions) && e.productAdditions >= 0);
    return {
      companies: new Set(matrices.filter(e => e.title.startsWith('新增矩阵：')).map(e => e.title.slice('新增矩阵：'.length))).size,
      products: known.length ? known.reduce((n, e) => n + e.productAdditions, 0) : matrices.length ? null : 0,
      ...(known.length && known.length < matrices.length ? { productsPartial: true } : {}),
      articles: new Set(articles.filter(a => inside(a.publishedAt)).map(a => a.slug)).size,
    };
  };
  return { week: count(range.start), day: count(range.today) };
}
export function atlasActivity(entries, articles) {
  const events = [...new Map(entries.filter(e => e.status === 'published' && beijingDay(e.date) && e.changes?.some(c => ['矩阵产品', '行业文章'].includes(c.type))).map(e => [e.id, e])).values()];
  const dates = [...events.map(e => beijingDay(e.date)), ...articles.map(a => beijingDay(a.publishedAt))].filter(Boolean).sort();
  const date = dates.at(-1) || null;
  const recent = events.filter(e => beijingDay(e.date) === date);
  const count = prefix => new Set(recent.filter(e => e.title.startsWith(prefix)).map(e => e.title.slice(prefix.length))).size;
  return { date, companies: count('新增矩阵：'), updatedCompanies: count('更新矩阵：'), productAdditions: recent.reduce((n, e) => n + (Number.isInteger(e.productAdditions) && e.productAdditions > 0 ? e.productAdditions : 0), 0), articles: new Set(articles.filter(a => date && beijingDay(a.publishedAt) === date).map(a => a.slug)).size, entries: recent };
}
