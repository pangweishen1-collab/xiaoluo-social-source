"use client";
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { weeklyProducts } from './weekly-products.mjs';

export default function WeeklyProductBroadcast({ revision = 0 }: { revision?: number }) {
  const [items, setItems] = useState<{ company: string; products: string[] }[]>([]);
  const [status, setStatus] = useState('loading');
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [distance, setDistance] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/site-updates', { cache: 'no-store' });
        if (!response.ok) throw Error();
        const data = await response.json();
        if (!Array.isArray(data.items)) throw Error();
        if (active) { setItems(weeklyProducts(data.items, new Date().toISOString())); setStatus('ready'); }
      } catch { if (active) setStatus('error'); }
    };
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const preference = () => setReduced(media.matches);
    preference(); media.addEventListener('change', preference);
    void load(); window.addEventListener('focus', load);
    const refresh = window.setInterval(load, 60000);
    return () => { active = false; window.clearInterval(refresh); window.removeEventListener('focus', load); media.removeEventListener('change', preference); };
  }, [revision]);
  useEffect(() => {
    const box = viewport.current, row = content.current;
    if (!box || !row || status !== 'ready') { setDistance(0); return; }
    const measure = () => setDistance(row.scrollWidth - 32 > box.clientWidth + 1 ? row.scrollWidth : 0);
    const observer = new ResizeObserver(measure);
    observer.observe(box); observer.observe(row); measure();
    return () => observer.disconnect();
  }, [items, status]);
  const scrolling = distance > 0 && !reduced;
  const entries = items.map(item => <span className="weekly-broadcast-item" key={item.company}><strong>{item.company}</strong><span>{item.products.join('、')}</span></span>);
  return <aside className="shell weekly-product-broadcast" aria-label="本周新增产品播报" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setHovered(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHovered(false); }}>
    <div className="weekly-broadcast-label"><span aria-hidden="true">◉</span> 本周新增</div>
    <div className="weekly-broadcast-content" aria-live="off" ref={viewport} tabIndex={distance > 0 ? 0 : undefined} aria-label="本周新增公司及产品" data-scrolling={scrolling}>
      {status === 'ready' && items.length ? <div className="weekly-broadcast-track" style={{ '--broadcast-distance': `${distance}px`, '--broadcast-duration': `${Math.max(distance / 35, 12)}s`, animationPlayState: hovered ? 'paused' : 'running' } as CSSProperties}>
        <div className="weekly-broadcast-row" ref={content}>{entries}</div>
        {scrolling && <div className="weekly-broadcast-row" aria-hidden="true">{entries}</div>}
      </div> : <span>{status === 'loading' ? '读取中…' : status === 'error' ? '记录暂不可用' : '暂无新增记录'}</span>}
    </div>
  </aside>;
}
