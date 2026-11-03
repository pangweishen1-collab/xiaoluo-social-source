"use client";
import { useEffect, useState } from 'react';
import { atlasActivity } from './atlas-activity.mjs';
import { type UpdateEntry } from './site-updates';

export default function AtlasOverview({ matrixStats, articles, visitorStats, ready, onNavigate }: {
  matrixStats: { companies: number; products: number } | null;
  visitorStats: { total: number; today: number } | null;
  articles: { slug: string; publishedAt?: string }[]; ready: boolean;
  onNavigate: (view: 'matrix' | 'analysis') => void;
}) {
  const [entries, setEntries] = useState<UpdateEntry[]>([]);
  const [state, setState] = useState('loading');
  useEffect(() => {
    let active = true;
    const load = () => fetch('/api/site-updates', { cache: 'no-store' }).then(r => { if (!r.ok) throw Error(); return r.json(); }).then(d => { if (!Array.isArray(d.items)) throw Error(); if (active) { setEntries(d.items); setState('ready'); } }).catch(() => { if (active) setState('error'); });
    void load(); window.addEventListener('focus', load);
    return () => { active = false; window.removeEventListener('focus', load); };
  }, []);
  const activity = atlasActivity(entries, articles);
  return <section className="shell home-statistics-panel" aria-label="研究资料与网站数据">
    <div className="statistics-main">
      <div className="atlas-overview-metrics" role="group" aria-label="研究资料规模">
        <button type="button" onClick={() => onNavigate('matrix')}>
          <span>收录公司 / 团队</span>
          <strong>{matrixStats?.companies ?? '—'}<small>家</small>{activity.companies > 0 && <em className="atlas-metric-increase" aria-label={`最近更新日新增 ${activity.companies} 家公司`}>+{activity.companies}</em>}</strong>
        </button>
        <button type="button" onClick={() => onNavigate('matrix')}>
          <span>收录产品</span>
          <strong>{matrixStats?.products ?? '—'}<small>款</small>{state === 'ready' && activity.productAdditions > 0 && <em className="atlas-metric-increase" aria-label={`最近更新日确认新增 ${activity.productAdditions} 款产品`}>+{activity.productAdditions}</em>}</strong>
        </button>
        <button type="button" onClick={() => onNavigate('analysis')}>
          <span>已发布研究</span>
          <strong>{ready ? articles.length : '—'}<small>篇</small>{activity.articles > 0 && <em className="atlas-metric-increase" aria-label={`最近更新日新增 ${activity.articles} 篇研究`}>+{activity.articles}</em>}</strong>
        </button>
      </div>
      <dl className="statistics-audience" aria-label="网站与账号数据">
        <div><dt>累计访问</dt><dd>{visitorStats ? visitorStats.total.toLocaleString('zh-CN') : '—'}</dd></div>
        <div><dt>今日访问</dt><dd>{visitorStats ? visitorStats.today.toLocaleString('zh-CN') : '—'}</dd></div>
        <div><dt>小红书粉丝</dt><dd title="小红书主页核对：2026-10-20">1,799</dd></div>
      </dl>
    </div>
  </section>;
}
