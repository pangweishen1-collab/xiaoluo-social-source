import test from "node:test";
import assert from "node:assert/strict";
import { researchProducts, researchProductCandidates } from "../app/research-products.mjs";

test("partial input narrows candidates without guessing ambiguous companies", () => {
  const companies = [{ company: "酷麦科技", products: ["Wait"] }, { company: "酷游科技", products: ["Other"] }, { company: "Yalla", products: ["Yalla"] }];
  assert.equal(researchProductCandidates("酷", companies, []).length, 2);
  assert.equal(researchProducts("酷", companies, []), null);
  assert.deepEqual(researchProducts("酷麦", companies, []).products, ["Wait"]);
  assert.deepEqual(researchProducts("麦", companies, []).products, ["Wait"]);
  assert.equal(researchProducts(" y a L L a ", companies, []).company, "Yalla");
  assert.equal(researchProductCandidates("", companies, []).length, 0);
  assert.equal(researchProducts("酷麦", companies, [{ sourceCompany: "酷麦科技", deleted: true }]), null);
  assert.equal(researchProducts("酷麦", [...companies, { company: "酷麦", products: [] }], []).company, "酷麦");
});

test("company shorthand automatically matches without a manual association", () => {
  const companies = [{ company: "欢聚集团", products: ["BIGO LIVE", "imo"] }];
  assert.deepEqual(researchProducts(" 欢聚 ", companies, []).products, ["BIGO LIVE", "imo"]);
  assert.equal(researchProducts("未知公司", companies, []), null);
  assert.equal(researchProducts("欢聚", companies, [{ sourceCompany: "欢聚集团", deleted: true }]), null);
});
const base = [{ company: "道归道科技", products: ["Gami"] }];
test("explicit article selection overrides automatic matching and can be disabled", () => {
  assert.deepEqual(researchProducts("不同的文章公司名称", base, [], "道归道科技").products, ["Gami"]);
  assert.equal(researchProducts("道归道科技", base, [], "__none__"), null);
  assert.equal(researchProducts("道归道科技", base, [], "已删除的公司"), null);
});
test("Fuliao article shows the supplied product and prefers its matrix record", () => {
  assert.deepEqual(researchProducts("杭州富聊科技有限公司", base, []).products, ["Chamet"]);
  const match = researchProducts("杭州富聊科技有限公司", base, [{ company: "杭州富聊科技", products: ["chamet"] }]);
  assert.equal(match.sourceCompany, "杭州富聊科技");
  assert.deepEqual(match.products, ["chamet"]);
  assert.equal(researchProducts("杭州富聊科技有限公司", base, [{ company: "杭州富聊科技", deleted: true }]), null);
});
test("explicit aliases link to the existing company products", () => {
  assert.deepEqual(researchProducts("广州道归道信息科技有限公司", base, []).products, ["Gami"]);
  assert.equal(researchProducts("未知公司", base, []), null);
});
test("admin product changes and deletions take precedence", () => {
  assert.deepEqual(researchProducts("广州道归道信息科技有限公司", base, [{ sourceCompany: "道归道科技", company: "新名称", products: ["Updated"] }]).products, ["Updated"]);
  assert.equal(researchProducts("广州道归道信息科技有限公司", base, [{ sourceCompany: "道归道科技", deleted: true }]), null);
});
