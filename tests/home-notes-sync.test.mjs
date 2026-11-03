import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = ast.statements.filter(ts.isVariableStatement).flatMap((statement) => [...statement.declarationList.declarations])
  .find((item) => item.name.getText(ast) === "notes");
assert(declaration && ts.isArrayLiteralExpression(declaration.initializer));
const notes = declaration.initializer.elements.map((element) => {
  assert(ts.isObjectLiteralExpression(element));
  return Object.fromEntries(element.properties.map((property) => {
    assert(ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer));
    return [property.name.getText(ast), property.initializer.text];
  }));
});

// Exact original titles and cover bytes observed on the author's logged-in
// public profile on 2026-10-20, excluding its pinned product-map post.
const expected = [
  ["6ad61fa8000000002a005827", "一张月卡，怎么让用户愿意买、经常来？", "3a66c44f08a6ef8e794ec31b95f857e7f69548133a27c12b7c8943b0da6be933"],
  ["6ace3965000000001301b927", "Yalla Ludo让玩家设计礼物？是礼物不好卖了？", "b46bc1136cb7673aff2a5ec0035dbf1a24f49fc09a142ba1a10513bdd25e9b5c"],
  ["6ac7c13e000000001500f5fb", "语聊产品关系卡也能拿来做营销？第一次见！", "9ba93a1080dc2efe744a1f681c9cd90d85c0c0f8dba185efbc5d0a72fa152d97"],
  ["6ac2896d000000001802e747", "这是我目前为止见过做的最好的超跑活动！", "656fcbe6e52316db746841af523a481009ca82853e65b2d5ef1ab04b28de5850"],
  ["6ac057a5000000001a02203c", "为什么同样是幸运礼物，它家就是比别人“爽”？", "cd937adc83a0fd0e0e41dd32c87d510f64710e3652e4da6b1e392a5ce579c99c"],
  ["6abbed88000000001301a5e5", "Binmo不满足卖Queen，开始做活动了", "c6cb188fd6217f2e726835ec6fa140b132b99d75643a0bb5d5dc22e2a63fd56e"],
  ["6ab2220e000000003b0070d9", "Hawa连分类都改成游戏了？", "3c9917c980dbfddd20faba684ad4677785b556636cc92f229f7faaac1b8ee59b"],
  ["6ab6950d0000000012037380", "Binmo正式环境有bug，调试工具出现了！", "c4c4e13eb3d659939c314e36145f51ebd74afd6b77ccbebba6e8bdfc071cfa73"],
];

test("homepage notes exactly match the latest eight non-pinned profile cards", () => {
  assert.equal(notes.length, 8);
  assert.equal(new Set(notes.map((note) => note.href)).size, 8);
  notes.forEach((note, index) => {
    const [id, title] = expected[index];
    assert.equal(note.title, title);
    assert.equal(new URL(note.href).pathname, `/explore/${id}`);
    assert.equal(note.cover, `/optimized/notes/${id}.webp`);
    assert.deepEqual(Object.keys(note).sort(), ["cover", "href", "title"]);
  });
});

test("each local WebP cover belongs to its own note and avoids expiring CDN URLs", () => {
  const hashes = new Set();
  notes.forEach((note, index) => {
    const [id, , expectedHash] = expected[index];
    const source = readFileSync(new URL(`../public/notes/${id}.webp`, import.meta.url));
    const optimized = readFileSync(new URL(`../public${note.cover}`, import.meta.url));
    assert.equal(source.toString("ascii", 0, 4), "RIFF");
    assert.equal(source.toString("ascii", 8, 12), "WEBP");
    const hash = createHash("sha256").update(source).digest("hex");
    assert.equal(hash, expectedHash);
    assert.deepEqual(optimized, source, "already optimized platform WebP covers retain original pixels and dimensions");
    assert(source.length < 150_000);
    hashes.add(hash);
  });
  assert.equal(hashes.size, 8);
});

test("original links retain the required platform parameters across cover, title and read links", () => {
  notes.forEach((note) => {
    const url = new URL(note.href);
    assert.equal(url.origin, "https://www.xiaohongshu.com");
    assert.equal(url.searchParams.get("xsec_source"), "pc_user");
    assert((url.searchParams.get("xsec_token") ?? "").length >= 32);
    assert.deepEqual([...url.searchParams.keys()].sort(), ["xsec_source", "xsec_token"]);
    assert.equal(url.hash, "");
  });
  const section = page.slice(page.indexOf('id="notes"'), page.indexOf('id="notes"') + 1100);
  assert.equal((section.match(/href=\{note\.href\}/g) ?? []).length, 3);
  assert.match(section, /src=\{note\.cover\}/);
  assert.match(section, /alt=\{`\$\{note\.title\} 封面`\}/);
});
