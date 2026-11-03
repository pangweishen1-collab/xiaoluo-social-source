const values = [
  {
    title: "持续跟踪行业变化",
    text: "围绕海外语聊、直播与泛娱乐社交，整理产品动态、企业动向与招聘线索，保留日期和原始来源。",
    benefit: "减少分散检索，为团队提供持续观察行业的入口。",
    link: "查看小骆日报", href: "/?view=daily",
  },
  {
    title: "拆解公司与产品",
    text: "从公开资料与产品场景出发，梳理公司布局、互动机制、增长路径与商业化方式，区分事实与分析。",
    benefit: "为产品选型、竞品讨论和运营方案提供案例参考。",
    link: "查看公司研究", href: "/?view=analysis",
  },
  {
    title: "让行业信息更好用",
    text: "将公司、产品与市场线索整理为可搜索的矩阵，结合研究内容，帮助定位值得进一步了解的团队与业务。",
    benefit: "让零散资料形成上下文，便于比较、查阅与合作前沟通。",
    link: "浏览出海矩阵", href: "/?view=matrix",
  },
];

function ValueIcon({ index }: { index: number }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {index === 0 ? <><path d="M4 4v16h16M7 14l4-4 4 2 5-7M16 5h4v4"/></> : index === 1 ? <><path d="M5 20H3V4h11v5M7 8h3M7 12h2M7 16h2"/><circle cx="15" cy="15" r="4"/><path d="m18 18 3 3"/></> : <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>}
  </svg>;
}

export default function BusinessValue() {
  return <section className="shell collab-section collab-value" aria-labelledby="collab-value-title">
    <div className="collab-section-head">
      <h2 id="collab-value-title">我的价值</h2>
      <p>把分散的行业信息，整理成可核验、可比较、可讨论的研究参考。</p>
    </div>
    <div className="collab-services collab-value-grid">
      {values.map((item, index) => <article key={item.title}>
        <div className="collab-value-card-top"><span className="collab-value-icon"><ValueIcon index={index} /></span><span className="collab-number" aria-hidden="true">0{index + 1}</span></div>
        <h3>{item.title}</h3>
        <p>{item.text}</p>
        <div className="collab-value-benefit"><strong>对你的帮助</strong><p>{item.benefit}</p></div>
        <a className="collab-service-link" href={item.href}>{item.link}<span aria-hidden="true">→</span></a>
      </article>)}
    </div>
  </section>;
}
