"use client";

export const tools = [
  { name: "极瞬动画", group: "视觉素材", text: "直播礼物素材与定制动画设计", url: "https://www.jsgift.top/" },
  { name: "点点数据", group: "竞品研究", text: "应用榜单、下载与收入预估", url: "https://www.diandian.com/?lang=zh" },
  { name: "Sensor Tower", group: "竞品研究", text: "全球应用表现与市场趋势", url: "https://sensortower.com/" },
  { name: "Appfigures", group: "竞品研究", text: "排名、用户评论与版本变化", url: "https://appfigures.com/" },
  { name: "AppBrain", group: "竞品研究", text: "Android 应用与开发者查询", url: "https://www.appbrain.com/" },
  { name: "白鲸出海", group: "竞品研究", text: "出海资讯、公司动态与报告", url: "https://www.baijing.cn/" },
  { name: "Meta 广告资料库", group: "投放素材", text: "查看竞品公开广告与营销卖点", url: "https://www.facebook.com/ads/library/" },
  { name: "TikTok Creative Center", group: "投放素材", text: "热门广告、创意与内容趋势", url: "https://ads.tiktok.com/business/creativecenter/" },
  { name: "广大大 SocialPeta", group: "投放素材", text: "广告素材与竞品投放情报", url: "https://socialpeta.com/en" },
  { name: "DataReportal", group: "运营技术", text: "各国互联网与社交媒体报告", url: "https://datareportal.com/" },
  { name: "Google Trends", group: "运营技术", text: "搜索热度与地区话题趋势", url: "https://trends.google.com/explore" },
  { name: "Time and Date", group: "运营技术", text: "时区换算、节假日与活动排期", url: "https://www.timeanddate.com/" },
  { name: "声网 Agora", group: "运营技术", text: "实时语音 SDK 与技术方案", url: "https://www.agora.io/en/products/voice-call/" },
  { name: "沉浸式翻译", group: "效率工具", text: "网页双语对照与海外资料阅读", url: "https://immersivetranslate.com/zh-Hans/" },
  { name: "VibeHub 产品术语", group: "效率工具", text: "产品概念与 Vibe Coding 术语", url: "https://vibe-hub.org/topics/product" },
];
const localLogos: Record<string, string> = {
  "极瞬动画": "/optimized/partners/jishun-animation.webp",
  "点点数据": "/optimized/logos/tools/diandian-source.webp",
  "Sensor Tower": "/optimized/logos/tools/sensor-source.webp",
  "Appfigures": "/optimized/logos/tools/appfigures-source.webp",
  "Meta 广告资料库": "/optimized/logos/tools/meta-source.webp",
  "广大大 SocialPeta": "/optimized/logos/tools/socialpeta-source.webp",
  "DataReportal": "/optimized/logos/tools/datareportal-source.webp",
  "Time and Date": "/optimized/logos/tools/timeanddate-source.webp",
  "白鲸出海": "/optimized/logos/tools/baijing-square.webp",
  "TikTok Creative Center": "/optimized/logos/tools/tiktok-square.webp",
  "Google Trends": "/optimized/logos/tools/trends-square.webp",
  "声网 Agora": "/optimized/logos/tools/agora-square.webp",
  "沉浸式翻译": "/optimized/logos/tools/immersive-square.webp",
  "VibeHub 产品术语": "/optimized/logos/tools/vibehub-square.webp",
};
export default function PracticalTools() {
  return <section className="practical-tools compact-tools shell" aria-labelledby="practical-tools-title">
    <div className="section-top"><div><p className="eyebrow">CURATED RESOURCES</p><h2 id="practical-tools-title">推荐网站</h2></div><span className="tools-total">{tools.length} 个网站</span></div>
    <div className="tools-directory">{tools.map(tool => <a className="tool-row" key={tool.name} href={tool.url} target="_blank" rel="noopener noreferrer" aria-label={`${tool.name}：${tool.text}（新窗口打开）`}>
      <div className="tool-card-top">
        <span className="tool-site-logo" aria-hidden="true">
          <span>{tool.name.slice(0, 1)}</span>
          {localLogos[tool.name] && <img src={localLogos[tool.name]} alt="" width={36} height={36} loading="lazy" decoding="async" onLoad={event => { const fallback = event.currentTarget.previousElementSibling as HTMLElement | null; if (fallback) fallback.style.visibility = "hidden"; }} onError={event => { event.currentTarget.style.display = "none"; }} />}
        </span>
        <span className="tool-group" aria-hidden="true">{tool.group}</span>
      </div>
      <div className="tool-copy"><h3>{tool.name}</h3><p>{tool.text}</p></div>
    </a>)}</div>
    <p className="tools-note">部分功能需登录或订阅；第三方下载与收入为估算值，不代表企业实际营收。</p>
  </section>;
}
