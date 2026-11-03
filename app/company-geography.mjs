import locations from "./company-regions.json" with { type: "json" };

const byCompany = new Map(locations.map((item) => [item.company, item]));
export const UNKNOWN_REGION = "unknown";
export function companyLocation(company) {
  const original = byCompany.get(company.sourceCompany || company.company) || null;
  if (company.province === UNKNOWN_REGION) return null;
  if (company.province) return { company: company.company, province: company.province, city: original?.province === company.province ? original.city : "城市未填写", basis: "管理员填写省份", source: null };
  return original;
}
export function matchesRegion(company, region) {
  if (!region) return true;
  const location = companyLocation(company);
  return region === UNKNOWN_REGION ? !location : location?.province === region;
}
export function regionSummary(companies) {
  const counts = new Map();
  let unknown = 0;
  for (const company of companies) {
    const location = companyLocation(company);
    if (!location) { unknown++; continue; }
    counts.set(location.province, (counts.get(location.province) || 0) + 1);
  }
  return { unknown, located: companies.length - unknown, regions: [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN")) };
}

// Equirectangular projection at 35°N. Preserve every polygon/ring, including islands.
export function mapShapes(collection) {
  const project = ([lon, lat]) => [lon * Math.cos(35 * Math.PI / 180), -lat];
  // DataV includes a separate dashed maritime overlay; it is not a province.
  const features = collection.features.filter((feature) => String(feature.properties.adcode) !== "100000_JD").map((feature) => ({
    name: feature.properties.name,
    id: String(feature.properties.adcode),
    rings: (feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates).flat().map((ring) => ring.map(project)),
    center: feature.properties.center ? project(feature.properties.center) : null,
  }));
  // Keep southern island rings in an inset instead of expanding the main extent.
  const isInsetRing = (ring) => ring.every(([, y]) => y > -18);
  const allRings = features.flatMap((feature) => feature.rings);
  const points = allRings.filter((ring) => !isInsetRing(ring)).flat();
  if (!points.length) throw new Error("Empty map geometry");
  const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const scale = Math.min(660 / (Math.max(...xs) - minX), 520 / (Math.max(...ys) - minY));
  const convert = ([x, y]) => [(x - minX) * scale + 8, (y - minY) * scale + 8];
  const width = (Math.max(...xs) - minX) * scale + 16;
  const height = (Math.max(...ys) - minY) * scale + 16;
  const islandPoints = allRings.filter(isInsetRing).flat();
  const inset = islandPoints.length ? { x: width - 86, y: height - 124, width: 78, height: 116 } : null;
  const islandXs = islandPoints.map(([x]) => x), islandYs = islandPoints.map(([, y]) => y);
  const islandMinX = Math.min(...islandXs), islandMinY = Math.min(...islandYs);
  const islandScale = inset ? Math.min(58 / (Math.max(...islandXs) - islandMinX), 80 / (Math.max(...islandYs) - islandMinY)) : 1;
  const convertIsland = ([x, y]) => [inset.x + 10 + (x - islandMinX) * islandScale, inset.y + 8 + (y - islandMinY) * islandScale];
  return {
    width, height, inset,
    features: features.map(({ rings, center, ...feature }) => ({ ...feature, center: center && convert(center), path: rings.map((ring) => { const transform = isInsetRing(ring) ? convertIsland : convert; return ring.map((point, index) => `${index ? "L" : "M"}${transform(point).map((value) => value.toFixed(2)).join(",")}`).join("") + "Z"; }).join("") })),
  };
}
