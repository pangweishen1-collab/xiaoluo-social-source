import { pathToFileURL } from 'node:url';

async function readJson(fetcher, url, label) {
  const response = await fetcher(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || !type.includes('application/json')) {
    throw new Error(`${label} 未返回 JSON 200（HTTP ${response.status}，${type || '无 Content-Type'}）。`);
  }
  return response.json();
}

export async function checkDailyRelease(baseUrl, fetcher = fetch) {
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('请提供 HTTP(S) 网站地址。');

  const indexUrl = new URL('/api/daily-reports?index=1', base);
  const index = await readJson(fetcher, indexUrl, '日报归档');
  const latest = index?.items?.[0];
  if (!Array.isArray(index?.items) || !latest || !/^\d{4}-\d{2}-\d{2}$/.test(latest.date)
    || typeof latest.title !== 'string' || typeof latest.leadTitle !== 'string'
    || Object.hasOwn(latest, 'body')) {
    throw new Error('日报归档仍是旧版响应，或缺少轻量索引字段。');
  }

  const detailUrl = new URL(`/api/daily-reports/${latest.date}`, base);
  const detail = await readJson(fetcher, detailUrl, `日报 ${latest.date} 详情`);
  if (detail?.item?.date !== latest.date || typeof detail.item.title !== 'string'
    || typeof detail.item.body !== 'string' || !Object.hasOwn(detail.item, 'edition')) {
    throw new Error(`日报 ${latest.date} 详情缺少必要字段。`);
  }
  return { date: latest.date, title: detail.item.title, edition: detail.item.edition !== null };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const baseUrl = process.argv[2];
  if (!baseUrl) {
    console.error('用法：node scripts/check-daily-release.mjs https://example.com');
    process.exitCode = 2;
  } else {
    try {
      const result = await checkDailyRelease(baseUrl);
      console.log(`日报接口验收通过：${result.date} · ${result.title} · ${result.edition ? '结构化版面' : '旧版正文'}`);
    } catch (error) {
      console.error(`日报接口验收失败：${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
}
