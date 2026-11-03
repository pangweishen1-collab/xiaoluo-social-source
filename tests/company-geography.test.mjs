import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import locations from "../app/company-regions.json" with { type: "json" };
import { companyLocation, matchesRegion, regionSummary, mapShapes, UNKNOWN_REGION } from "../app/company-geography.mjs";

test("region counts use companies, not products, and keep unlocated entries separate", () => {
  const entries = [{ company: "迅雷", products: Array(99) }, { company: "腾讯音乐娱乐集团" }, { company: "未知公司" }];
  assert.deepEqual(regionSummary(entries), { unknown: 1, located: 2, regions: [{ name: "广东省", count: 2 }] });
  assert.equal(matchesRegion(entries[2], UNKNOWN_REGION), true);
  assert.equal(matchesRegion(entries[0], "北京市"), false);
  assert.equal(matchesRegion(entries[0], ""), true);
  assert.deepEqual(regionSummary([]), { unknown: 0, located: 0, regions: [] });
});

test("renamed admin overrides retain their source geography; additions do not inherit guesses", () => {
  assert.equal(companyLocation({ company: "自定义显示名", sourceCompany: "迅雷" }).city, "深圳");
  assert.equal(companyLocation({ company: "深圳新公司" }), null);
});

test("location entries are unique and resolve to named province features", () => {
  const geo = JSON.parse(readFileSync(new URL("../public/china-provinces.json", import.meta.url)));
  const provinces = new Set(geo.features.map((feature) => feature.properties.name).filter(Boolean));
  assert.equal(provinces.size, 34);
  assert.equal(new Set(locations.map((item) => item.company)).size, locations.length);
  for (const item of locations) {
    assert.ok(provinces.has(item.province));
    assert.ok(item.basis && item.city);
    if (item.source) assert.ok(item.source.startsWith("https://"));
  }
  const map = mapShapes(geo);
  assert.equal(map.features.length, 34);
  assert.ok(!map.features.some((feature) => feature.id === "100000_JD"));
  assert.ok(map.width > 0 && map.height > 0);
  assert.ok(map.width / map.height > 1.35, "main extent must not include the empty southern ocean strip");
  assert.ok(map.inset && map.inset.y + map.inset.height <= map.height);
  for (const feature of map.features) {
    assert.ok(feature.path.startsWith("M"));
    assert.ok(!/NaN|Infinity/.test(feature.path));
    const source = geo.features.find((item) => String(item.properties.adcode) === feature.id);
    const rings = (source.geometry.type === "Polygon" ? [source.geometry.coordinates] : source.geometry.coordinates).flat().length;
    assert.equal(feature.path.split("Z").length - 1, rings);
  }
});
test("administrator province changes update counts and filters", () => {
  const before = { company: "新增公司", province: "广东省" };
  assert.equal(companyLocation(before).province, "广东省");
  assert.equal(regionSummary([before]).regions[0].count, 1);
  const after = { ...before, province: "浙江省" };
  assert.equal(matchesRegion(after, "广东省"), false);
  assert.equal(matchesRegion(after, "浙江省"), true);
  assert.equal(regionSummary([after]).regions[0].name, "浙江省");
  assert.equal(regionSummary([{ ...after, province: "unknown" }]).unknown, 1);
});
