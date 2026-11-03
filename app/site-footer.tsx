"use client";

import "./site-footer.css";

const siteLinks = [
  { label: "小骆资讯", href: "/?view=daily" },
  { label: "公司分析", href: "/?view=analysis" },
  { label: "出海矩阵", href: "/?view=matrix" },
  { label: "资源市场", href: "/?view=talent" },
];

function returnToTop() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
}

export default function SiteFooter() {
  return (
    <footer className="site-footer" aria-label="网站页脚">
      <div className="site-footer__inner shell">
        <div className="site-footer__main">
          <div className="site-footer__identity">
            <a className="site-footer__brand" href="/" aria-label="小骆出海观察，返回首页">
              <img src="/optimized/xiaohongshu-avatar.webp" alt="" width="48" height="48" loading="lazy" decoding="async" />
              <span>小骆出海观察</span>
            </a>
            <p>聚焦海外语聊、直播与泛娱乐社交，持续记录公司、产品与市场的变化。</p>
            <span className="site-footer__descriptor">研究 · 观察 · 连接</span>
          </div>

          <nav className="site-footer__navigation" aria-label="页脚导航">
            <h2>探索内容</h2>
            <div className="site-footer__links">
              {siteLinks.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
            </div>
          </nav>

          <div className="site-footer__connection">
            <h2>联系与合作</h2>
            <a href="/?view=business">商务合作</a>
            <a href="https://www.xiaohongshu.com/user/profile/6a559ddd000000000e03d001" target="_blank" rel="noopener noreferrer">小红书主页 <span aria-hidden="true">↗</span></a>
          </div>

          <div className="site-footer__qr">
            <img src="/optimized/wechat-qr.webp" alt="小骆微信二维码，使用微信扫码联系" width="116" height="116" loading="lazy" decoding="async" />
            <div>
              <span>微信交流</span>
              <strong>扫码联系小骆</strong>
              <p>请备注公司、姓名及交流方向</p>
            </div>
          </div>
        </div>

        <div className="site-footer__bottom">
          <span>© 2026 小骆出海观察</span>
          <span>独立观察，持续核验</span>
          <button type="button" onClick={returnToTop}>返回顶部 <span aria-hidden="true">↑</span></button>
        </div>
      </div>
    </footer>
  );
}
