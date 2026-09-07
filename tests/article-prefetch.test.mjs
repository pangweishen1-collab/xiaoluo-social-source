import assert from "node:assert/strict";
import test from "node:test";

import { incrementArticleView, prefetchArticle, prefetchArticleRoute, readCachedArticle } from "../app/article-cache.mjs";

const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
};

test("prefetched article data is available synchronously before navigation", async () => {
  const cache = storage();
  let requests = 0;
  const article = { slug: "hawa-research", title: "Hawa", body: "正文", updatedAt: "2026-09-05T00:00:00.000Z" };
  const fetcher = async () => { requests += 1; return new Response(JSON.stringify({ item: article })); };

  await prefetchArticle(article.slug, article.updatedAt, { storage: cache, fetcher });
  assert.deepEqual(readCachedArticle(article.slug, cache), article);
  await prefetchArticle(article.slug, article.updatedAt, { storage: cache, fetcher });
  assert.equal(requests, 1);
});

test("prefetch refreshes a cached article when its update version changes", async () => {
  const cache = storage();
  const versions = ["旧正文", "新正文"];
  const fetcher = async () => new Response(JSON.stringify({ item: { slug: "hawa-research", body: versions.shift() } }));

  await prefetchArticle("hawa-research", "v1", { storage: cache, fetcher });
  await prefetchArticle("hawa-research", "v2", { storage: cache, fetcher });
  assert.equal(readCachedArticle("hawa-research", cache).body, "新正文");
});

test("article route prefetch is registered once before navigation", () => {
  const links = [];
  const documentRef = { head: { append: (link) => links.push(link) }, createElement: () => ({}) };
  prefetchArticleRoute("hawa-research", documentRef);
  prefetchArticleRoute("hawa-research", documentRef);
  assert.deepEqual(links, [{ rel: "prefetch", href: "/analysis/hawa-research", as: "document" }]);
});

test("every opened article records one view while prefetch records none", async () => {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url, method: options.method || "GET" });
    return new Response(JSON.stringify({ views: calls.filter((call) => call.method === "POST").length }));
  };

  assert.equal(await incrementArticleView("hawa-research", fetcher), 1);
  assert.equal(await incrementArticleView("hawa-research", fetcher), 2);
  assert.deepEqual(calls, [
    { url: "/api/articles/hawa-research/view", method: "POST" },
    { url: "/api/articles/hawa-research/view", method: "POST" },
  ]);
});
