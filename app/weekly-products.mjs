import { beijingDay } from './atlas-activity.mjs';
export function weeklyProducts(entries, now) {
  const today = beijingDay(now);
  if (!today) return [];
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  const monday = date.toISOString().slice(0, 10);
  const companies = new Map();
  for (const entry of entries) {
    const day = beijingDay(entry.date);
    if (entry.status !== 'published' || !day || day < monday || day > today || !entry.changes?.some(c => c.type === '矩阵产品') || !Array.isArray(entry.addedProducts)) continue;
    const company = entry.title.replace(/^(新增|更新)矩阵：/, '').trim();
    if (!company) continue;
    const products = companies.get(company) || new Map();
    for (const name of entry.addedProducts) if (typeof name === 'string' && name.trim()) products.set(name.trim().normalize('NFKC').toLowerCase(), name.trim());
    if (products.size) companies.set(company, products);
  }
  return [...companies].map(([company, products]) => ({ company, products: [...products.values()] }));
}
