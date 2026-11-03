"use client";
import DailyReports from "./daily-reports";
import HomeDaily from "./home-daily";
import HotList, { preloadHotList } from "./hot-list";
import heroMedia from "./hero-media.generated.json";
import GlobalSearch from "./global-search";
import BusinessInquiryDialog from "./business-inquiry-dialog";
import BusinessQrDialog from "./business-qr-dialog";
import BusinessInbox from "./business-inbox";
import RecommendationBadge from "./recommendation-badge";
import SiteFooter from "./site-footer";
import ResourceMarket from "./resource-market";
import BusinessTypeIcon, { type BusinessTypeIconName } from "./business-type-icon";
import "./daily-reports.css";
import { scheduleIdleWork } from "./idle-work";
import { loadPublicData } from "./public-data-cache.mjs";
import { viewFromSearch } from "./navigation-view.mjs";
import provinces from "../shared/provinces.json";
import { matrixCompanies } from "./matrix-data";
import { researchProducts } from "./research-products.mjs";

import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { prefetchArticle, prefetchArticleRoute } from "./article-cache.mjs";
import { IMAGE_UPLOAD_RULES } from "../shared/image-upload.mjs";
import AtlasOverview from "./atlas-overview";
import PracticalTools from "./practical-tools";
import CompanyRegions from "./company-regions";
import { companyLocation, matchesRegion, UNKNOWN_REGION } from "./company-geography.mjs";

const ANALYSIS_PAGE_SIZE = 10;
let talentItemsRequest: Promise<{ items?: Array<Record<string, unknown>> }> | null = null;

const loadArticles = () => loadPublicData("/api/articles");
const loadTalentItems = () => talentItemsRequest ??= fetch("/api/talent", { credentials: "same-origin", cache: "no-store" })
  .then(async (response) => response.ok ? response.json() : Promise.reject(new Error("人才市场暂时无法同步，请稍后重试。")))
  .catch((error) => { talentItemsRequest = null; throw error; });
const preloadPublicData = () => {
  void loadArticles().catch(() => undefined);
  void loadTalentItems().catch(() => undefined);
};

async function compressUploadedImage(file: File) {
  if (!IMAGE_UPLOAD_RULES.acceptedMimeTypes.includes(file.type)) throw new Error("请选择 PNG、JPG 或 WebP 图片。");
  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("图片无法读取，请换一张再试。")); };
    image.src = url;
  });
  for (let edge = Math.min(IMAGE_UPLOAD_RULES.maxEdge, Math.max(source.width, source.height)); edge >= IMAGE_UPLOAD_RULES.minEdge; edge = Math.floor(edge * .75)) {
    const scale = Math.min(1, edge / Math.max(source.width, source.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(source.width * scale)); canvas.height = Math.max(1, Math.round(source.height * scale));
    canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
    for (const quality of IMAGE_UPLOAD_RULES.qualities) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, IMAGE_UPLOAD_RULES.outputMimeType, quality));
      if (blob && blob.size <= IMAGE_UPLOAD_RULES.maxBytes) return new Promise<{ data: string; size: number }>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ data: String(reader.result), size: blob.size }); reader.onerror = () => reject(new Error("图片压缩失败，请重试。")); reader.readAsDataURL(blob); });
    }
  }
  throw new Error("图片压缩后仍超过 3MB，请换一张更小的图片。");
}

async function compressMatrixLogo(file: File) {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) throw new Error("请选择 PNG、JPG 或 WebP 图片。");
  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("图片无法读取，请换一张再试。")); };
    image.src = url;
  });
  const scale = Math.min(1, 640 / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", .82));
  if (!blob || blob.size > 2 * 1024 * 1024) throw new Error("公司 Logo 压缩后仍超过 2MB，请换一张更小的图片。");
  return new Promise<{ data: string; url: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ data: String(reader.result), url: URL.createObjectURL(blob) });
    reader.onerror = () => reject(new Error("图片压缩失败，请重试。"));
    reader.readAsDataURL(blob);
  });
}

const notes = [
  { title: "一张月卡，怎么让用户愿意买、经常来？", cover: "/optimized/notes/6ad61fa8000000002a005827.webp", href: "https://www.xiaohongshu.com/explore/6ad61fa8000000002a005827?xsec_token=ABqiW8ba4V39GNiy9GWbPmW1Ht9X69X4M7T6JAJSDPaUc=&xsec_source=pc_user" },
  { title: "Yalla Ludo让玩家设计礼物？是礼物不好卖了？", cover: "/optimized/notes/6ace3965000000001301b927.webp", href: "https://www.xiaohongshu.com/explore/6ace3965000000001301b927?xsec_token=ABS69elfmfUKMHhN3fFNu0x9eyqWyod4tKWP5PJUoxiyw=&xsec_source=pc_user" },
  { title: "语聊产品关系卡也能拿来做营销？第一次见！", cover: "/optimized/notes/6ac7c13e000000001500f5fb.webp", href: "https://www.xiaohongshu.com/explore/6ac7c13e000000001500f5fb?xsec_token=ABUb_QwpYUYn4H96bI3izZdQcEhutjfmivolxue_m467Y=&xsec_source=pc_user" },
  { title: "这是我目前为止见过做的最好的超跑活动！", cover: "/optimized/notes/6ac2896d000000001802e747.webp", href: "https://www.xiaohongshu.com/explore/6ac2896d000000001802e747?xsec_token=ABmZmPk0eUuR0U1ooML1YRXX49ebVu_BjRzQ3VZwCFZsk=&xsec_source=pc_user" },
  { title: "为什么同样是幸运礼物，它家就是比别人“爽”？", cover: "/optimized/notes/6ac057a5000000001a02203c.webp", href: "https://www.xiaohongshu.com/explore/6ac057a5000000001a02203c?xsec_token=ABPyga27Milh04d_AHaZb9AO5kpEq1qeYu_eH6SgWYEm4=&xsec_source=pc_user" },
  { title: "Binmo不满足卖Queen，开始做活动了", cover: "/optimized/notes/6abbed88000000001301a5e5.webp", href: "https://www.xiaohongshu.com/explore/6abbed88000000001301a5e5?xsec_token=ABS39nM760mQewCybXAzIdQ35rNAiZmIrvfzuvsz0-iu0=&xsec_source=pc_user" },
  { title: "Hawa连分类都改成游戏了？", cover: "/optimized/notes/6ab2220e000000003b0070d9.webp", href: "https://www.xiaohongshu.com/explore/6ab2220e000000003b0070d9?xsec_token=ABUuNxo_wB5c_ljsA9NX5CL9HNYg5UELzSZYFKw51rwsE=&xsec_source=pc_user" },
  { title: "Binmo正式环境有bug，调试工具出现了！", cover: "/optimized/notes/6ab6950d0000000012037380.webp", href: "https://www.xiaohongshu.com/explore/6ab6950d0000000012037380?xsec_token=ABi1uft4zjPzkzwoDEROZCif_11e7pb2cn1whfhQi5YII=&xsec_source=pc_user" },
];

const credibilityModules = [
  { no: "01", title: "行业研究", intro: "把零散信息梳理为可用的行业判断。", items: ["产品矩阵与机制拆解", "市场与本地化观察", "标注来源、时间与边界"] },
  { no: "02", title: "资源连接", intro: "围绕明确问题，连接合适的人与团队。", items: ["产品、运营与市场资源", "定向交流与人才推荐", "合作需求的初步匹配"] },
  { no: "03", title: "内容表达", intro: "把复杂问题讲成行业愿意看的内容。", items: ["小红书行业观察", "产品案例与专题拆解", "访谈、共创与品牌表达"] },
  { no: "04", title: "长期跟踪", intro: "持续记录变化，而不是一次性罗列信息。", items: ["产品与公司动态更新", "已确认 / 待核验状态", "发现变化后持续补充"] },
];

const resourceGroups = [
  { title: "产品", number: "180+", text: "社交、语聊、直播、AI 陪伴与游戏化产品负责人。", tags: ["增长", "匹配", "社区", "商业化"] },
  { title: "运营", number: "260+", text: "内容、活动、用户运营与公会生态的一线操盘者。", tags: ["内容", "活动", "社群", "公会"] },
  { title: "市场", number: "120+", text: "品牌、投放、出海本地化和创作者合作资源。", tags: ["品牌", "投放", "KOL", "出海"] },
  { title: "支付", text: "支付接入、收单、风控与结算相关的服务商及从业者。", tags: ["收单", "风控", "结算", "合规"] },
  { title: "游戏", text: "休闲游戏、社交玩法、发行与游戏化运营相关资源。", tags: ["玩法", "发行", "运营", "变现"] },
  { title: "设计", text: "品牌视觉、动效、直播礼物与产品体验设计资源。", tags: ["视觉", "动效", "UI/UX", "礼物"] },
  { title: "投放", text: "效果广告、素材创意、代理与海外渠道相关资源。", tags: ["买量", "素材", "代理", "归因"] },
  { title: "RTC", text: "音视频、实时互动与语聊直播基础设施相关资源。", tags: ["音视频", "SDK", "云服务", "互动"] },
];

const companyAnalyses = [
  { company: "欢聚集团", category: "公司分析", date: "2026-08-24", title: "从直播到泛娱乐社交：欢聚集团的产品矩阵如何分层", summary: "以 BIGO LIVE、Likee、imo 等产品为线索，梳理直播、短视频、语聊与社交工具之间的产品分工，以及不同市场的增长逻辑。", tags: ["直播社交", "全球化", "产品矩阵"] },
  { company: "雅乐集团", category: "公司分析", date: "2026-08-22", title: "雅乐集团：从语音房到本地棋牌，如何做中东社交", summary: "Yalla、Yalla Ludo 与本地棋牌产品构成互补。重点观察产品形态、本地内容、付费场景与区域运营协同。", tags: ["中东", "语聊", "本地化"] },
  { company: "赤子城科技", category: "公司分析", date: "2026-08-20", title: "赤子城科技：多产品线背后的收购整合与区域运营", summary: "从 MICO、YoHo、TopTop 等产品出发，记录泛娱乐社交的多区域布局、产品组合与商业化差异。", tags: ["泛娱乐社交", "增长", "商业化"] },
  { company: "米连科技", category: "公司分析", date: "2026-08-18", title: "米连科技：新一代语聊产品的多品牌试验", summary: "围绕 HiFami、Chatta、Seeta 等产品，追踪陌生人社交、语音互动与陪伴场景的功能演化。", tags: ["语聊", "AI陪伴", "产品观察"] },
  { company: "武汉微派", category: "公司分析", date: "2026-08-16", title: "微派的游戏社交路径：互动玩法如何承接关系沉淀", summary: "从 WePlay、WeParty 的玩法与房间机制入手，分析游戏化社交如何降低陌生人互动门槛并形成留存。", tags: ["游戏社交", "玩法", "留存"] },
  { company: "久邦", category: "公司分析", date: "2026-08-14", title: "久邦与 Meete：从工具出海到社交产品的延伸", summary: "以 Meete 为入口，补全产品主体、运营关联与目标市场线索；所有结论都标注公开来源与待核验边界。", tags: ["公司归属", "社交产品", "待核验"] },
];



const logoReferenceClasses: Record<string, string> = {
  "/optimized/logos/zhipin-reference.webp": "atlas-logo-zhipin",
  "/optimized/logos/baitan-reference.webp": "atlas-logo-baitan",
  "/optimized/logos/xiaoxiang-reference.webp": "atlas-logo-xiaoxiang",
  "/optimized/logos/changxiangban-reference.webp": "atlas-logo-changxiangban",
  "/optimized/logos/changzhi-reference.webp": "atlas-logo-changzhi",
  "/optimized/logos/yushan-reference.webp": "atlas-logo-yushan",
  "/optimized/logos/fuya-reference.webp": "atlas-logo-fuya",
  "/optimized/logos/milian-reference.webp": "atlas-logo-milian",
  "/optimized/logos/yihao-reference.webp": "atlas-logo-yihao",
  "/optimized/logos/yuanqi-reference.webp": "atlas-logo-yuanqi",
  "/optimized/logos/huijing-reference.webp": "atlas-logo-huijing",
  "/optimized/logos/taqu-reference.webp": "atlas-logo-taqu",
  "/optimized/logos/yinguo-reference.webp": "atlas-logo-yinguo",
  "/optimized/logos/hexin-hule-reference.webp": "atlas-logo-hexin",
  "/optimized/logos/duoshou-reference.webp": "atlas-logo-duoshou",
  "/optimized/logos/baiyitu-reference.webp": "atlas-logo-baiyitu",
};
const companyLogos: Record<string, string> = {
  "智品科技": "/optimized/logos/zhipin-reference.webp",
  "广州白檀科技": "/optimized/logos/baitan-reference.webp",
  "小象互娱": "/optimized/logos/xiaoxiang-reference.webp",
  "常相伴（武汉）科技有限公司（伴伴）": "/optimized/logos/changxiangban-reference.webp",
  "畅指网络": "/optimized/logos/changzhi-reference.webp",
  "与善网络": "/optimized/logos/yushan-reference.webp",
  "武汉赴亚": "/optimized/logos/fuya-reference.webp",
  "怡好青春": "/optimized/logos/yihao-reference.webp",
  "广州元气互动科技有限公司": "/optimized/logos/yuanqi-reference.webp",
  "汇鲸网络": "/optimized/logos/huijing-reference.webp",
  "海豹他趣": "/optimized/logos/taqu-reference.webp",
  "音果互娱": "/optimized/logos/yinguo-reference.webp",
  "百易图": "/optimized/logos/baiyitu-reference.webp",
  "舵手互娱": "/optimized/logos/duoshou-reference.webp",
  "广州核心互娱": "/optimized/logos/hexin-hule-reference.webp",
  "互乐科技": "/optimized/logos/hule.webp",
  "深圳市趣虹科技有限公司": "/optimized/logos/quhong.webp",
  "深圳市视波信息科技有限公司": "/optimized/logos/shibo.webp",
  "酷麦科技": "/optimized/logos/kumai.webp",
  "武汉东晨科技": "/optimized/logos/dongchen.webp",
  "米连科技": "/optimized/logos/milian-reference.webp",
  "广州市久邦数码科技有限公司（久邦）": "/optimized/logos/gomo.webp",
  "Hacker Interstellar（原明日虫洞）": "/optimized/logos/hacker-interstellar.webp",
  "映宇宙（映宇宙（北京）科技有限公司）": "/optimized/logos/inke.webp",
  "MiniMax（上海稀宇科技有限公司）": "/optimized/logos/minimax.webp",
  "昆仑万维（昆仑万维科技股份有限公司）": "/optimized/logos/kunlun.webp",
  "腾讯音乐娱乐集团": "/optimized/logos/tencent-music.webp",
  "欢聚集团": "/optimized/logos/joyy.webp",
  "雅乐集团": "/optimized/logos/yalla.webp",
  "赤子城科技": "/optimized/logos/newborntown.webp",
  "武汉微派": "/optimized/logos/weipai.webp",
  "杭州零壹比特科技": "/optimized/logos/chamet.webp",
  "广州振心": "/optimized/logos/wenext.webp",
  "蓝鲲智创": "/optimized/logos/lankun.webp",
  "乐趣无限": "/optimized/logos/spreadfun.webp",
  "挚文集团": "/optimized/logos/hellogroup.webp",
  "花房集团": "/optimized/logos/huafang.webp",
  "迅雷": "/optimized/logos/xunlei.webp",
  "上海肯斯爪特科技有限公司": "/optimized/logos/litmatch.webp",
};

function CompanyLogo({ company, logoUrl }: { company: string; logoUrl: string }) {
  const referenceClass = logoReferenceClasses[logoUrl];
  if (referenceClass) return <span className={`atlas-logo ${referenceClass}`} aria-hidden="true"><img src={logoUrl} alt="" loading="lazy" /></span>;
  if (logoUrl) return <img className="atlas-logo" src={logoUrl} alt="" loading="lazy" />;
  return <span className="atlas-monogram" aria-hidden="true">{company.slice(0, 1)}</span>;
}

const companyEntityNotes: Record<string, string> = {
  "广州市久邦数码科技有限公司（久邦）": "运营 / 产品主体：广州悦动互联科技有限公司；母公司：新动互联（广州）科技有限公司。",
};

const jobListings = [
  { company: "Yalla Group", title: "Senior Product Manager", city: "Dubai", focus: "语聊 / 社交产品", type: "全职", level: "3–5 年", mark: "YG", description: "负责社交产品的核心体验与增长协同。", contact: "" },
  { company: "BIGO", title: "Growth Operations Manager", city: "Singapore", focus: "增长 / 用户运营", type: "全职", level: "3–5 年", mark: "BG", description: "负责增长策略、实验与用户运营项目。", contact: "" },
  { company: "Newborn Town", title: "Overseas Community Lead", city: "Beijing", focus: "社区 / 内容运营", type: "全职", level: "5 年+", mark: "NT", description: "带领海外社区和创作者运营工作。", contact: "" },
  { company: "WePlay", title: "Game Social Product Designer", city: "Guangzhou", focus: "游戏社交 / 产品", type: "全职", level: "3–5 年", mark: "WP", description: "设计多人互动与游戏社交体验。", contact: "" },
  { company: "Chamet", title: "Middle East Market Specialist", city: "Dubai", focus: "市场 / 本地化", type: "全职", level: "1–3 年", mark: "CH", description: "支持中东市场运营与本地化项目。", contact: "" },
  { company: "Ziipin", title: "Arabic Content Operations", city: "Riyadh", focus: "内容 / 本地化", type: "合同", level: "1–3 年", mark: "ZP", description: "负责阿语内容和本地化运营协作。", contact: "" },
];

const talentProfiles = [
  { title: "海外社交产品经理", city: "Dubai", exp: "5 年", tags: ["语聊", "商业化", "中东"], note: "寻求社交产品负责人或增长产品机会。", contact: "" },
  { title: "出海增长运营", city: "Singapore", exp: "4 年", tags: ["投放", "内容", "用户增长"], note: "擅长东南亚市场的增长实验与创作者运营。", contact: "" },
  { title: "中东本地化市场负责人", city: "Riyadh", exp: "6 年", tags: ["阿语", "KOL", "品牌"], note: "开放全职及项目制合作，专注海湾市场。", contact: "" },
];

export default function Home() {
  const [tab, setTab] = useState<"home" | "hot" | "daily" | "analysis" | "matrix" | "talent" | "business">("home");
  const navigationRef = useRef<HTMLElement>(null);
  const [admin, setAdmin] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    const syncView = () => {
      const view = viewFromSearch(window.location.search);
      setTab(view === "hot" || view === "daily" || view === "analysis" || view === "matrix" || view === "talent" || view === "business" ? view : "home");
    };
    syncView();
    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  }, []);

  useEffect(() => {
    const navigation = navigationRef.current;
    if (!navigation || navigation.scrollWidth <= navigation.clientWidth + 1) return;
    const active = navigation.querySelector<HTMLElement>(".active");
    if (!active) return;
    const track = navigation.getBoundingClientRect();
    const current = active.getBoundingClientRect();
    if (current.left < track.left + 12) navigation.scrollLeft += current.left - track.left - 12;
    else if (current.right > track.right - 12) navigation.scrollLeft += current.right - track.right + 12;
  }, [tab]);

  useEffect(() => {
    fetch("/api/admin/session", { credentials: "same-origin", cache: "no-store" }).then((response) => response.ok ? response.json() : { authenticated: false }).then((data) => setAdmin(Boolean(data.authenticated))).catch(() => undefined);
    // A direct hot-list visit should not spend idle network time on other tabs.
    if (viewFromSearch(window.location.search) !== "hot") return scheduleIdleWork(preloadPublicData);
  }, []);

  const navigate = (view: typeof tab) => {
    if (view === tab) return;
    const url = new URL(window.location.href);
    url.search = view === "home" ? "" : "?view=" + view;
    url.hash = "";
    if (url.href !== window.location.href) window.history.pushState(null, "", url);
    setTab(view);
  };
  const logout = async () => { await fetch("/api/admin/session", { method: "DELETE", credentials: "same-origin" }); setAdmin(false); };

  return (
    <main>
      <header className="nav shell site-navigation">
        <div className="brand"><button className="avatar-login" onClick={() => setLoginOpen(true)} aria-label="打开管理登录"><img src="/optimized/xiaohongshu-avatar.webp" alt="小骆" /></button><span className="site-brand-name">小骆出海观察</span>{admin && <button className="admin-exit" onClick={() => void logout()}>退出管理模式</button>}</div>
        <nav ref={navigationRef} aria-label="主导航">
          <button className={tab === "home" ? "active" : ""} onClick={() => navigate("home")}>首页</button>
          <button className={tab === "hot" || tab === "daily" ? "active" : ""} onClick={() => navigate(tab === "hot" || tab === "daily" ? tab : "daily")}>小骆资讯</button>
          <button className={tab === "analysis" ? "active" : ""} onPointerEnter={preloadPublicData} onFocus={preloadPublicData} onClick={() => navigate("analysis")}>公司分析</button>
          <button className={tab === "matrix" ? "active" : ""} onClick={() => navigate("matrix")}>出海矩阵</button>
          <button className={tab === "talent" ? "active" : ""} onPointerEnter={preloadPublicData} onFocus={preloadPublicData} onClick={() => navigate("talent")}>资源市场</button>
          <button className={tab === "business" ? "active" : ""} onClick={() => navigate("business")}>商务合作</button>
        </nav>
        <GlobalSearch />
      </header>

      {(tab === "hot" || tab === "daily") && <div className="news-tabs-wrap"><div className="news-tabs shell" role="tablist" aria-label="小骆资讯">
        <button id="news-tab-daily" type="button" role="tab" aria-selected={tab === "daily"} aria-controls="news-panel" tabIndex={tab === "daily" ? 0 : -1} className={tab === "daily" ? "active" : ""} onClick={() => navigate("daily")} onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); navigate("hot"); document.getElementById("news-tab-hot")?.focus(); } }}>小骆日报</button>
        <button id="news-tab-hot" type="button" role="tab" aria-selected={tab === "hot"} aria-controls="news-panel" tabIndex={tab === "hot" ? 0 : -1} className={tab === "hot" ? "active" : ""} onPointerEnter={preloadHotList} onFocus={preloadHotList} onClick={() => navigate("hot")} onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); navigate("daily"); document.getElementById("news-tab-daily")?.focus(); } }}>热点榜</button>
      </div></div>}
      {tab === "home" ? <HomeView admin={admin} onNavigate={(view) => { navigate(view); window.scrollTo({ top: 0, behavior: "smooth" }); }} /> : tab === "hot" || tab === "daily" ? <div id="news-panel" role="tabpanel" aria-labelledby={tab === "hot" ? "news-tab-hot" : "news-tab-daily"}>{tab === "hot" ? <HotList /> : <DailyReports admin={admin} />}</div> : tab === "analysis" ? <CompanyAnalysisView admin={admin} /> : tab === "matrix" ? <MatrixView admin={admin} /> : tab === "talent" ? <><PageHeader eyebrow="RESOURCE MARKET" title="资源市场" description="连接出海社交服务商与团队机会，发现产品资源、公司招聘与行业人才。" /><ResourceMarket><TalentView admin={admin} onLogout={logout} /></ResourceMarket></> : <BusinessView admin={admin} />}
      <SiteFooter />
      {loginOpen && <AdminLogin onClose={() => setLoginOpen(false)} onSuccess={() => { setAdmin(true); setLoginOpen(false); }} />}
    </main>
  );
}

function HomeView({ admin, onNavigate }: { admin: boolean; onNavigate: (view: "analysis" | "matrix" | "business") => void }) {
  const [businessQrOpen, setBusinessQrOpen] = useState(false);
  const [visitorStats, setVisitorStats] = useState<{ total: number; today: number } | null>(null);
  useEffect(() => {
    fetch("/api/visitors", { method: "POST", cache: "no-store", credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("visitors")))
      .then((data) => { if (typeof data.total === "number" && typeof data.today === "number") setVisitorStats(data); })
      .catch(() => undefined);
  }, []);
  const [research, setResearch] = useState<Array<{ slug: string; title: string; company: string; summary: string; publishedAt?: string }>>([]);
  const [researchState, setResearchState] = useState<"loading" | "ready" | "error">("loading");
  const [matrixStats, setMatrixStats] = useState<{ companies: number; products: number } | null>(null);
  useEffect(() => {
    let active = true;
    loadArticles().then((data: { items?: unknown[] }) => { if (active) { setResearch((data.items || []) as typeof research); setResearchState("ready"); } }).catch(() => { if (active) setResearchState("error"); });
    fetch("/api/matrix", { cache: "no-store" }).then((response) => { if (!response.ok) throw new Error("matrix"); return response.json(); }).then((data) => {
      const records: MatrixRecord[] = data.items || [];
      const overrides = new Map(records.filter((item) => item.sourceCompany).map((item) => [item.sourceCompany, item]));
      const companies = [...matrixCompanies.map((item) => overrides.get(item.company) || item).filter((item) => !("deleted" in item && item.deleted)), ...records.filter((item) => !item.sourceCompany && !item.deleted)];
      if (active) setMatrixStats({ companies: companies.length, products: companies.reduce((total, item) => total + item.products.length, 0) });
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return <div className="home-theme research-home">
    {businessQrOpen && <BusinessQrDialog plan="商务合作" title="商务合作" onClose={() => setBusinessQrOpen(false)} />}
    <section className="hero shell" aria-labelledby="home-hero-title">
      <div className="hero-copy">
        <p className="eyebrow">小骆出海观察 / RESEARCH & INSIGHTS</p>
        <h1 id="home-hero-title">中东社交观察<br /><span>海外语聊研究</span></h1>
        <p className="lead">持续追踪出海社交公司与产品，梳理公司归属、产品机制及市场变化，为产品、运营与合作决策提供有依据的参考。</p>
        <div className="hero-actions"><button className="primary" type="button" aria-haspopup="dialog" onClick={() => setBusinessQrOpen(true)}>商务合作</button></div>
      </div>
      <figure className="hero-visual">
        <div className="hero-visual-image"><img src={heroMedia.src} alt="小骆在研究工作室查阅出海社交产品资料的插画" width="1536" height="1024" loading="eager" decoding="async" fetchPriority="high" /></div>
        <figcaption><span><i aria-hidden="true" />小骆 · 出海社交产品观察</span><small>RESEARCH DESK / 01</small></figcaption>
      </figure>
    </section>
    <AtlasOverview matrixStats={matrixStats} articles={research} visitorStats={visitorStats} ready={researchState === "ready"} onNavigate={onNavigate} />
    <HomeDaily admin={admin} />
    <section className="section shell home-research" aria-labelledby="home-research-title">
      <div className="section-top"><div><p className="eyebrow">COMPANY RESEARCH</p><h2 id="home-research-title">公司研究</h2></div><button className="text-button" onClick={() => onNavigate("analysis")}>查看全部研究</button></div>
      <p className="section-intro">从公司业务到产品机制，理解出海社交的增长路径。</p>
      <div className="home-research-grid">{research.slice(0, 2).map((item, index) => <a className="home-research-card" href={`/analysis/${item.slug}`} key={item.slug}><div className="home-research-card-meta"><span>{item.company}</span><small>研究 0{index + 1}</small></div><h3>{item.title}</h3><p>{item.summary}</p><strong>阅读全文 <span aria-hidden="true">↗</span></strong></a>)}</div>
      {research.length === 0 && <p className="home-data-status" role="status">{researchState === "loading" ? "正在加载公司研究…" : researchState === "error" ? "公司研究暂时无法加载，请稍后重试。" : "公司研究正在整理中，可先浏览下方行业观察。"}</p>}
    </section>
    <section className="section shell" id="notes"><div className="section-top"><div><p className="eyebrow">LATEST NOTES</p><h2>最新行业观察</h2></div><a href="https://www.xiaohongshu.com/user/profile/6a559ddd000000000e03d001" target="_blank" rel="noreferrer">小红书查看全部 ↗</a></div><div className="notes notes-list">{notes.slice(0, 8).map((note) => <article className="note note-list-item" key={note.title}><a className="note-cover-link" href={note.href} target="_blank" rel="noreferrer"><img className="note-cover" src={note.cover} alt={`${note.title} 封面`} loading="lazy" /></a><div className="note-content"><h3><a href={note.href} target="_blank" rel="noreferrer">{note.title}</a></h3><a href={note.href} target="_blank" rel="noreferrer">阅读原文</a></div></article>)}</div></section>
    <section className="section shell home-about" aria-labelledby="home-about-title">
      <div className="section-top"><div><p className="eyebrow">ABOUT & APPROACH</p><h2 id="home-about-title">关于小骆与研究方法</h2></div></div>
      <p className="section-intro">关注中东社交与海外语聊的产品从业者，持续记录公司动态、产品机制与本地化实践。</p>
      <div className="home-methods"><article><div className="method-label"><span className="method-number">01</span><span>资料来源</span></div><h3>从公开资料出发</h3><p>围绕公司公告、财报、产品页面与公开访谈整理研究线索。</p></article><article><div className="method-label"><span className="method-number">02</span><span>交叉核验</span></div><h3>把事实与判断分开</h3><p>关注公司主体、产品归属与运营状态；阅读时结合原始来源与资料日期。</p></article><article><div className="method-label"><span className="method-number">03</span><span>持续修订</span></div><h3>让研究接受补充</h3><p>欢迎提供新的公开资料与产品信息，帮助补充案例、修正归属线索。</p></article></div>
    </section>
    <PracticalTools />
  </div>;
}
function NetworkView() {
  return <>
    <section className="network-hero shell"><div className="network-copy"><p className="eyebrow">THE NETWORK</p><h1>不是通讯录，<br />是<strong>能一起推进事情的人。</strong></h1><p>资源网络服务于真实的问题与具体合作。数字会持续更新，连接要有边界也要有诚意。</p><div className="network-total"><b>560<span>+</span></b><small>可触达的社交产品从业者</small></div></div><aside className="network-qr"><img src="/optimized/wechat-qr.webp" alt="小骆微信二维码，扫码加入行业交流群" decoding="async" /><b>欢迎加群交流</b><p>扫码添加微信<br />备注「加群」</p></aside></section>
    <section className="section shell"><div className="section-top"><div><p className="eyebrow">WHO IS IN THE ROOM</p><h2>资源分布</h2></div><p className="muted">覆盖产品增长与基础服务环节 · 人数持续更新</p></div><div className="resource-grid">{resourceGroups.map((group) => <article key={group.title}><div className="resource-group-head"><h3>{group.title}</h3>{group.number && <b>{group.number}</b>}</div><p>{group.text}</p><div>{group.tags.map((tag) => <i key={tag}>{tag}</i>)}</div></article>)}</div></section>
    <section className="network-contacts shell"><div><p className="eyebrow">PEOPLE NETWORK</p><h2>可触达的人脉网络</h2><p>来自社群与长期行业交流的可触达圈层。为保护隐私，不公开名称与联系方式；头像仅作视觉示意。</p></div><div className="network-face-grid" aria-label="人脉网络示意"></div></section>
  </>;
}

function PageHeader({ eyebrow, title, description, aside, actions }: { eyebrow: string; title: string; description: string; aside?: ReactNode; actions?: ReactNode }) {
  return <header className="page-header shell"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p>{actions}</div>{aside && <aside>{aside}</aside>}</header>;
}

function BusinessView({ admin }: { admin: boolean }) {
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inquiryType, setInquiryType] = useState<string | null>(null);
  const [qrPlan, setQrPlan] = useState<string | null>(null);
  const businessTypes: Array<{ icon: BusinessTypeIconName; title: string; text: string; tags: string[]; brief: string }> = [
    { icon: "registration", title: "海外公司注册", text: "围绕目标市场的主体设立，梳理注册路径、所需材料与当地服务对接。", tags: ["主体设立", "注册材料", "当地服务"], brief: "目标国家、业务类型、设立时间与主体需求" },
    { icon: "publishing", title: "包体上架", text: "围绕 App Store 与 Google Play 上架，沟通账号准备、包体资料、审核与版本发布。", tags: ["应用上架", "审核准备", "版本发布"], brief: "平台、目标地区、包体状态与计划上线时间" },
    { icon: "payment", title: "海外支付", text: "结合目标市场的付费场景，沟通本地支付、收款接入与结算需求。", tags: ["本地支付", "收款接入", "结算方案"], brief: "业务主体、目标国家、币种与交易场景" },
    { icon: "games", title: "海外小游戏与 SLG", text: "面向出海产品，交流轻量互动小游戏、SLG 玩法及开发接入需求。", tags: ["互动小游戏", "SLG", "游戏接入"], brief: "目标市场、玩法需求、技术环境与合作方式" },
    { icon: "gifts", title: "直播礼物特效与定制", text: "提供语聊与直播场景的礼物动效、主题素材及定制设计沟通。", tags: ["礼物特效", "主题素材", "定制设计"], brief: "参考风格、素材格式、授权范围与交付时间" },
    { icon: "growth", title: "投流与增长", text: "围绕海外获客目标，沟通广告投放、素材测试与本地化增长方案。", tags: ["广告投放", "素材测试", "本地化增长"], brief: "投放地区、目标用户、预算范围与转化目标" },
  ];
  const commercialPlans = [
    { title: "资源入驻", label: "建立行业展示入口", price: "¥500", cadence: "/月", billing: "按月合作 · 适合先建立品牌展示", description: "面向支付、RTC、投放、本地化、数据与设计服务商，让需求方快速了解你的产品与服务。", featured: false, badge: "基础展示", deliverables: [
      ["1 个产品 / 服务展示位", "对应 1 家公司，展示周期 30 天"],
      ["网站资源卡片 + 官网介绍", "包含品牌标识、服务简介与官网链接"],
      ["最多 2 个分类展示", "按服务能力进入相关资源分类"],
      ["每月 1 次资料更新", "更新产品介绍、服务范围或联系入口"],
    ] },
    { title: "行业内容合作", label: "用内容讲清产品价值", price: "¥1,500起", cadence: "/月", billing: "按月合作 · 每月 1 组主题内容", description: "围绕真实产品、使用场景与行业问题共同策划，把产品能力转化为读者愿意了解的内容。", featured: true, badge: "小骆力荐", deliverables: [
      ["包含资源入驻全部权益", "1 个产品展示位，合作期内持续展示"],
      ["网站文章 1 篇 / 月", "围绕 1 个主题策划、撰写与发布"],
      ["小红书内容 1 篇 / 月", "基于同一主题改编为平台图文"],
      ["朋友圈分享 2 次 / 月", "配合文章发布与重点信息传播"],
      ["内容修改 1 轮 / 组", "发布前集中确认事实、文案与素材"],
    ] },
    { title: "年度合作伙伴", label: "为全年传播留出计划", price: "¥15,000起", cadence: "/年", billing: "折合 ¥1,250起 / 月 · 按年合作", description: "适合有持续内容需求或多产品布局的团队，围绕业务节点安排全年主题与发布节奏。", featured: false, badge: "年度方案", deliverables: [
      ["最多 3 个产品 / 服务展示位", "同一公司旗下，持续展示 12 个月"],
      ["网站文章 12 篇 / 年", "全年 12 组主题内容，按节点排期"],
      ["小红书内容 12 篇 / 年", "每组主题配套 1 篇改编图文"],
      ["朋友圈分享 24 次 / 年", "每组主题配套 2 次分享"],
      ["季度选题沟通 4 次 / 年", "每次 30 分钟，复盘并安排下一阶段"],
      ["资料更新 2 次 / 月", "每组内容含 1 轮修改，年内灵活使用"],
    ] },
  ];
  const services = [
    { title: "行业内容共创", text: "围绕产品实践与团队经验，沟通访谈、案例文章或专题内容的选题与呈现方式。", tags: ["团队访谈", "案例文章", "专题策划"] },
    { title: "产品体验与研究", text: "结合真实产品体验，交流用户路径、互动机制与本地化问题，明确研究范围与资料边界。", tags: ["产品体验", "机制拆解", "本地化交流"] },
    { title: "品牌与服务展示", text: "面向出海社交从业者，介绍与语聊、直播相关的技术、设计及运营服务。", tags: ["服务介绍", "应用场景", "资源展示"] },
    { title: "招聘与团队传播", text: "整理团队介绍与真实岗位需求，沟通职位展示和招聘内容，帮助候选人了解业务方向。", tags: ["团队介绍", "职位展示", "招聘内容"] },
    { title: "活动与行业交流", text: "围绕明确议题，探讨线上分享、主题对谈及行业活动的内容共创与传播配合。", tags: ["线上分享", "主题对谈", "活动共创"] },
    { title: "行业资源对接", text: "根据地区、业务场景与需求寻找相关线索，在双方同意的前提下沟通引荐。", tags: ["需求梳理", "服务线索", "定向交流"] },
  ];
  const cases = [
    { company: "极瞬", subject: "直播礼物 · 视觉内容", title: "吐血整理｜最受欢迎中东直播礼物Top1-30", text: "围绕中东直播礼物展开内容整理，为产品与运营人员提供礼物设计参考。", cover: "/optimized/partners/jishun-case.webp" },
    { company: "声网", subject: "实时互动 · 行业观察", title: "语聊App越来越容易做，为什么赚钱越来越难", text: "从实时互动技术切入，讨论语聊产品的用户关系经营与商业化问题。", cover: "/optimized/partners/agora-case.webp" },
  ];
  return <div className="collab-page">
    {inquiryType !== null && <BusinessInquiryDialog initialType={inquiryType} onClose={() => setInquiryType(null)} />}
    {admin && inboxOpen && <BusinessInbox onClose={() => setInboxOpen(false)} />}
    {qrPlan !== null && <BusinessQrDialog plan={qrPlan} onClose={() => setQrPlan(null)} />}
    <div className="business-hero business-photo-hero"><PageHeader eyebrow="BUSINESS COLLABORATION / 商务合作" title="让好的想法，遇见合适的合作。" description="连接出海社交团队与行业资源。从产品研究、内容共创到业务交流，一起把需求聊清楚，把合作做扎实。" actions={<div className="business-hero-actions"><button className="collab-primary" onClick={() => setInquiryType("")}>提交行业需求</button>{admin && <button className="collab-plan-action" style={{ width: "auto", margin: 0 }} onClick={() => setInboxOpen(true)}>查看需求</button>}</div>} aside={<figure className="business-photo"><img src="/business-collaboration-photo.webp" width="1536" height="1024" alt="虚构商务团队在明亮办公室交流产品方案，AI生成场景示意" fetchPriority="high"/></figure>} /></div>
    <section className="shell collab-section" aria-labelledby="collab-types-title">
      <div className="collab-section-head"><h2 id="collab-types-title">选择适合你的合作方案</h2><p>从一个展示入口，到每月内容共创，再到全年传播计划。</p></div>
      <div className="collab-plan-grid" aria-label="资源与内容合作方案">
        {commercialPlans.map((plan) => <article className={`collab-plan${plan.featured ? " collab-plan-featured" : ""}`} key={plan.title}>
          <div className="collab-plan-topline"><span>{plan.label}</span>{plan.featured ? <RecommendationBadge /> : <span className="collab-plan-badge">{plan.badge}</span>}</div>
          <h3>{plan.title}</h3>
          <p className="collab-plan-description">{plan.description}</p>
          <p className="collab-plan-price">{plan.price}<span>{plan.cadence}</span></p>
          <p className="collab-plan-billing">{plan.billing}</p>
          <button className="collab-plan-action" onClick={() => setQrPlan(plan.title)}>咨询服务</button>
          <div className="collab-plan-benefits"><p>方案包含</p><ul>{plan.deliverables.map(([title, detail]) => <li key={title}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m4 10 4 4 8-8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg><div><strong>{title}</strong><span>{detail}</span></div></li>)}</ul></div>
        </article>)}
      </div>
      <div className="collab-plan-terms"><p><strong>权益如何计算</strong>1 组内容 = 1 篇网站文章 + 1 篇同主题小红书图文 + 2 次朋友圈分享。月度权益在当期安排；年度 12 组可在合作期内统筹，每月最多安排 2 组。</p><p><strong>合作如何开始</strong>提交需求后确认选题、素材与排期，再确定合作。价格对应上述标准范围；视频、深度专项调研和额外产品另行沟通。</p></div>
      <h3 className="collab-capabilities-title">更多业务合作方向</h3>
      <div className="collab-services collab-business-types">{businessTypes.map((item, index) => <article key={item.title}><div className="collab-type-top"><span className="collab-type-icon"><BusinessTypeIcon name={item.icon} /></span><span className="collab-number">0{index + 1}</span></div><h3>{item.title}</h3><p>{item.text}</p><div className="collab-tags">{item.tags.map(tag => <span key={tag}>{tag}</span>)}</div><button className="collab-service-link" onClick={() => setInquiryType(item.title)}>咨询{item.title}</button></article>)}</div>
      <p className="collab-note">合作内容、发布渠道、排期和费用以双方确认的方案为准。其他合作方向的资源、接入条件与交付能力需逐项确认；公司注册与支付相关合作需核实服务方资质、地区覆盖及适用要求。</p>
    </section>
    <section className="shell collab-section" aria-labelledby="collab-services-title"><div className="collab-section-head"><h2 id="collab-services-title">合作方式</h2><p>从具体需求出发，共同确定合作范围与交付形式。</p></div><div className="collab-services">{services.map((service, index) => <article key={service.title}><span className="collab-number">0{index + 1}</span><h3>{service.title}</h3><p>{service.text}</p><div className="collab-tags">{service.tags.map(tag => <span key={tag}>{tag}</span>)}</div></article>)}</div></section>
    <section className="shell collab-section" aria-labelledby="collab-cases-title"><div className="collab-section-head"><h2 id="collab-cases-title">合作案例</h2><p>从具体产品出发，让内容对行业有用。</p></div><div className="collab-cases">{cases.map(item => <article className="collab-case" key={item.company}><div className="collab-cover"><img src={item.cover} alt={item.title + "封面"} loading="lazy" /></div><div className="collab-case-body"><div className="collab-case-company"><strong>{item.company}</strong><span>{item.subject}</span></div><h3>{item.title}</h3><p>{item.text}</p><a href="https://www.xiaohongshu.com/user/profile/6a559ddd000000000e03d001" target="_blank" rel="noreferrer">前往小红书主页</a></div></article>)}</div></section>
    <section className="business-links shell collab-section"><div className="collab-section-head"><h2>合作链接</h2><p>展示与出海社交行业相关的产品与服务。</p></div><div className="business-link-grid"><article className="featured-link"><div className="featured-link-main"><p className="eyebrow">PARTNER LINK · 01</p><h3 className="partner-company-title"><img src="/optimized/partners/jishun-animation.webp" alt="极瞬动画 Logo" />极瞬动画有限公司</h3><p>成品直播礼物，承接各类定制设计。欢迎了解直播互动礼物与视觉内容合作方案。</p><a href="https://www.jsgift.top/" target="_blank" rel="noreferrer">访问 jsgift.top</a></div><aside className="featured-link-details"><span>服务范围</span><strong>直播互动<br />视觉内容</strong><div><i>成品礼物</i><i>定制设计</i><i>动画制作</i></div><small>适合语聊、直播与泛娱乐产品的活动与日常运营场景。</small></aside></article></div></section>
    <section className="shell collab-section collab-contact" id="business-contact"><div className="collab-contact-intro"><p className="eyebrow">CONTACT</p><h2>联系合作</h2><p>可提交行业需求，也可扫描页脚微信二维码联系。先把需求说明白，再确认合作范围与排期。</p><button className="collab-primary" onClick={() => setInquiryType("")}>提交行业需求</button><p className="collab-note">具体范围、排期与费用另行确认；不承诺曝光、转化或招聘结果。请勿发送未经授权的内部资料。</p></div><div className="collab-contact-checklist"><strong>沟通时建议提供</strong><ul className="collab-brief"><li>公司 / 产品名称与业务简介</li><li>合作方向、目标与期望交付</li><li>预计时间、预算范围（如有）</li><li>联系人及可提供的参考资料</li></ul></div></section>
  </div>;
}
function ResearchProductLinks({ company, records, matrixCompany }: { company: string; records: MatrixRecord[]; matrixCompany?: string }) {
  const match = researchProducts(company, matrixCompanies, records, matrixCompany);
  if (!match || !match.products.length) return null;
  return <div className="research-product-links"><div className="research-product-heading"><span>对应产品 · {match.products.length} 个</span><a href={`/?view=matrix&company=${encodeURIComponent(match.sourceCompany)}`}>查看公司矩阵</a></div><div className="research-product-tags">{match.products.slice(0, 6).map((product: string, index: number) => <span key={`${product}-${index}`}>{product}</span>)}{match.products.length > 6 && <span>另 {match.products.length - 6} 个</span>}</div></div>;
}
function researchCompanyLogo(company: string, matrixCompany: string | undefined, records: MatrixRecord[] | null) {
  const match = researchProducts(company, matrixCompanies, records || [], matrixCompany);
  if (!match) return "";
  const override = records?.find((record) => (record.sourceCompany || record.company) === match.sourceCompany);
  return override?.logoUrl || companyLogos[match.sourceCompany] || "";
}
function CompanyAnalysisView({ admin }: { admin: boolean }) {
  const [matrixRecords, setMatrixRecords] = useState<MatrixRecord[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    loadPublicData("/api/matrix").then((data: { items?: MatrixRecord[] }) => setMatrixRecords(data.items || [])).catch(() => undefined);
    return () => controller.abort();
  }, []);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [articles, setArticles] = useState<Array<{ slug: string; title: string; company: string; category: string; summary: string; tags: string[]; publishedAt: string; updatedAt: string; views: number; matrixCompany?: string }>>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const reload = () => { setLoadState("loading"); loadArticles().then((data: { items?: unknown[] }) => { setArticles((data.items || []) as typeof articles); setLoadState("ready"); }).catch(() => setLoadState("error")); };
  useEffect(() => { reload(); }, []);
  const displayDate = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? "日期待补充" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date); };
  const normalizedQuery = query.trim().toLowerCase();
  const shownAnalyses = articles.filter((item) => !normalizedQuery || [item.company, item.title, item.summary, ...item.tags].join(" ").toLowerCase().includes(normalizedQuery));
  const pageCount = Math.max(1, Math.ceil(shownAnalyses.length / ANALYSIS_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageAnalyses = shownAnalyses.slice((currentPage - 1) * ANALYSIS_PAGE_SIZE, currentPage * ANALYSIS_PAGE_SIZE);
  const warmArticle = (item: typeof articles[number]) => { prefetchArticleRoute(item.slug); void prefetchArticle(item.slug, item.updatedAt).catch(() => undefined); };
  useEffect(() => {
    if (!pageAnalyses.length) return;
    const warm = () => pageAnalyses.forEach(warmArticle);
    return scheduleIdleWork(warm);
  }, [articles, currentPage, normalizedQuery]);
  return <div className="research-archive">
    <PageHeader eyebrow="COMPANY RESEARCH" title="公司深度研究" description="聚焦出海社交企业，梳理产品布局、商业模式与市场动态，基于公开资料持续核验与更新。" aside={admin && <a className="primary analysis-publish-link" href="/admin">发布文章</a>} />
    <section className="analysis-section shell"><label className="analysis-search"><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="例如：欢聚、Yalla、语聊、商业化" aria-label="搜索公司分析" /><b role="status">{loadState === "loading" ? "加载中…" : loadState === "error" ? "加载失败" : `${shownAnalyses.length} 篇研究`}</b></label><div className="analysis-list">{pageAnalyses.map((item, index) => {
      const company = item.company || "公司研究";
      const logoUrl = researchCompanyLogo(item.company, item.matrixCompany, matrixRecords);
      return <article key={item.slug} style={{ "--research-stagger": `${index * 85}ms` } as CSSProperties}><a className="analysis-card-link" href={`/analysis/${item.slug}`} onPointerEnter={() => warmArticle(item)} onFocus={() => warmArticle(item)} onTouchStart={() => warmArticle(item)}><div className="analysis-card-top"><span className="research-company-heading"><span className="research-company-logo"><CompanyLogo company={company} logoUrl={logoUrl} /></span><span className="research-company">{company}</span></span><time className="research-published" dateTime={item.publishedAt}>{displayDate(item.publishedAt)} 发布</time></div><h2>{item.title}</h2><p>{item.summary}</p><div className="research-tags">{item.tags.map((tag) => <i key={tag}>{tag}</i>)}</div><div className="analysis-card-footer"><span className="analysis-more">阅读全文</span><span className="analysis-views">阅读 {item.views}</span></div></a>{matrixRecords !== null && <ResearchProductLinks company={item.company} records={matrixRecords} matrixCompany={item.matrixCompany} />}</article>;
    })}</div>{pageCount > 1 && <nav className="analysis-pagination" aria-label="公司分析分页"><button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}>上一页</button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button type="button" key={pageNumber} className={pageNumber === currentPage ? "is-active" : undefined} aria-current={pageNumber === currentPage ? "page" : undefined} onClick={() => setPage(pageNumber)}>{pageNumber}</button>)}<button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage === pageCount}>下一页</button></nav>}{shownAnalyses.length === 0 && <div className="analysis-empty" role="status">{loadState === "loading" ? "正在加载公司研究…" : loadState === "error" ? <><p>公司研究暂时无法加载，请稍后重试。</p><button onClick={reload}>重新加载</button></> : articles.length ? <><p>没有匹配内容，换一个关键词试试。</p><button onClick={() => { setQuery(""); setPage(1); }}>清除搜索</button></> : "还没有已发布的公司分析。"}</div>}</section>
  </div>;
}

type MatrixRecord = { province?: string; id: string; company: string; products: string[]; category: string; logoUrl: string; note: string; sourceCompany: string; deleted: boolean };
type MatrixEntry = MatrixRecord & { tone: string; isBuiltIn: boolean };
const builtInMatrixId = (company: string) => `atlas:${company}`;

function MatrixView({ admin }: { admin: boolean }) {
  const [query, setQuery] = useState("");
  useEffect(() => { setQuery(new URLSearchParams(window.location.search).get("company") || ""); }, []);
  const [region, setRegion] = useState("");
  const [selected, setSelected] = useState<MatrixEntry | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [records, setRecords] = useState<MatrixRecord[]>([]);
  const [editor, setEditor] = useState<MatrixEntry | null>(null);
  const load = async (force = true) => { try { const data = await loadPublicData("/api/matrix", { force }); setRecords(data.items || []); setLoadError(false); } catch { setLoadError(true); } };
  useEffect(() => { void load(false); }, []);
  const overrides = new Map(records.filter((record) => record.sourceCompany).map((record) => [record.sourceCompany, record]));
  const builtIns = matrixCompanies.map((item) => {
    const override = overrides.get(item.company);
    const displayName = item.company === "怡好青春" ? "广州怡好青春信息技术有限公司" : item.company;
    return { id: override?.id || builtInMatrixId(item.company), company: override?.company && override.company !== item.company ? override.company : displayName, products: override?.products || item.products, category: override?.category || item.tone, logoUrl: override?.logoUrl || companyLogos[item.company] || "", note: override?.note || companyEntityNotes[item.company] || "", sourceCompany: item.company, province: override?.province || "", deleted: override?.deleted || false, tone: override?.category || item.tone, isBuiltIn: true };
  }).filter((item) => !item.deleted);
  const additions = records.filter((record) => !record.sourceCompany && !record.deleted).map((record) => ({ ...record, tone: record.category, isBuiltIn: false }));
  const companies = [...builtIns, ...additions];
  const term = query.trim().toLowerCase();
  const shownCompanies = companies.filter((item) => matchesRegion(item, region) && (!term || [item.company, ...item.products].some((value) => value.toLowerCase().includes(term))));
  shownCompanies.sort((a, b) => b.products.length - a.products.length);
  const remove = async (item: MatrixEntry) => {
    if (!confirm(`确定删除「${item.company}」吗？`)) return;
    const override = records.find((record) => record.sourceCompany === item.sourceCompany);
    const body = item.isBuiltIn ? { company: item.company, products: item.products, category: item.category, note: item.note, sourceCompany: item.sourceCompany, deleted: true } : undefined;
    const endpoint = item.isBuiltIn ? (override ? `/api/article-admin/matrix/${override.id}` : "/api/article-admin/matrix") : `/api/article-admin/matrix/${item.id}`;
    const method = item.isBuiltIn ? (override ? "PATCH" : "POST") : "DELETE";
    try {
      const response = await fetch(endpoint, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      if (!response.ok) { const data = await response.json().catch(() => ({})); alert(data.error || "删除失败，请稍后重试。"); }
      else await load();
    } catch { alert("网络异常，无法确认删除结果，请刷新列表后重试。"); }
  };
  return <div className="matrix-explorer">
    <PageHeader eyebrow="PRODUCT ATLAS" title="出海产品矩阵" description="从产品找公司，从公司看产品布局。语聊、直播与泛娱乐社交的研究入口。" aside={admin && <button className="primary matrix-publish-button" onClick={() => setEditor({ id: "", company: "", products: [], category: "voice", logoUrl: "", note: "", sourceCompany: "", deleted: false, tone: "voice", isBuiltIn: false })}>发布公司 ＋</button>} />
      <div className="atlas-toolbar atlas-toolbar-above-regions shell">
        <div className="atlas-search"><input type="search" aria-label="搜索公司或产品" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索公司或产品" /></div>
      </div>
    <CompanyRegions companies={companies} region={region} onRegionChange={setRegion} />
    <section id="matrix-company-results" className="matrix-section shell" aria-label="公司与产品目录">
      <div className="atlas-directory-header">
      <h2 className="atlas-directory-title">公司与产品</h2>
      <div className="atlas-summary"><p role="status">{term || region ? <>{region && `${region === UNKNOWN_REGION ? "所在地待核实" : region} · `}找到 <strong>{shownCompanies.length}</strong> 家公司</> : <><strong>{companies.length}</strong> 家公司 / 团队 · <strong>{companies.reduce((sum, item) => sum + item.products.length, 0)}</strong> 个产品条目</>}</p><span>含独立版本及历史条目，不代表全部在运营</span>{(term || region) && <button onClick={() => { setQuery(""); setRegion(""); }}>清除筛选</button>}</div>
      </div>
      {loadError && <p className="atlas-load-error" role="alert">最新管理数据加载失败，当前展示基础清单。<button onClick={() => void load()}>重试</button></p>}
      {shownCompanies.length ? <div className="matrix-grid">{shownCompanies.map((item) => {
        const products = term ? [...item.products.filter((product) => product.toLowerCase().includes(term)), ...item.products.filter((product) => !product.toLowerCase().includes(term))] : item.products;
        const location = companyLocation(item);
        return <article className="company-card" key={item.id}>
          <div className="atlas-company-heading"><span className="atlas-card-logo"><CompanyLogo company={item.company} logoUrl={item.logoUrl} /></span><h3>{item.company}</h3></div>
          <div className="atlas-card-meta"><p className="atlas-location" title={location?.basis}>{location ? `${location.province} · ${location.city}` : "所在地待核实"}</p><div className="atlas-count"><strong>{item.products.length}</strong><span>个产品条目</span></div></div>
          <div className="atlas-products">{products.slice(0, 6).map((product, index) => <span key={`${product}-${index}`} className={term && product.toLowerCase().includes(term) ? "is-match" : undefined}>{product}</span>)}</div>
          <footer><button className="atlas-detail-button" onClick={() => setSelected(item)} aria-label={`查看${item.company}的完整产品清单`}>查看完整清单</button>{item.note && <span className="atlas-note-indicator">含归属说明</span>}{admin && <span className="matrix-admin-actions"><button onClick={() => setEditor(item)}>编辑</button><button className="danger" onClick={() => void remove(item)}>删除</button></span>}</footer>
        </article>;
      })}</div> : <div className="matrix-empty"><h2>暂时没有匹配的公司</h2><p>试试其他地区、产品英文名或公司简称。</p><button onClick={() => { setQuery(""); setRegion(""); }}>查看全部公司</button></div>}
      <p className="atlas-footnote">来源：小骆产品图谱。用于发现研究线索；公司归属及运营状态请结合最新公告、商店主体与隐私政策交叉核验。</p>
    </section>
    {selected && <MatrixPortfolio item={selected} onClose={() => setSelected(null)} />}
    {editor && <MatrixEditor initial={editor} onClose={() => setEditor(null)} onSaved={async () => { setEditor(null); await load(); }} />}
  </div>;
}

function MatrixPortfolio({ item, onClose }: { item: MatrixEntry; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previousOverflow; };
  }, []);
  return <dialog ref={dialog} className="atlas-dialog" aria-labelledby="atlas-dialog-title" onCancel={onClose} onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}>
    <div className="atlas-dialog-top"><span>公司产品清单</span><button autoFocus onClick={onClose} aria-label="关闭产品清单">×</button></div>
    <h2 id="atlas-dialog-title">{item.company}</h2><p className="atlas-dialog-count">共 {item.products.length} 个产品条目 · 含独立版本及历史条目</p>
    <ul className="atlas-full-products">{item.products.map((product, index) => <li key={`${product}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span>{product}</li>)}</ul>
    {item.note && <div className="atlas-ownership"><h3>归属 / 产品说明</h3><p>{item.note}</p></div>}
    <p className="atlas-footnote">来源：小骆产品图谱。未单独标注状态的产品，不等同于已核验在运营。</p>
  </dialog>;
}

function MatrixEditor({ initial, onClose, onSaved }: { initial: MatrixEntry; onClose: () => void; onSaved: () => void }) {
  const [province, setProvince] = useState(initial.province || companyLocation(initial)?.province || "");
  const [company, setCompany] = useState(initial.company); const [products, setProducts] = useState(initial.products.join("、")); const [note, setNote] = useState(initial.note); const [logo, setLogo] = useState(""); const [preview, setPreview] = useState(initial.logoUrl); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const selectLogo = async (file?: File) => { if (!file) return; setError(""); try { const output = await compressMatrixLogo(file); setLogo(output.data); setPreview(output.url); } catch (cause) { setError(cause instanceof Error ? cause.message : "公司 Logo 处理失败。"); } };
  const persisted = initial.isBuiltIn && initial.id !== builtInMatrixId(initial.sourceCompany);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); setError(""); const payload = { company, province, products: products.split(/[、,，]/).map((item) => item.trim()).filter(Boolean), category: initial.category || "voice", note, logo, sourceCompany: initial.sourceCompany }; try { const response = await fetch(initial.id && (!initial.isBuiltIn || persisted) ? `/api/article-admin/matrix/${initial.id}` : "/api/article-admin/matrix", { method: initial.id && (!initial.isBuiltIn || persisted) ? "PATCH" : "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "发布失败，请稍后重试。"); onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "发布失败，请稍后重试。"); } finally { setSaving(false); } };
  return <div className="matrix-submit-modal" role="dialog" aria-modal="true" aria-label="发布公司" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="matrix-submit-dialog matrix-company-editor" onSubmit={(event) => void submit(event)}><div className="matrix-submit-top"><div><p className="eyebrow">PRODUCT ATLAS ADMIN</p><h2>{initial.id ? "编辑公司" : "发布公司"}</h2></div><button className="matrix-submit-close" type="button" onClick={onClose} aria-label="关闭">×</button></div><label>公司 / 团队名称<input autoFocus required value={company} onChange={(event) => setCompany(event.target.value)} placeholder="例如：某某科技有限公司" /></label><label>所在省份 / 地区<select required value={province} onChange={event => setProvince(event.target.value)}><option value="" disabled>请选择省份或地区</option>{provinces.map(name => <option key={name} value={name}>{name}</option>)}<option value="unknown">所在地待核实</option></select><small>按公司国内主体所在地填写，保存后同步更新地区筛选。</small></label><label>产品名称<textarea required value={products} onChange={(event) => setProducts(event.target.value)} placeholder="多个产品用顿号或逗号分隔" /></label><label>公司说明（可选）<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：归属或产品状态说明" /></label><label>公司 Logo（PNG、JPG、WebP）<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void selectLogo(event.target.files?.[0])} /><small>支持横版、竖版和方形 Logo，上传后按原比例转换为 WebP。</small></label>{preview && <img className="matrix-logo-preview" src={preview} alt="公司 Logo 预览" />}{error && <p className="matrix-submit-error">{error}</p>}<div className="matrix-submit-actions"><button type="button" onClick={onClose}>取消</button><button className="primary" type="submit" disabled={saving}>{saving ? "正在保存…" : initial.id ? "保存修改" : "发布公司"}</button></div></form></div>;
}

function MatrixSubmissionModal({ onClose }: { onClose: () => void }) {
  const [company, setCompany] = useState("");
  const [products, setProducts] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [error, setError] = useState("");
  useEffect(() => {
    const dismissOnBackdrop = (event: MouseEvent) => {
      if (event.target instanceof HTMLElement && event.target.classList.contains("matrix-submit-modal")) onClose();
    };
    document.addEventListener("click", dismissOnBackdrop);
    return () => document.removeEventListener("click", dismissOnBackdrop);
  }, [onClose]);
  const submit = async () => {
    setState("saving"); setError("");
    try {
      const response = await fetch("/api/matrix-submissions", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company, products }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "提交失败，请稍后重试。");
      setState("success");
    } catch (cause) { setState("error"); setError(cause instanceof Error ? cause.message : "提交失败，请稍后重试。"); }
  };
  return <div className="matrix-submit-modal" role="dialog" aria-modal="true" aria-label="补充图谱"><form className="matrix-submit-dialog" onSubmit={(event) => { event.preventDefault(); void submit(); }}><div className="matrix-submit-top"><div><p className="eyebrow">CONTRIBUTE TO THE ATLAS</p><h2>补充图谱线索</h2></div><button className="matrix-submit-close" type="button" onClick={onClose} aria-label="关闭">×</button></div>{state === "success" ? <div className="matrix-submit-success"><h3>已提交</h3><p>感谢补充。小骆会在后台核验后更新到产品图谱。</p><button className="primary" type="button" onClick={onClose}>完成</button></div> : <><p className="matrix-submit-intro">请留下确定的公司 / 团队名称与产品名称；提交后会进入后台审核。</p><label>公司 / 团队名称<input required autoFocus value={company} onChange={(event) => setCompany(event.target.value)} placeholder="例如：某某科技有限公司" /></label><label>产品名称<textarea required value={products} onChange={(event) => setProducts(event.target.value)} placeholder="例如：产品 A、产品 B（多个产品可用顿号或逗号分隔）" /></label>{error && <p className="matrix-submit-error">{error}</p>}<div className="matrix-submit-actions"><button type="button" onClick={onClose} disabled={state === "saving"}>取消</button><button className="primary" type="submit" disabled={state === "saving"}>{state === "saving" ? "正在提交…" : "提交审核"}</button></div></>}</form></div>;
}

function AdminLogin({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const dismissOnBackdrop = (event: MouseEvent) => {
      if (event.target instanceof HTMLElement && event.target.classList.contains("admin-login-modal")) onClose();
    };
    document.addEventListener("click", dismissOnBackdrop);
    return () => document.removeEventListener("click", dismissOnBackdrop);
  }, [onClose]);
  const submit = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/session", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "登录失败，请重试。");
      onSuccess();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "登录失败，请重试。"); }
    finally { setLoading(false); }
  };
  return <div className="admin-login-modal" role="dialog" aria-modal="true" aria-label="后台管理登录"><form className="admin-login-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}><div><p className="eyebrow">SITE ADMIN</p><h2>后台管理</h2><p>登录后可管理日报、公司矩阵与人才市场。</p></div><label>账号<input autoFocus value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label><label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>{error && <p className="admin-login-error">{error}</p>}<div><button type="button" onClick={onClose} disabled={loading}>取消</button><button className="primary" type="submit" disabled={loading}>{loading ? "正在登录…" : "登录管理"}</button></div></form></div>;
}

function TalentView({ admin }: { admin: boolean; onLogout?: () => Promise<void> }) {
  type MatrixSubmission = { id: string; company: string; products: string; status: "pending" | "reviewed"; createdAt: string };
  const [mode, setMode] = useState<"jobs" | "people">("jobs");
  const [city, setCity] = useState("全部地点");
  const [role, setRole] = useState("全部岗位");
  const [jobs, setJobs] = useState<Array<typeof jobListings[number] & { id?: string; bossDirect?: boolean; imageUrl?: string }>>([]);
  const [people, setPeople] = useState<Array<typeof talentProfiles[number] & { id?: string }>>([]);
  const [syncState, setSyncState] = useState<"loading" | "ready" | "error">("loading");
  const [syncError, setSyncError] = useState("");
  const [atlasSubmissions, setAtlasSubmissions] = useState<MatrixSubmission[]>([]);
  const [atlasSyncState, setAtlasSyncState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [atlasError, setAtlasError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ kind: "jobs" | "people"; id?: string } | null>(null);
  const [draft, setDraft] = useState({ kind: "jobs" as "jobs" | "people", company: "", title: "", city: "Dubai", focus: "产品", type: "全职", level: "1–3 年", exp: "3 年", tags: "", note: "", description: "", contact: "", bossDirect: false, imageData: "", imageSize: 0 });
  const [imageError, setImageError] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [detail, setDetail] = useState<{ company: string; title: string; city: string; type: string; level: string; description: string; contact: string } | null>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("kind") === "people") setMode("people");
  }, []);
  useEffect(() => {
    if (syncState !== "ready") return;
    const scrollToLinkedCard = () => {
      try {
        const id = decodeURIComponent(window.location.hash.slice(1));
        if (id.startsWith("talent-")) document.getElementById(id)?.scrollIntoView({ block: "start" });
      } catch { /* Ignore malformed external fragment identifiers. */ }
    };
    const frame = requestAnimationFrame(scrollToLinkedCard);
    window.addEventListener("hashchange", scrollToLinkedCard);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hashchange", scrollToLinkedCard); };
  }, [mode, syncState]);
  useEffect(() => {
    if (!editing) return;
    const dismissOnBackdrop = (event: MouseEvent) => {
      if (event.target instanceof HTMLElement && event.target.classList.contains("talent-modal")) setEditing(null);
    };
    document.addEventListener("click", dismissOnBackdrop);
    return () => document.removeEventListener("click", dismissOnBackdrop);
  }, [editing]);
  const cities = ["全部地点", ...Array.from(new Set(jobs.map((job) => job.city).filter(Boolean)))];
  const roles = ["全部岗位", ...Array.from(new Set(jobs.map((job) => job.focus).filter(Boolean)))];
  const shownJobs = jobs.filter((job) => (city === "全部地点" || job.city === city) && (role === "全部岗位" || job.focus === role || job.focus.includes(role)));
  useEffect(() => {
    let active = true;
    const readLegacy = (key: string) => { try { const value = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } };
    const request = async (method: "GET" | "POST", body?: unknown) => {
      const response = await fetch("/api/talent", { method, cache: "no-store", credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "人才市场暂时无法同步，请稍后重试。");
      return data;
    };
    const load = async () => {
      try {
        let data = await loadTalentItems();
        let items = Array.isArray(data.items) ? data.items : [];
        if (!items.length) {
          const legacyJobs = readLegacy("xiaoluo-talent-jobs-v2");
          const legacyPeople = readLegacy("xiaoluo-talent-people-v2");
          if (legacyJobs.length || legacyPeople.length) {
            await Promise.all([...legacyJobs.map((item: typeof jobListings[number]) => request("POST", { ...item, kind: "jobs" })), ...legacyPeople.map((item: typeof talentProfiles[number]) => request("POST", { ...item, kind: "people" }))]);
            talentItemsRequest = null; data = await loadTalentItems(); items = Array.isArray(data.items) ? data.items : [];
          }
        }
        if (!active) return;
        setJobs(items.filter((item: { kind?: string }) => item.kind === "jobs").map((item: Record<string, unknown>) => ({ id: String(item.id || ""), company: String(item.company || ""), title: String(item.title || ""), city: String(item.city || ""), focus: String(item.focus || "其他"), type: String(item.type || "全职"), level: String(item.level || "不限"), mark: String(item.company || "").slice(0, 2).toUpperCase(), description: String(item.description || ""), contact: String(item.contact || ""), imageUrl: String(item.imageUrl || ""), bossDirect: item.bossDirect === true, sortOrder: Number(item.sortOrder || 0) })));
        setPeople(items.filter((item: { kind?: string }) => item.kind === "people").map((item: Record<string, unknown>) => ({ id: String(item.id || ""), title: String(item.title || ""), city: String(item.city || ""), exp: String(item.exp || "经验不限"), tags: Array.isArray(item.tags) ? item.tags.map(String) : [], note: String(item.note || "开放交流，欢迎联系。"), contact: String(item.contact || ""), imageUrl: String(item.imageUrl || "") })));
        setSyncState("ready");
      } catch (error) { if (active) { setSyncState("error"); setSyncError(error instanceof Error ? error.message : "人才市场暂时无法同步，请稍后重试。"); } }
    };
    load();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!admin) { setAtlasSubmissions([]); setAtlasSyncState("idle"); return; }
    let active = true;
    setAtlasSyncState("loading");
    fetch("/api/matrix-submissions", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || "图谱线索暂时无法读取。");
        if (!active) return;
        setAtlasSubmissions(Array.isArray(data.items) ? data.items : []);
        setAtlasSyncState("ready");
      })
      .catch((error) => { if (active) { setAtlasError(error instanceof Error ? error.message : "图谱线索暂时无法读取。"); setAtlasSyncState("error"); } });
    return () => { active = false; };
  }, [admin]);
  useEffect(() => {
    if (!admin || mode !== "jobs" || city !== "全部地点" || role !== "全部岗位") return;
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".job-grid .job-card"));
    let sourceTitle = "";
    const cleanups = cards.map((card) => {
      card.draggable = true; card.dataset.managing = "true";
      const title = () => card.querySelector("h2")?.textContent || "";
      const onStart = () => { sourceTitle = title(); card.classList.add("is-dragging"); };
      const onOver = (event: DragEvent) => event.preventDefault();
      const onEnd = () => { sourceTitle = ""; card.classList.remove("is-dragging"); };
      const onDrop = () => {
        const targetTitle = title(); const source = jobs.findIndex((job) => job.title === sourceTitle); const target = jobs.findIndex((job) => job.title === targetTitle);
        if (source < 0 || target < 0 || source === target || jobs[source].bossDirect !== jobs[target].bossDirect) return;
        const previous = jobs; const next = [...jobs]; const [moved] = next.splice(source, 1); next.splice(target, 0, moved); setJobs(next);
        void fetch("/api/talent/reorder", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: next.map((job) => job.id).filter(Boolean) }) }).then((response) => { if (!response.ok) { setJobs(previous); setSyncState("error"); setSyncError("排序保存失败，请稍后重试。"); } });
      };
      card.addEventListener("dragstart", onStart); card.addEventListener("dragover", onOver); card.addEventListener("dragend", onEnd); card.addEventListener("drop", onDrop);
      return () => { card.draggable = false; delete card.dataset.managing; card.removeEventListener("dragstart", onStart); card.removeEventListener("dragover", onOver); card.removeEventListener("dragend", onEnd); card.removeEventListener("drop", onDrop); };
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [admin, mode, city, role, jobs]);
  useEffect(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".job-grid .job-card"));
    const cleanups = cards.map((card, index) => {
      const job = shownJobs[index]; if (!job) return () => undefined;
      const button = document.createElement("button"); button.type = "button"; button.className = "job-detail-button"; button.textContent = "查看详情";
      const open = () => {
        const modal = document.createElement("div"); modal.className = "job-detail-modal"; modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true");
        const panel = document.createElement("section"); const close = document.createElement("button"); close.type = "button"; close.textContent = "关闭";
        const image = job.imageUrl ? document.createElement("img") : null; if (image) { image.className = "job-detail-image"; image.src = job.imageUrl || ""; image.alt = `${job.company} 招聘图片`; image.loading = "lazy"; }
        const title = document.createElement("h2"); title.textContent = `${job.company} · ${job.title}`;
        const meta = document.createElement("p"); meta.textContent = [job.city, job.type, job.level].filter(Boolean).join(" · ");
        const body = document.createElement("p"); body.className = "job-detail-copy"; body.textContent = job.description || job.focus;
        const contact = document.createElement("p"); contact.textContent = job.contact ? `联系方式：${job.contact}` : "联系方式请通过小骆咨询。";
        close.addEventListener("click", () => modal.remove()); modal.addEventListener("click", (event) => { if (event.target === modal) modal.remove(); }); panel.append(close, ...(image ? [image] : []), title, meta, body, contact); modal.append(panel); document.body.append(modal);
      };
      button.addEventListener("click", open); card.append(button);
      return () => { button.removeEventListener("click", open); button.remove(); };
    });
    return () => { cleanups.forEach((cleanup) => cleanup()); };
  }, [shownJobs]);
  useEffect(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".job-grid .job-card"));
    const cleanups = cards.map((card, index) => {
      const job = shownJobs[index]; if (!job) return () => undefined;
      const open = () => {
        const overlay = document.createElement("div"); overlay.className = "job-detail-modal"; overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true");
        const panel = document.createElement("div"); panel.className = "job-detail-panel";
        const close = document.createElement("button"); close.type = "button"; close.className = "job-detail-close"; close.setAttribute("aria-label", "关闭详情"); close.textContent = "×";
        const image = job.imageUrl ? document.createElement("img") : null; if (image) { image.className = "job-detail-image"; image.src = job.imageUrl || ""; image.alt = `${job.company} 招聘图片`; image.loading = "lazy"; }
        const tag = document.createElement("p"); tag.className = "eyebrow"; tag.textContent = job.bossDirect ? "BOSS DIRECT" : "TALENT MARKET";
        const title = document.createElement("h2"); title.textContent = job.title;
        const company = document.createElement("h3"); company.textContent = job.company;
        const meta = document.createElement("div"); meta.className = "job-detail-meta"; [job.city, job.type, job.level].forEach((value) => { const item = document.createElement("span"); item.textContent = value; meta.append(item); });
        const content = document.createElement("p"); content.className = "job-detail-content"; content.textContent = job.description || job.focus;
        const contact = document.createElement("p"); contact.className = "job-detail-contact"; contact.textContent = job.contact ? `联系方式：${job.contact}` : "联系方式：请通过发布方进一步沟通";
        const dismiss = () => overlay.remove(); close.addEventListener("click", dismiss); overlay.addEventListener("click", (event) => { if (event.target === overlay) dismiss(); });
        panel.append(close, ...(image ? [image] : []), tag, title, company, meta, content, contact); overlay.append(panel); document.body.append(overlay); close.focus();
      };
      const onCardClick = (event: MouseEvent) => { if ((event.target as HTMLElement).closest("button, a, input, select, textarea")) return; open(); };
      const onCardKeyDown = (event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } };
      card.tabIndex = 0; card.setAttribute("role", "button"); card.setAttribute("aria-label", `查看 ${job.title} 详情`);
      card.addEventListener("click", onCardClick); card.addEventListener("keydown", onCardKeyDown);
      return () => { card.removeEventListener("click", onCardClick); card.removeEventListener("keydown", onCardKeyDown); card.removeAttribute("tabindex"); card.removeAttribute("role"); card.removeAttribute("aria-label"); };
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [shownJobs]);
  useEffect(() => {
    document.querySelectorAll<HTMLElement>(".talent-grid .talent-card").forEach((card) => card.querySelector(".talent-listing-image")?.remove());
    people.forEach((item, index) => {
      const imageUrl = String((item as { imageUrl?: string }).imageUrl || ""); if (!imageUrl) return;
      const card = document.querySelectorAll<HTMLElement>(".talent-grid .talent-card")[index]; if (!card) return;
      const image = document.createElement("img"); image.className = "talent-listing-image"; image.src = imageUrl; image.alt = `${item.title} 图片`; image.loading = "lazy"; card.prepend(image);
    });
  }, [shownJobs, people]);
  const openPublish = (kind: "jobs" | "people" = mode) => { setImageError(""); setPublishError(""); setEditing({ kind }); setDraft({ kind, company: "", title: "", city: "Dubai", focus: "产品", type: "全职", level: "1–3 年", exp: "3 年", tags: "", note: "", description: "", contact: "", bossDirect: false, imageData: "", imageSize: 0 }); };
  const openEdit = (kind: "jobs" | "people", item: (typeof jobs[number]) | (typeof people[number])) => { const image = String((item as { imageUrl?: string }).imageUrl || ""); if (kind === "jobs") { const job = item as typeof jobs[number]; setDraft({ kind, company: job.company, title: job.title, city: job.city, focus: job.focus, type: job.type, level: job.level, exp: "", tags: "", note: "", description: job.description, contact: job.contact, bossDirect: Boolean(job.bossDirect), imageData: image, imageSize: 0 }); } else { const person = item as typeof people[number]; setDraft({ kind, company: "", title: person.title, city: person.city, focus: "", type: "", level: "", exp: person.exp, tags: person.tags.join("、"), note: person.note, description: "", contact: person.contact, bossDirect: false, imageData: image, imageSize: 0 }); } setImageError(""); setEditing({ kind, id: item.id }); };
  const selectImage = async (file?: File) => { if (!file) return; setImageBusy(true); setImageError(""); try { const image = await compressUploadedImage(file); setDraft((current) => ({ ...current, imageData: image.data, imageSize: image.size })); } catch (error) { setImageError(error instanceof Error ? error.message : "图片处理失败，请重试。"); } finally { setImageBusy(false); } };
  useEffect(() => {
    if (!editing) return;
    const form = document.querySelector(".talent-form"); const actions = form?.querySelector(".talent-form-actions");
    if (!form || !actions) return;
    const label = document.createElement("label"); label.className = "talent-image-upload"; label.textContent = "信息图片（自动转 WebP，最大 3MB）";
    const input = document.createElement("input"); input.type = "file"; input.accept = IMAGE_UPLOAD_RULES.accept; input.disabled = imageBusy;
    const hint = document.createElement("small"); hint.textContent = imageError || (draft.imageSize ? `已压缩为 WebP · ${(draft.imageSize / 1024 / 1024).toFixed(2)} MB` : "支持 PNG、JPG、WebP；上传后自动压缩。"); if (imageError) hint.className = "talent-image-error";
    label.append(input, hint);
    if (draft.imageData) { const preview = document.createElement("img"); preview.className = "talent-image-preview"; preview.src = draft.imageData; preview.alt = "已选择的图片预览"; label.append(preview); }
    const publishErrorNode = publishError ? document.createElement("p") : null;
    if (publishErrorNode) { publishErrorNode.className = "talent-form-error"; publishErrorNode.setAttribute("role", "alert"); publishErrorNode.textContent = publishError; form.insertBefore(publishErrorNode, actions); }
    const change = () => { void selectImage(input.files?.[0]); }; input.addEventListener("change", change); form.insertBefore(label, actions);
    return () => { input.removeEventListener("change", change); label.remove(); publishErrorNode?.remove(); };
  }, [editing, draft.imageData, draft.imageSize, imageBusy, imageError, publishError]);
  const saveDraft = async () => {
    if (!editing || !draft.title.trim() || (draft.kind === "jobs" && !draft.company.trim())) return;
    const payload = draft.kind === "jobs" ? { kind: "jobs", company: draft.company.trim(), title: draft.title.trim(), city: draft.city.trim(), focus: draft.focus.trim() || "其他", type: draft.type.trim() || "全职", level: draft.level.trim() || "不限", description: draft.description.trim(), contact: draft.contact.trim(), bossDirect: admin && draft.bossDirect, imageData: draft.imageData.startsWith("data:image/webp") ? draft.imageData : "" } : { kind: "people", title: draft.title.trim(), city: draft.city.trim(), exp: draft.exp.trim() || "经验不限", tags: draft.tags.split(/[、,，]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 4), note: draft.note.trim() || "开放交流，欢迎联系。", contact: draft.contact.trim(), imageData: draft.imageData.startsWith("data:image/webp") ? draft.imageData : "" };
    setSaving(true); setSyncError(""); setPublishError("");
    try {
      const response = await fetch(editing.id ? `/api/talent/${editing.id}` : "/api/talent", { method: editing.id ? "PATCH" : "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "发布失败，请稍后重试。");
      if (payload.kind === "jobs") { const item = { ...payload, ...data.item, id: String(data.item?.id || editing.id || ""), mark: (payload.company || "").slice(0, 2).toUpperCase() }; setJobs((current) => editing.id ? current.map((entry) => entry.id === editing.id ? item : entry) : [item, ...current]); } else { const item = { ...payload, ...data.item, id: String(data.item?.id || editing.id || "") }; setPeople((current) => editing.id ? current.map((entry) => entry.id === editing.id ? item : entry) : [item, ...current]); }
      setEditing(null); setSyncState("ready");
    } catch (error) { const message = error instanceof Error ? error.message : "发布失败，请稍后重试。"; setSyncState("error"); setSyncError(message); setPublishError(message); }
    finally { setSaving(false); }
  };
  const removeListing = async (id?: string) => { if (!id || !window.confirm("确定删除这条公开信息吗？")) return; const response = await fetch(`/api/talent/${id}`, { method: "DELETE", credentials: "same-origin" }); if (!response.ok) { const data = await response.json().catch(() => ({})); setSyncState("error"); setSyncError(data?.error || "删除失败，请稍后重试。"); return; } setJobs((current) => current.filter((item) => item.id !== id)); setPeople((current) => current.filter((item) => item.id !== id)); };
  const updateAtlasSubmission = async (id: string, status: MatrixSubmission["status"]) => {
    const response = await fetch(`/api/matrix-submissions/${id}`, { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setAtlasError(data?.error || "审核状态更新失败。"); setAtlasSyncState("error"); return; }
    setAtlasSubmissions((items) => items.map((item) => item.id === id ? { ...item, status } : item));
  };
  const removeAtlasSubmission = async (id: string) => {
    if (!window.confirm("确定删除这条图谱线索吗？")) return;
    const response = await fetch(`/api/matrix-submissions/${id}`, { method: "DELETE", credentials: "same-origin" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setAtlasError(data?.error || "删除失败，请稍后重试。"); setAtlasSyncState("error"); return; }
    setAtlasSubmissions((items) => items.filter((item) => item.id !== id));
  };
  return <>
    <section className="talent-section shell"><div className="talent-toolbar"><div className="talent-switch" role="tablist" aria-label="人才市场模式"><button className={mode === "jobs" ? "selected" : ""} onClick={() => setMode("jobs")}>正在招聘 <span>{jobs.length}</span></button><button className={mode === "people" ? "selected" : ""} onClick={() => setMode("people")}>开放求职 <span>{people.length}</span></button></div>{admin && <button className="primary publish-talent" onClick={() => openPublish()}>发布信息 ＋</button>}</div><div className="filters"><label>地点<select value={city} onChange={(event) => setCity(event.target.value)}>{cities.map((value) => <option key={value}>{value}</option>)}</select></label><label>岗位<select value={role} onChange={(event) => setRole(event.target.value)}>{roles.map((value) => <option key={value}>{value}</option>)}</select></label><span>{syncState === "loading" ? "正在同步…" : syncState === "error" ? "同步暂不可用" : mode === "jobs" ? `${shownJobs.length} 个匹配岗位` : `${people.length} 位开放人才`}</span></div>{syncState !== "ready" && <p className={`talent-sync-message ${syncState}`}>{syncState === "loading" ? "正在读取全站共享的人才信息…" : syncError}</p>}
      {mode === "jobs" ? shownJobs.length ? <div className="job-grid">{shownJobs.map((job) => <article className="job-card" id={job.id ? `talent-${job.id}` : undefined} key={job.id || `${job.company}-${job.title}`}>{job.bossDirect && <RecommendationBadge className="job-recommendation" />}<h2>{job.company}</h2><h3>{job.title}</h3><div className="job-meta"><span>{job.city}</span><span>{job.type}</span><span>{job.level}</span></div><p>{job.description || job.focus}</p>{job.contact && <small className="listing-contact">联系方式：{job.contact}</small>}{admin && <div className="listing-admin-actions"><button onClick={() => openEdit("jobs", job)}>编辑</button><button onClick={() => void removeListing(job.id)}>删除</button></div>}</article>)}</div> : <EmptyTalentState title={city === "全部地点" && role === "全部岗位" ? "还没有招聘信息" : "没有符合筛选条件的岗位"} text={city === "全部地点" && role === "全部岗位" ? "首条招聘信息将从这里开始。" : "换一个地点或岗位试试。"} action={admin ? "发布招聘信息" : undefined} onClick={admin ? () => openPublish("jobs") : undefined} /> : people.length ? <div className="talent-grid">{people.map((person, index) => <article className="talent-card" id={person.id ? `talent-${person.id}` : undefined} key={person.id || `${person.title}-${index}`}><div className="talent-avatar">{String(index + 1).padStart(2, "0")}</div><div><span>开放求职</span><h2>{person.title}</h2><p>{person.city} · {person.exp}经验</p></div><div className="talent-tags">{person.tags.map((tag) => <i key={tag}>{tag}</i>)}</div><p className="talent-note">{person.note}</p>{person.contact && <small className="listing-contact">联系方式：{person.contact}</small>}{admin && <div className="listing-admin-actions"><button onClick={() => openEdit("people", person)}>编辑</button><button onClick={() => void removeListing(person.id)}>删除</button></div>}</article>)}</div> : <EmptyTalentState title="还没有开放求职信息" text="发布你的方向、地点与经验，让合适的机会找到你。" action={admin ? "发布求职信息" : undefined} onClick={admin ? () => openPublish("people") : undefined} />}</section>
    {admin && <section className="talent-callout shell"><div><p className="eyebrow">POST OR JOIN</p><h2>把正在寻找的，<br />说得更具体。</h2></div><div><p>招聘方可提交岗位；求职者可展示方向、地点和经验。发布后会在人才市场公开展示，所有浏览器都能看到。</p><button className="primary" onClick={() => openPublish()}>发布一条信息 →</button></div></section>}
    {editing && <div className="talent-modal" role="dialog" aria-modal="true" aria-label="发布人才信息"><form className="talent-form" onSubmit={(event) => { event.preventDefault(); void saveDraft(); }}><div className="talent-form-top"><div><p className="eyebrow">TALENT MARKET</p><h2>发布信息</h2></div><button type="button" onClick={() => setEditing(null)} aria-label="关闭">×</button></div><label>信息类型<select value={draft.kind} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as "jobs" | "people" }))}><option value="jobs">正在招聘</option><option value="people">开放求职</option></select></label>{draft.kind === "jobs" && <><label>公司名称<input value={draft.company} required onChange={(event) => setDraft((current) => ({ ...current, company: event.target.value }))} placeholder="例如：极瞬动画" /></label><label>岗位名称<input value={draft.title} required onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="例如：海外产品经理" /></label></>}{draft.kind === "people" && <label>目标岗位<input value={draft.title} required onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="例如：海外增长运营" /></label>}<div className="form-columns"><label>地点<input value={draft.city} onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))} placeholder="Dubai" /></label>{draft.kind === "jobs" ? <label>职能<input value={draft.focus} onChange={(event) => setDraft((current) => ({ ...current, focus: event.target.value }))} placeholder="产品" /></label> : <label>经验<input value={draft.exp} onChange={(event) => setDraft((current) => ({ ...current, exp: event.target.value }))} placeholder="3 年" /></label>}</div>{draft.kind === "jobs" ? <><div className="form-columns"><label>工作形式<input value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))} placeholder="全职" /></label><label>经验要求<input value={draft.level} onChange={(event) => setDraft((current) => ({ ...current, level: event.target.value }))} placeholder="1–3 年" /></label></div><label>岗位内容<textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="简要说明职责、团队或任职要求" /></label></> : <><label>标签（用顿号或逗号分隔）<input value={draft.tags} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} placeholder="语聊、增长、中东" /></label><label>补充说明<textarea value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} placeholder="说明你的方向或希望寻找的机会" /></label></>}<label>联系方式<input value={draft.contact} onChange={(event) => setDraft((current) => ({ ...current, contact: event.target.value }))} placeholder="微信、邮箱或职位链接" /></label>{admin && draft.kind === "jobs" && <label className="boss-direct-toggle"><input type="checkbox" checked={draft.bossDirect} onChange={(event) => setDraft((current) => ({ ...current, bossDirect: event.target.checked }))} /><span><b>Boss直推</b><small>仅用于可由老板或直属负责人直接沟通的岗位。</small></span></label>}<div className="talent-form-actions"><button type="button" onClick={() => setEditing(null)} disabled={saving}>取消</button><button className="primary" type="submit" disabled={saving}>{saving ? "正在发布…" : "发布并同步"}</button></div></form></div>}
  </>;
}

function EmptyTalentState({ title, text, action, onClick }: { title: string; text: string; action?: string; onClick?: () => void }) {
  return <div className="talent-empty"><p className="eyebrow">TALENT MARKET</p><h2>{title}</h2><p>{text}</p>{action && onClick && <button className="primary" onClick={onClick}>{action} ＋</button>}</div>;
}
