const key = name => name.trim().normalize('NFKC').toLowerCase();
export function productUpdateDetail(products, previous) {
  const before = previous === null ? null : new Set(previous.map(key));
  const unique = [...new Map(products.map(name => [key(name), name])).values()];
  return JSON.stringify({ schema: 'product-update-v1', text: `产品清单：${products.join('、')}`, addedProducts: before === null ? null : unique.filter(name => !before.has(key(name))) });
}
export function readProductUpdate(detail) {
  try {
    const data = JSON.parse(detail);
    if (data.schema === 'product-update-v1' && typeof data.text === 'string') {
      return { text: data.text, productAdditions: Array.isArray(data.addedProducts) ? data.addedProducts.length : null, addedProducts: Array.isArray(data.addedProducts) ? data.addedProducts.filter(name => typeof name === 'string' && name.trim()) : null };
    }
  } catch {}
  return { text: detail, productAdditions: null };
}
