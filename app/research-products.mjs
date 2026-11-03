const aliases = {
  "欢聚": "欢聚集团",
  "杭州富聊科技有限公司": "杭州富聊科技",
  "广州道归道信息科技有限公司": "道归道科技",
  "上海肯斯爪特": "上海肯斯爪特科技有限公司",
  "迅雷有限公司": "迅雷",
  "广州核芯互乐科技有限公司": "广州核心互娱",
  "深圳音果互娱": "音果互娱",
};

const normalize = value => value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");

export function researchProductCandidates(company, builtIns, records) {
  const query = normalize(company.trim());
  if (!query) return [];
  const keys = [...new Set([...builtIns.map(item => item.company), ...records.map(item => item.sourceCompany || item.company)])];
  const matches = keys.flatMap(key => {
    const item = researchProducts(key, builtIns, records, key);
    if (!item) return [];
    const names = [key, item.company, ...Object.keys(aliases).filter(alias => aliases[alias] === key)];
    const exact = names.some(name => normalize(name) === query);
    return names.some(name => normalize(name).includes(query)) ? [{ ...item, exact }] : [];
  });
  const exact = matches.filter(item => item.exact);
  return (exact.length ? exact : matches).map(({ exact, ...item }) => item);
}

export function researchProducts(company, builtIns, records, matrixCompany = "") {
  if (matrixCompany === "__none__") return null;
  if (matrixCompany) company = matrixCompany;
  company = company.trim();
  const key = aliases[company] || company;
  const base = builtIns.find(item => item.company === key);
  const record = records.find(item => item.sourceCompany === key || item.company === company || item.company === key);
  // User-supplied article/product association; do not infer a corporate merger.
  if (key === "杭州富聊科技" && !base && !record) {
    return { company: key, sourceCompany: "Chamet", products: ["Chamet"] };
  }
  if (record?.deleted) return null;
  if (!base && !record) {
    if (matrixCompany) return null;
    const matches = researchProductCandidates(company, builtIns, records);
    return matches.length === 1 ? matches[0] : null;
  }
  return { company: record?.company || base.company, sourceCompany: record?.sourceCompany || base?.company || record.company, products: record?.products || base?.products || [] };
}
