import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDailyRelease } from '../scripts/check-daily-release.mjs';

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

test('daily release check accepts a lightweight index and matching detail', async () => {
  const seen = [];
  const result = await checkDailyRelease('https://example.com', async (url) => {
    seen.push(url.pathname + url.search);
    return url.search ? json({ items: [{ date: '2026-10-14', title: '日报', leadTitle: '头条' }] })
      : json({ item: { date: '2026-10-14', title: '日报', body: '正文', edition: null } });
  });
  assert.deepEqual(seen, ['/api/daily-reports?index=1', '/api/daily-reports/2026-10-14']);
  assert.deepEqual(result, { date: '2026-10-14', title: '日报', edition: false });
});

test('daily release check rejects the old full-body index', async () => {
  await assert.rejects(checkDailyRelease('https://example.com', async () => json({
    items: [{ date: '2026-10-14', title: '日报', body: '旧接口正文' }],
  })), /旧版响应/);
});

test('daily release check rejects an HTML 404 detail', async () => {
  await assert.rejects(checkDailyRelease('https://example.com', async (url) => url.search
    ? json({ items: [{ date: '2026-10-14', title: '日报', leadTitle: '头条' }] })
    : new Response('<html>Not Found</html>', { status: 404, headers: { 'Content-Type': 'text/html' } })), /未返回 JSON 200/);
});
