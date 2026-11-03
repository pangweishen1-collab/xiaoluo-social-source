"use client";
import { useEffect, useState, type ReactNode } from "react";
import "./resource-market.css";

type MarketTab = "providers" | "jobs";
const currentTab = (): MarketTab => {
  const url = new URL(window.location.href);
  return url.searchParams.get("market") === "jobs" || url.searchParams.has("kind") || url.hash.startsWith("#talent-") ? "jobs" : "providers";
};
export default function ResourceMarket({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<MarketTab>("providers");
  useEffect(() => { const sync = () => setActive(currentTab()); sync(); window.addEventListener("popstate", sync); return () => window.removeEventListener("popstate", sync); }, []);
  const select = (value: MarketTab) => {
    setActive(value);
    const url = new URL(window.location.href);
    url.searchParams.set("market", value);
    url.searchParams.delete("kind"); url.hash = "";
    window.history.replaceState(window.history.state, "", url);
  };
  return <div className="resource-market">
    <div className="shell resource-market-tab-shell"><div className="resource-market-tabs" role="tablist" aria-label="资源市场分类">
      {([ ["providers", "入驻服务商"], ["jobs", "公司招聘"] ] as const).map(([value, label]) => <button key={value} id={`market-tab-${value}`} role="tab" aria-selected={active === value} aria-controls={`market-panel-${value}`} tabIndex={active === value ? 0 : -1} onClick={() => select(value)} onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "providers" : event.key === "End" ? "jobs" : active === "providers" ? "jobs" : "providers"; select(next); document.getElementById(`market-tab-${next}`)?.focus(); } }}>{label}</button>)}
    </div></div>
    <section id="market-panel-providers" role="tabpanel" aria-labelledby="market-tab-providers" hidden={active !== "providers"} className="shell resource-provider-panel">
      <div className="resource-provider-heading">
        <div><p className="resource-provider-eyebrow">SERVICE PARTNERS / 服务商名录</p><h2>让专业服务，遇见具体需求</h2><p>了解服务能力、适用场景与合作方式，直接联系适合团队的服务商。</p></div>
        <span className="resource-provider-count">已入驻 <strong>01</strong> 家服务商</span>
      </div>
      <article className="resource-provider-card">
        <div className="resource-provider-info">
          <div className="resource-provider-topline"><span>01 / FEATURED PARTNER</span><span>已入驻服务商</span></div>
          <div className="resource-provider-brand"><img src="/optimized/partners/jishun-animation.webp" alt="极瞬动画 Logo" width="64" height="64" /><div><p>直播互动 · 视觉设计</p><h3>极瞬动画</h3></div></div>
          <p className="resource-provider-lead">为语聊与直播产品提供互动视觉内容</p>
          <p className="resource-provider-description">提供成品直播礼物与定制动画设计，为日常互动、节日活动和产品装扮补充视觉内容。</p>
          <div className="resource-provider-services"><h4>服务能力</h4><div className="resource-provider-tags"><span>成品直播礼物</span><span>礼物特效定制</span><span>座驾与头像框</span><span>活动视觉素材</span></div></div>
          <dl><div><dt>适用场景</dt><dd>语聊房 · 直播间 · 社交互动 · 节日运营</dd></div><div><dt>合作方式</dt><dd>成品选购与定制设计；格式、交付时间及授权范围由双方确认。</dd></div></dl>
          <div className="resource-provider-actions"><a className="resource-provider-link" href="https://www.jsgift.top/" target="_blank" rel="noopener noreferrer">浏览极瞬动画官网</a><span>也可扫描右侧二维码，直接咨询服务商</span></div>
        </div>
        <aside className="resource-provider-contact" aria-label="联系极瞬动画"><div className="resource-provider-contact-heading"><span>DIRECT CONTACT</span><strong>直接联系服务商</strong><p>咨询成品礼物、定制需求与交付方式</p></div><figure className="resource-provider-visual"><img src="/optimized/partners/jishun-contact.png" alt="极瞬动画客服二维码：扫码咨询定制服务" width="500" height="500" loading="lazy" /><figcaption>扫码咨询极瞬动画</figcaption></figure></aside>
        <section className="resource-provider-benefits" aria-labelledby="jishun-benefits-title">
        <div className="resource-benefits-heading"><span>COLLABORATION OUTCOMES</span><h3 id="jishun-benefits-title">合作成果</h3><p>极瞬动画在合作中获得的用户、营收与资源连接</p></div>
        <dl className="resource-benefits-metrics">
          <div><dt>带来用户</dt><dd>50<span>+ 用户</span></dd></div>
          <div><dt>营收增加</dt><dd>10万<span>+</span></dd></div>
          <div><dt>资源交换</dt><dd>20<span>+ 次</span></dd></div>
        </dl>
        </section>
      </article>
      <aside className="resource-provider-invite"><div><span>FOR SERVICE PROVIDERS</span><h3>让需要你服务的团队，更快找到你</h3><p>通过品牌资料、服务方向、适用场景与直接联系入口，建立清晰的行业展示页。具体展示内容与合作周期以双方确认的方案为准。</p></div><a href="/?view=business">了解资源入驻方案</a></aside>
    </section>
    <div id="market-panel-jobs" role="tabpanel" aria-labelledby="market-tab-jobs" hidden={active !== "jobs"}>{children}</div>
  </div>;
}
