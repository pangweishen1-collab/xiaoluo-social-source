"use client";

import { type ReactNode, useEffect, useState } from "react";
import { prefetchArticle, prefetchArticleRoute } from "./article-cache.mjs";
import { IMAGE_UPLOAD_RULES } from "../shared/image-upload.mjs";

const ANALYSIS_PAGE_SIZE = 10;
let articlesRequest: Promise<{ items?: Array<Record<string, unknown>> }> | null = null;
let talentItemsRequest: Promise<{ items?: Array<Record<string, unknown>> }> | null = null;

const loadArticles = () => articlesRequest ??= fetch("/api/articles", { credentials: "same-origin", cache: "no-store" })
  .then(async (response) => response.ok ? response.json() : Promise.reject(new Error("公司分析暂时无法读取。")))
  .catch((error) => { articlesRequest = null; throw error; });
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
  { title: "13万美元大R挂首页，不怕被竞品挖走吗？", text: "22 赞", tag: "产品观察", cover: "/notes/latest-1.webp", href: "https://www.xiaohongshu.com/user/profile/6a559ddd000000000e03d001" },
  { title: "TopTop资深产品Ray，说透了什么叫本地化", text: "34 赞", tag: "行业访谈", cover: "/notes/latest-2.webp", href: "https://www.xiaohongshu.com/user/profile/6a559ddd000000000e03d001" },
  { title: "一年营收150亿的欢聚，为什么复制不出第二", text: "64 赞", tag: "公司观察", cover: "/notes/latest-3.webp", href: "https://www.xiaohongshu.com/user/profile/6a559ddd000000000e03d001" },
  { title: "建议收藏！游戏用户怎么变成语聊用户？", text: "34 赞", tag: "产品观察", cover: "/notes/latest-4.webp", href: "https://www.xiaohongshu.com/explore/6a870f5c000000000600485f" },
  { title: "吐血整理｜最受欢迎中东直播礼物Top1-30", text: "25 赞", tag: "产品图谱", cover: "/notes/latest-5.webp", href: "https://www.xiaohongshu.com/explore/6a85bb9c000000002c005667" },
  { title: "UGC贵族体系也能“玩”？这是我没想到的！", text: "18 赞", tag: "产品观察", cover: "/notes/latest-6.webp", href: "https://www.xiaohongshu.com/explore/6a845e070000000021021d2e" },
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

const matrixCompanies = [
  { company: "映宇宙（映宇宙（北京）科技有限公司）", count: 1, products: ["Nita"], tone: "live" },
  { company: "MiniMax（上海稀宇科技有限公司）", count: 1, products: ["Talkie"], tone: "match" },
  { company: "武汉东晨科技", count: 1, products: ["Ahlan"], tone: "voice" },
  { company: "广州市久邦数码科技有限公司（久邦）", count: 1, products: ["Meete"], tone: "voice" },
  { company: "米连科技", count: 6, products: ["HiFami", "Chatta", "Seeta", "Pookie", "Whispry", "GetsMe"], tone: "voice" },
  { company: "广州元气互动科技有限公司", count: 2, products: ["HATI", "Peach"], tone: "voice" },
  { company: "常相伴（武汉）科技有限公司（伴伴）", count: 5, products: ["伴伴", "Partying", "Party Star", "Veeka", "Hatta"], tone: "voice" },
  { company: "Hacker Interstellar（原明日虫洞）", count: 2, products: ["YoYo", "Votars"], tone: "voice" },
  { company: "深圳市视波信息科技有限公司", count: 5, products: ["Whisper", "Witok", "Golden Ludo", "Weeka（历史）", "Whis-Chat（历史）"], tone: "voice" },
  { company: "深圳市趣虹科技有限公司", count: 4, products: ["Waho", "Magic Clock Launcher", "YOU Weather&Clock", "WhatsApp Series"], tone: "tool" },
  { company: "昆仑万维（昆仑万维科技股份有限公司）", count: 2, products: ["Linky", "StarMaker"], tone: "voice" },
  { company: "腾讯音乐娱乐集团", count: 1, products: ["WeSing（全民K歌）"], tone: "voice" },
  { company: "武汉赴亚", count: 2, products: ["Yaychat", "Oumi"], tone: "voice" },
  { company: "欢聚集团", count: 15, products: ["BIGO LIVE", "BIGO LIVE Lite", "Likee", "imo", "imo Lite", "imo HD", "imo beta", "HAGO", "HelloYo", "Ola Party", "infun", "Saya", "Saya Lite", "Ezpz", "Cube TV"], tone: "live" },
  { company: "上海肯斯爪特科技有限公司", count: 4, products: ["Litmatch", "Litmatch Lite", "oLo", "Nimi"], tone: "match" },
  { company: "雅乐集团", count: 9, products: ["Yalla", "Yalla Lite", "Yalla Ludo", "YallaChat", "Yalla Parchis", "Yalla Baloot & Hand", "101 Okey Yalla", "Yalla Jackaroo", "Jalsat"], tone: "voice" },
  { company: "赤子城科技", count: 9, products: ["MICO", "YoHo", "TopTop", "SUGO", "Blued", "Xena", "SoMatch", "KoKo", "Toki"], tone: "match" },
  { company: "武汉微派", count: 4, products: ["WePlay", "WeParty", "Imposter Online", "Jackaroo King"], tone: "game" },
  { company: "杭州零壹比特科技", count: 1, products: ["Chamet"], tone: "live" },
  { company: "智品科技", count: 9, products: ["Tamam Arabic Keyboard", "Sawa", "Sawa Jawi", "Sawa Play", "Kanka", "FadFad", "Soho 101 Okey", "Tarbi3ah Baloot", "Almoji Keyboard"], tone: "tool" },
  { company: "广州振心", count: 9, products: ["Wyak", "Wyak Lite", "Lama", "Lama Lite", "Lama Ludo", "WeParty", "Fungo", "Hayi", "Yoki"], tone: "voice" },
  { company: "蓝鲲智创", count: 4, products: ["halame", "achat", "chalotalk", "Echo"], tone: "voice" },
  { company: "广州核心互娱", count: 6, products: ["Hawa", "Binmo", "Holm", "Binmo Star", "Binmo Chat", "Soulfree"], tone: "voice" },
  { company: "乐趣无限", count: 7, products: ["4Fun", "4Fun Lite", "Hapi", "Arabic Hapi", "Amo", "Maza", "Hapi Ludo"], tone: "voice" },
  { company: "海豹他趣", count: 2, products: ["Timo", "Timo Club"], tone: "match" },
  { company: "与善网络", count: 2, products: ["Dazz Live", "Dazz X"], tone: "live" },
  { company: "挚文集团", count: 6, products: ["MOMO", "SoulChill", "Yaahlan", "Amar", "Hertz", "mikke LIVE"], tone: "voice" },
  { company: "百易图", count: 3, products: ["JACO", "Beeto", "Hektar"], tone: "match" },
  { company: "怡好青春", count: 9, products: ["StarChat", "Farah", "MagiaChat", "WhatsOkey", "Kalam", "masa", "hilo", "salam", "hoby"], tone: "voice" },
  { company: "小象互娱", count: 1, products: ["Elelive"], tone: "live" },
  { company: "花房集团", count: 4, products: ["HOLLA", "Monkey", "Omega", "Camsea"], tone: "match" },
  { company: "畅指网络", count: 2, products: ["Dino", "Doki"], tone: "match" },
  { company: "汇鲸网络", count: 5, products: ["Ming Live", "Ming Live Pro", "Pio Live", "MetU", "Fcholiv"], tone: "live" },
  { company: "道归道科技", count: 1, products: ["Gami"], tone: "voice" },
  { company: "音果互娱", count: 2, products: ["Falla", "Falla Lite"], tone: "voice" },
  { company: "互乐科技", count: 18, products: ["LightChat", "Miparty", "Lami", "Ligo Live", "Haki", "MiLoop", "Dika", "Olamet", "habbey", "dawa", "domi", "yobi", "miyak", "oohla", "fancy", "kiyo", "wego", "bobbo"], tone: "voice" },
  { company: "迅雷", count: 7, products: ["Hiya", "Hiya Game", "Saada", "WeFun", "FunUp", "Haza", "Hitop"], tone: "game" },
  { company: "舵手互娱", count: 5, products: ["MIGO Live", "PAGO", "PAGO Drama", "Pago Play", "Asha Live"], tone: "live" },
  { company: "广州白檀科技", count: 1, products: ["YOOY"], tone: "voice" },
  { company: "酷麦科技", count: 12, products: ["Wait", "Star", "Junko", "Zaffa Live", "Sodfa", "Waki", "hami party", "tala party", "Tafi", "Hopi", "tabby tami", "Tayyb"], tone: "voice" },
];

const companyLogos: Record<string, string> = {
  "映宇宙（映宇宙（北京）科技有限公司）": "/logos/inke.png",
  "MiniMax（上海稀宇科技有限公司）": "/logos/minimax.png",
  "昆仑万维（昆仑万维科技股份有限公司）": "/logos/kunlun.webp",
  "腾讯音乐娱乐集团": "/logos/tencent-music.webp",
  "欢聚集团": "/logos/joyy.webp",
  "雅乐集团": "/logos/yalla.webp",
  "赤子城科技": "/logos/newborntown.webp",
  "武汉微派": "/logos/weipai.webp",
  "杭州零壹比特科技": "/logos/chamet.png",
  "广州振心": "/logos/wenext.webp",
  "蓝鲲智创": "/logos/lankun.webp",
  "乐趣无限": "/logos/spreadfun.webp",
  "挚文集团": "/logos/hellogroup.webp",
  "花房集团": "/logos/huafang.webp",
  "迅雷": "/logos/xunlei.webp",
  "上海肯斯爪特科技有限公司": "/logos/litmatch.png",
};

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
  const [tab, setTab] = useState<"home" | "analysis" | "matrix" | "talent" | "business">("home");
  const [now, setNow] = useState<Date | null>(null);
  const [admin, setAdmin] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);

  useEffect(() => {
    setNow(new Date());
    fetch("/api/admin/session", { credentials: "same-origin", cache: "no-store" }).then((response) => response.ok ? response.json() : { authenticated: false }).then((data) => setAdmin(Boolean(data.authenticated))).catch(() => undefined);
    const idle = "requestIdleCallback" in window ? window.requestIdleCallback(preloadPublicData) : window.setTimeout(preloadPublicData, 200);
    return () => "cancelIdleCallback" in window ? window.cancelIdleCallback(idle) : window.clearTimeout(idle);
  }, []);

  useEffect(() => {
    if (!communityOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setCommunityOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [communityOpen]);

  const logout = async () => { await fetch("/api/admin/session", { method: "DELETE", credentials: "same-origin" }); setAdmin(false); };

  return (
    <main>
      <header className="nav shell">
        <div className="brand"><button className="brand-home" onClick={() => setTab("home")} aria-label="回到首页"><span>小骆 <small>语聊出海观察</small></span></button><button className="avatar-login" onClick={() => setLoginOpen(true)} aria-label="打开人才市场管理"><img src="/xiaohongshu-avatar.webp" alt="" /></button></div>
        <nav aria-label="主导航">
          <button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}>首页</button>
          <button className={tab === "analysis" ? "active" : ""} onPointerEnter={preloadPublicData} onFocus={preloadPublicData} onClick={() => setTab("analysis")}>公司分析</button>
          <button className={tab === "matrix" ? "active" : ""} onClick={() => setTab("matrix")}>出海矩阵</button>
          <button className={tab === "talent" ? "active" : ""} onPointerEnter={preloadPublicData} onFocus={preloadPublicData} onClick={() => setTab("talent")}>人才市场</button>
          <button className={tab === "business" ? "active" : ""} onClick={() => setTab("business")}>商务合作</button>
        </nav>
      </header>

      {tab === "home" ? <HomeView now={now} /> : tab === "analysis" ? <CompanyAnalysisView admin={admin} /> : tab === "matrix" ? <MatrixView admin={admin} /> : tab === "talent" ? <TalentView admin={admin} onLogout={logout} /> : <BusinessView />}
      {loginOpen && <AdminLogin onClose={() => setLoginOpen(false)} onSuccess={() => { setAdmin(true); setLoginOpen(false); setTab("talent"); }} />}
      <button className="community-fab" type="button" onClick={() => setCommunityOpen(true)} aria-label="打开语聊出海交流群二维码"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a4 4 0 1 0-3.46-6A5 5 0 1 0 8 12c-3.31 0-6 2-6 4.5V19h11v-2.5c0-1.22-.52-2.32-1.38-3.17A7.4 7.4 0 0 1 16 12c3.31 0 6 2 6 4.5V19h-7v-2.5c0-1.25-.42-2.41-1.14-3.4A5.9 5.9 0 0 0 11.5 12 5 5 0 0 0 16 11Z" /></svg></button>
      {communityOpen && <div className="community-modal" role="dialog" aria-modal="true" aria-labelledby="community-dialog-title" onClick={(event) => { if (event.target === event.currentTarget) setCommunityOpen(false); }}><section><header className="community-modal-header"><p>交流群 <span>/ COMMUNITY</span></p><button type="button" autoFocus onClick={() => setCommunityOpen(false)} aria-label="关闭社群二维码">×</button></header><div className="community-modal-body"><article className="community-qr-card"><h2 id="community-dialog-title">群聊：小骆 🐫 语聊出海交流 2 群</h2><img src="/community-qr.jpg" alt="小骆语聊出海交流 2 群二维码" /><p>该二维码 9 月 11 日前有效</p><a className="community-save" href="/community-qr.jpg" download="xiaoluo-community-qr.jpg" aria-label="保存小骆语聊出海交流 2 群二维码"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14" /></svg>保存二维码</a></article></div></section></div>}
    </main>
  );
}

function HomeView({ now }: { now: Date | null }) {
  const [visitorStats, setVisitorStats] = useState<{ total: number; today: number } | null>(null);

  useEffect(() => {
    fetch("/api/visitors", { method: "POST", cache: "no-store", credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("visitor counter unavailable")))
      .then((data) => {
        if (typeof data?.total === "number" && typeof data?.today === "number") setVisitorStats(data);
      })
      .catch(() => undefined);
  }, []);

  return <div className="home-theme">
    <section className="hero shell">
      <div className="hero-copy">
        <p className="today"><span className="today-label">● 小红书笔记更新</span><time>{now ? new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(now) : "正在读取时间"}</time></p>
        <h1>聚焦中东社交与海外语聊</h1>
        <p className="lead">把产品、增长与商业化的变化，整理成可用判断。</p>
        <div className="hero-actions"><a className="primary" href="https://www.xiaohongshu.com/user/profile/6a559ddd000000000e03d001" target="_blank" rel="noreferrer">进入小红书主页 ↗</a><button className="text-button" onClick={() => document.getElementById("notes")?.scrollIntoView({ behavior: "smooth" })}>浏览最新笔记 ↓</button></div>
      </div>
      <aside className="hero-visual" aria-label="小骆形象图"><img src="/xiaohongshu-avatar.webp" alt="小骆形象" fetchPriority="high" decoding="async" /><span>Social product intelligence</span></aside>
    </section>

    <section className="visitor-strip shell" aria-label="网站与账号数据"><div><b>{visitorStats ? visitorStats.total.toLocaleString("zh-CN") : "—"}</b><span>累计访问</span></div><div><b>{visitorStats ? visitorStats.today.toLocaleString("zh-CN") : "—"}</b><span>今日访问</span></div><div><b>480</b><span>微信群人数</span></div><div><b>850</b><span>红书群人数</span></div><div><b>1230</b><span>小红书粉丝</span></div></section>

    <section className="section shell" id="notes"><div className="section-top"><div><p className="eyebrow">LATEST NOTES</p><h2>最近的笔记</h2></div><a href="https://www.xiaohongshu.com/user/profile/6a559ddd000000000e03d001" target="_blank" rel="noreferrer">小红书查看全部 ↗</a></div><div className="notes notes-list">{notes.slice(0, 3).map((note) => <article className="note note-list-item" key={note.title}><a className="note-cover-link" href={note.href} target="_blank" rel="noreferrer"><img className="note-cover" src={note.cover} alt={`${note.title} 封面`} loading="lazy" /></a><div className="note-content"><span>{note.tag}</span><h3>{note.title}</h3><p>{note.text}</p><a href={note.href} target="_blank" rel="noreferrer">查看笔记 <b>↗</b></a></div></article>)}</div></section>

    <section className="practical-tools shell" aria-labelledby="practical-tools-title"><div className="section-top"><div><p className="eyebrow">PRACTICAL TOOLS</p><h2 id="practical-tools-title">实用工具</h2></div></div><div className="practical-tools-list"><a className="practical-tool-card" href="https://immersivetranslate.com/zh-Hans/" target="_blank" rel="noreferrer"><img className="practical-tool-logo" src="https://immersivetranslate.com/_next/static/media/logo.761c1cd1.png" alt="沉浸式翻译 Logo" loading="lazy" /><div><span>翻译 / 阅读工具</span><h3>沉浸式翻译</h3><p>网页双语对照与沉浸式阅读，适合检索海外产品信息和资料。</p></div><div className="practical-tool-footer"><small>推荐人：盖伦</small><b>访问工具 ↗</b></div></a><a className="practical-tool-card" href="https://vibe-hub.org/topics/product" target="_blank" rel="noreferrer"><img className="practical-tool-logo" src="https://vibe-hub.org/icon.png" alt="VibeHub Logo" loading="lazy" /><div><span>产品 / Vibe Coding</span><h3>VibeHub 产品术语</h3><p>用可视化图解理解产品概念、使用场景与边界，更准确地向 AI 表达需求。</p></div><div className="practical-tool-footer"><small>推荐人：小骆</small><b>访问工具 ↗</b></div></a></div></section>

    <section className="proof shell"><div className="proof-heading"><p className="eyebrow">CORE STRENGTHS</p><h2>我的核心优势，<br /><em>来自一线的长期积累。</em></h2><p>研究、内容与资源连接并不是孤立的服务，而是在出海社交行业中持续观察、核验与沉淀下来的工作方法。</p></div><div className="proof-grid">{credibilityModules.map((module) => <article key={module.no}><span>{module.no}</span><h3>{module.title}</h3><p>{module.intro}</p><ul>{module.items.map((item) => <li key={item}>{item}</li>)}</ul></article>)}</div></section>

    <section className="contact shell"><div className="qr"><img className="qr-code" src="/wechat-qr.webp" alt="小骆的微信二维码" loading="lazy" decoding="async" /><p>扫码加微信<br />备注「小骆」</p></div><div><p className="eyebrow">SAY HELLO</p><h2>有一个值得聊的<br /><em>社交产品问题？</em></h2><p>合作、访谈、内容共创，或者只是想交换一个判断，都欢迎来找我。</p></div></section>
    <footer className="shell"><span>© 2026 小骆 / SOCIAL INTELLIGENCE</span><a href="https://www.xiaohongshu.com/user/profile/6a559ddd000000000e03d001" target="_blank" rel="noreferrer">小红书 ↗</a></footer>
  </div>;
}

function NetworkView() {
  return <>
    <section className="network-hero shell"><div className="network-copy"><p className="eyebrow">THE NETWORK</p><h1>不是通讯录，<br />是<strong>能一起推进事情的人。</strong></h1><p>资源网络服务于真实的问题与具体合作。数字会持续更新，连接要有边界也要有诚意。</p><div className="network-total"><b>560<span>+</span></b><small>可触达的社交产品从业者</small></div></div><aside className="network-qr"><img src="/wechat-qr.webp" alt="小骆微信二维码，扫码加入行业交流群" decoding="async" /><b>欢迎加群交流</b><p>扫码添加微信<br />备注「加群」</p></aside></section>
    <section className="section shell"><div className="section-top"><div><p className="eyebrow">WHO IS IN THE ROOM</p><h2>资源分布</h2></div><p className="muted">覆盖产品增长与基础服务环节 · 人数持续更新</p></div><div className="resource-grid">{resourceGroups.map((group) => <article key={group.title}><div className="resource-group-head"><h3>{group.title}</h3>{group.number && <b>{group.number}</b>}</div><p>{group.text}</p><div>{group.tags.map((tag) => <i key={tag}>{tag}</i>)}</div></article>)}</div></section>
    <section className="network-contacts shell"><div><p className="eyebrow">PEOPLE NETWORK</p><h2>可触达的人脉网络</h2><p>来自社群与长期行业交流的可触达圈层。为保护隐私，不公开名称与联系方式；头像仅作视觉示意。</p></div><div className="network-face-grid" aria-label="人脉网络示意">{networkPortraits.map((src) => <img key={src} src={src} alt="" aria-hidden="true" loading="lazy" />)}</div></section>
    <footer className="shell"><span>© 2026 小骆 / SOCIAL INTELLIGENCE</span><button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>回到顶部 ↑</button></footer>
  </>;
}

function PageHeader({ eyebrow, title, description, aside }: { eyebrow: string; title: string; description: string; aside?: ReactNode }) {
  return <header className="page-header shell"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{aside && <aside>{aside}</aside>}</header>;
}

function BusinessView() {
  const services = [
    ["01", "广告合作", "面向出海社交、语聊、直播与泛娱乐品牌，提供与行业读者相匹配的广告展示与专题传播。", ["品牌露出", "专题内容", "资源页推荐"]],
    ["02", "品牌宣传", "将产品、团队或新市场动作梳理为可信、易读的行业表达，适合新品发布、招聘和品牌认知建设。", ["品牌故事", "产品观察", "招聘宣传"]],
    ["03", "内容共创", "围绕产品、增长、运营和海外市场，共同完成有行业价值的内容，不做生硬植入。", ["访谈", "案例拆解", "圆桌与直播"]],
    ["04", "研究与交流", "围绕产品图谱与行业观察，也可发起定向研究或小范围讨论。", ["定向研究", "行业交流", "闭门讨论"]],
  ];
  return <>
    <PageHeader eyebrow="BUSINESS COLLABORATION" title="商务合作" description="广告宣传、内容共创、资源连接与行业交流。先说清问题，再判断是否值得合作。" />
    <section className="business-links shell"><div className="business-link-head"><h2>合作链接 <span>展示与出海社交行业相关的产品与服务。</span></h2></div><div className="business-link-grid"><article className="featured-link"><div className="featured-link-main"><p className="eyebrow">PARTNER LINK · 01</p><h3 className="partner-company-title"><img src="/partners/jishun-animation.png" alt="极瞬动画 Logo" />极瞬动画有限公司</h3><p>成品直播礼物，承接各类定制设计。欢迎了解直播互动礼物与视觉内容合作方案。</p><a href="https://www.jsgift.top/" target="_blank" rel="noreferrer">访问 jsgift.top ↗</a></div><aside className="featured-link-details"><span>服务范围</span><strong>直播互动<br />视觉内容</strong><div><i>成品礼物</i><i>定制设计</i><i>动画制作</i></div><small>适合语聊、直播与泛娱乐产品的活动与日常运营场景。</small></aside></article></div></section>
    <section className="business-resources shell"><div className="business-resource-head"><div><p className="eyebrow">COLLABORATION RESOURCES</p><h2>合作资源</h2><p>覆盖产品、运营、市场与基础服务，按具体问题匹配合适的连接。</p></div><p>按明确需求做定向连接，不公开个人信息。</p></div><div className="business-resource-list">{resourceGroups.map((group) => <article key={group.title}><div className="business-resource-title"><h3>{group.title}</h3>{group.number && <b>{group.number}</b>}</div><p>{group.text}</p><div>{group.tags.map((tag) => <i key={tag}>{tag}</i>)}</div></article>)}</div></section>
    <section className="business-services shell"><div className="section-top business-title"><div><p className="eyebrow">SERVICE OPTIONS</p><h2>合作方式</h2></div><p className="muted">可按目标、周期与预算组合，不承诺脱离内容质量的曝光。</p></div><div className="business-grid">{services.map(([number, title, text, tags]) => <article key={title}><span>{number}</span><h3>{title}</h3><p>{text}</p><div>{tags.map((tag) => <i key={tag}>{tag}</i>)}</div></article>)}</div></section>
    <section className="business-contact shell"><div><p className="eyebrow">LET'S TALK</p><h2>说清你的目标，<br /><em>聊聊合作可能。</em></h2><p>来信时请附上品牌 / 产品、希望达成的目标、目标市场与预计时间，我会尽快回复适合的合作方式。</p><a className="email-link" href="mailto:xiaoluowork@gmail.com">xiaoluowork@gmail.com ↗</a></div><div className="business-qr"><img src="/wechat-qr.webp" alt="小骆商务合作微信二维码" loading="lazy" decoding="async" /><div><b>微信咨询</b><p>扫码添加微信<br />备注「商务合作」</p></div></div></section>
    <footer className="shell"><span>© 2026 小骆 / BUSINESS COLLABORATION</span><a href="mailto:xiaoluowork@gmail.com">xiaoluowork@gmail.com ↗</a></footer>
  </>;
}

function CompanyAnalysisView({ admin }: { admin: boolean }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [articles, setArticles] = useState<Array<{ slug: string; title: string; company: string; category: string; summary: string; tags: string[]; publishedAt: string; updatedAt: string; views: number }>>([]);
  useEffect(() => { loadArticles().then((data) => setArticles((data.items || []) as typeof articles)).catch(() => undefined); }, []);
  const normalizedQuery = query.trim().toLowerCase();
  const shownAnalyses = articles.filter((item) => !normalizedQuery || [item.company, item.title, item.summary, ...item.tags].join(" ").toLowerCase().includes(normalizedQuery));
  const pageCount = Math.max(1, Math.ceil(shownAnalyses.length / ANALYSIS_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageAnalyses = shownAnalyses.slice((currentPage - 1) * ANALYSIS_PAGE_SIZE, currentPage * ANALYSIS_PAGE_SIZE);
  const warmArticle = (item: typeof articles[number]) => { prefetchArticleRoute(item.slug); void prefetchArticle(item.slug, item.updatedAt).catch(() => undefined); };
  useEffect(() => {
    if (!pageAnalyses.length) return;
    const warm = () => pageAnalyses.forEach(warmArticle);
    const idle = "requestIdleCallback" in window ? window.requestIdleCallback(warm) : window.setTimeout(warm, 200);
    return () => "cancelIdleCallback" in window ? window.cancelIdleCallback(idle) : window.clearTimeout(idle);
  }, [articles, currentPage, normalizedQuery]);
  return <>
    <PageHeader eyebrow="RESEARCH ARCHIVE" title="最新公司分析" description="持续更新，不以转载替代核验。" aside={admin && <a className="primary analysis-publish-link" href="/admin">发布文章 →</a>} />
    <section className="analysis-section shell"><label className="analysis-search"><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="例如：欢聚、Yalla、语聊、商业化" aria-label="搜索公司分析" /><b>{shownAnalyses.length} 篇</b></label><div className="analysis-list">{pageAnalyses.map((item) => <article key={item.slug}><a className="analysis-card-link" href={`/analysis/${item.slug}`} onPointerEnter={() => warmArticle(item)} onFocus={() => warmArticle(item)} onTouchStart={() => warmArticle(item)}><div className="analysis-card-top"><span>{item.category} · {item.company}</span><span>by 小骆 · {new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(item.publishedAt))}</span></div><h2>{item.title}</h2><p>{item.summary}</p><div>{item.tags.map((tag) => <i key={tag}>{tag}</i>)}</div><div className="analysis-card-footer"><span className="analysis-more">阅读全文 →</span><span className="analysis-views">阅读 {item.views}</span></div></a></article>)}</div>{pageCount > 1 && <nav className="analysis-pagination" aria-label="公司分析分页"><button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}>上一页</button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button type="button" key={pageNumber} className={pageNumber === currentPage ? "is-active" : undefined} aria-current={pageNumber === currentPage ? "page" : undefined} onClick={() => setPage(pageNumber)}>{pageNumber}</button>)}<button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage === pageCount}>下一页</button></nav>}{shownAnalyses.length === 0 && <div className="analysis-empty">{articles.length ? "没有匹配内容，换一个关键词试试。" : "还没有已发布的公司分析。"}</div>}</section>
    <footer className="shell"><span>© 2026 小骆 / COMPANY RESEARCH</span><button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>回到顶部 ↑</button></footer>
  </>;
}

type MatrixRecord = { id: string; company: string; products: string[]; category: string; logoUrl: string; note: string; sourceCompany: string; deleted: boolean };
type MatrixEntry = MatrixRecord & { tone: string; isBuiltIn: boolean };
const builtInMatrixId = (company: string) => `atlas:${company}`;

function MatrixView({ admin }: { admin: boolean }) {
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<MatrixRecord[]>([]);
  const [editor, setEditor] = useState<MatrixEntry | null>(null);
  const load = async () => { const response = await fetch("/api/matrix", { cache: "no-store" }); if (response.ok) setRecords((await response.json()).items || []); };
  useEffect(() => { void load(); }, []);
  const overrides = new Map(records.filter((record) => record.sourceCompany).map((record) => [record.sourceCompany, record]));
  const builtIns = matrixCompanies.map((item) => {
    const override = overrides.get(item.company);
    return { id: override?.id || builtInMatrixId(item.company), company: override?.company || item.company, products: override?.products || item.products, category: override?.category || item.tone, logoUrl: override?.logoUrl || companyLogos[item.company] || "", note: override?.note || companyEntityNotes[item.company] || "", sourceCompany: item.company, deleted: override?.deleted || false, tone: override?.category || item.tone, isBuiltIn: true };
  }).filter((item) => !item.deleted);
  const additions = records.filter((record) => !record.sourceCompany && !record.deleted).map((record) => ({ ...record, tone: record.category, isBuiltIn: false }));
  const companies = [...builtIns, ...additions];
  const shownCompanies = companies.filter((item) => !query.trim() || [item.company, ...item.products].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const remove = async (item: MatrixEntry) => {
    if (!confirm(`确定删除「${item.company}」吗？`)) return;
    const override = records.find((record) => record.sourceCompany === item.sourceCompany);
    const body = item.isBuiltIn ? { company: item.company, products: item.products, category: item.category, note: item.note, sourceCompany: item.sourceCompany, deleted: true } : undefined;
    const endpoint = item.isBuiltIn ? (override ? `/api/article-admin/matrix/${override.id}` : "/api/article-admin/matrix") : `/api/article-admin/matrix/${item.id}`;
    const method = item.isBuiltIn ? (override ? "PATCH" : "POST") : "DELETE";
    const response = await fetch(endpoint, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    if (!response.ok) alert("删除失败，请稍后重试。"); else await load();
  };
  return <>
    <PageHeader eyebrow="PRODUCT ATLAS" title="出海产品矩阵" description={`收录 ${companies.length} 个公司 / 团队、${companies.reduce((sum, item) => sum + item.products.length, 0)} 款产品，归属与状态持续核验。`} aside={admin && <button className="primary matrix-publish-button" onClick={() => setEditor({ id: "", company: "", products: [], category: "voice", logoUrl: "", note: "", sourceCompany: "", deleted: false, tone: "voice", isBuiltIn: false })}>发布公司 ＋</button>} />
    <section className="matrix-section shell"><label className="matrix-search"><span>搜索公司或产品</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：Yalla、Litmatch、BIGO" /><b>{shownCompanies.length} 条结果</b></label>{shownCompanies.length ? <div className="matrix-grid">{shownCompanies.map((item) => <article className="company-card" key={item.id}><div className="company-title"><h3>{item.logoUrl && <img className="company-logo-image" src={item.logoUrl} alt={`${item.company} logo`} />}{item.company}</h3><b>{item.products.length}<small> 款产品</small></b></div><div className="product-tags">{item.products.map((product, index) => <i className={`${item.tone}-${index % 4}`} key={product}>{product}</i>)}</div>{item.note && <p className="company-entity-note">{item.note}</p>}<footer><span>来源：小骆产品图谱</span>{admin ? <span className="matrix-admin-actions"><button onClick={() => setEditor(item)}>编辑</button><button className="danger" onClick={() => void remove(item)}>删除</button></span> : <button>查看档案 →</button>}</footer></article>)}</div> : <div className="matrix-empty">没有匹配结果，试试公司名或任一产品名。</div>}</section>
    <section className="matrix-callout shell"><div><p className="eyebrow">CONTRIBUTE TO THE ATLAS</p><h2>这张图谱，<br />应该由行业一起补全。</h2></div><div><p>欢迎提交公司与产品线索，审核后会补充到图谱。每家公司将持续核验归属、产品时间线、商店链接与核心市场。</p></div></section>
    {editor && <MatrixEditor initial={editor} onClose={() => setEditor(null)} onSaved={async () => { setEditor(null); await load(); }} />}
    <footer className="shell"><span>© 2026 小骆 / PRODUCT ATLAS</span><button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>回到顶部 ↑</button></footer>
  </>;
}

function MatrixEditor({ initial, onClose, onSaved }: { initial: MatrixEntry; onClose: () => void; onSaved: () => void }) {
  const [company, setCompany] = useState(initial.company); const [products, setProducts] = useState(initial.products.join("、")); const [note, setNote] = useState(initial.note); const [logo, setLogo] = useState(""); const [preview, setPreview] = useState(initial.logoUrl); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const selectLogo = async (file?: File) => { if (!file) return; setError(""); try { const output = await compressMatrixLogo(file); setLogo(output.data); setPreview(output.url); } catch (cause) { setError(cause instanceof Error ? cause.message : "公司 Logo 处理失败。"); } };
  const persisted = initial.isBuiltIn && initial.id !== builtInMatrixId(initial.sourceCompany);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); setError(""); const payload = { company, products: products.split(/[、,，]/).map((item) => item.trim()).filter(Boolean), category: initial.category || "voice", note, logo, sourceCompany: initial.sourceCompany }; try { const response = await fetch(initial.id && (!initial.isBuiltIn || persisted) ? `/api/article-admin/matrix/${initial.id}` : "/api/article-admin/matrix", { method: initial.id && (!initial.isBuiltIn || persisted) ? "PATCH" : "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "发布失败，请稍后重试。"); onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : "发布失败，请稍后重试。"); } finally { setSaving(false); } };
  return <div className="matrix-submit-modal" role="dialog" aria-modal="true" aria-label="发布公司" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="matrix-submit-dialog matrix-company-editor" onSubmit={(event) => void submit(event)}><div className="matrix-submit-top"><div><p className="eyebrow">PRODUCT ATLAS ADMIN</p><h2>{initial.id ? "编辑公司" : "发布公司"}</h2></div><button className="matrix-submit-close" type="button" onClick={onClose} aria-label="关闭">×</button></div><label>公司 / 团队名称<input autoFocus required value={company} onChange={(event) => setCompany(event.target.value)} placeholder="例如：某某科技有限公司" /></label><label>产品名称<textarea required value={products} onChange={(event) => setProducts(event.target.value)} placeholder="多个产品用顿号或逗号分隔" /></label><label>公司说明（可选）<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：归属或产品状态说明" /></label><label>公司 Logo（PNG、JPG、WebP）<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void selectLogo(event.target.files?.[0])} /><small>支持横版、竖版和方形 Logo，上传后按原比例转换为 WebP。</small></label>{preview && <img className="matrix-logo-preview" src={preview} alt="公司 Logo 预览" />}{error && <p className="matrix-submit-error">{error}</p>}<div className="matrix-submit-actions"><button type="button" onClick={onClose}>取消</button><button className="primary" type="submit" disabled={saving}>{saving ? "正在保存…" : initial.id ? "保存修改" : "发布公司"}</button></div></form></div>;
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
  return <div className="admin-login-modal" role="dialog" aria-modal="true" aria-label="后台管理登录"><form className="admin-login-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}><div><p className="eyebrow">SITE ADMIN</p><h2>后台管理</h2><p>登录后可管理人才市场，并审核图谱补充。</p></div><label>账号<input autoFocus value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label><label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>{error && <p className="admin-login-error">{error}</p>}<div><button type="button" onClick={onClose} disabled={loading}>取消</button><button className="primary" type="submit" disabled={loading}>{loading ? "正在登录…" : "登录管理"}</button></div></form></div>;
}

function TalentView({ admin, onLogout }: { admin: boolean; onLogout: () => Promise<void> }) {
  type MatrixSubmission = { id: string; company: string; products: string; status: "pending" | "reviewed"; createdAt: string };
  const [mode, setMode] = useState<"jobs" | "people">("jobs");
  const [city, setCity] = useState("全部地点");
  const [role, setRole] = useState("全部岗位");
  const [jobs, setJobs] = useState<Array<typeof jobListings[number] & { id?: string }>>([]);
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
        const image = job.imageUrl ? document.createElement("img") : null; if (image) { image.className = "job-detail-image"; image.src = job.imageUrl; image.alt = `${job.company} 招聘图片`; image.loading = "lazy"; }
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
        const image = job.imageUrl ? document.createElement("img") : null; if (image) { image.className = "job-detail-image"; image.src = job.imageUrl; image.alt = `${job.company} 招聘图片`; image.loading = "lazy"; }
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
    document.querySelectorAll<HTMLElement>(".boss-direct-badge").forEach((badge) => {
      badge.replaceChildren();
      const avatar = document.createElement("img"); avatar.src = "/xiaohongshu-avatar.webp"; avatar.alt = "";
      const label = document.createElement("span"); label.textContent = "小骆力荐";
      badge.append(avatar, label);
    });
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
      if (payload.kind === "jobs") { const item = { ...payload, ...data.item, id: String(data.item?.id || editing.id || ""), mark: payload.company.slice(0, 2).toUpperCase() }; setJobs((current) => editing.id ? current.map((entry) => entry.id === editing.id ? item : entry) : [item, ...current]); } else { const item = { ...payload, ...data.item, id: String(data.item?.id || editing.id || "") }; setPeople((current) => editing.id ? current.map((entry) => entry.id === editing.id ? item : entry) : [item, ...current]); }
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
    <PageHeader eyebrow="TALENT MARKET" title="人才市场" description="面向出海社交、语聊、直播与泛娱乐团队，按地点与职能筛选岗位和人才。" />
    {admin && <div className="talent-admin shell"><span>后台管理已登录</span><b>可审核图谱补充，并管理人才市场</b><button onClick={() => void onLogout()}>退出管理</button></div>}
    <section className="talent-section shell"><div className="talent-toolbar"><div className="talent-switch" role="tablist" aria-label="人才市场模式"><button className={mode === "jobs" ? "selected" : ""} onClick={() => setMode("jobs")}>正在招聘 <span>{jobs.length}</span></button><button className={mode === "people" ? "selected" : ""} onClick={() => setMode("people")}>开放求职 <span>{people.length}</span></button></div>{admin && <button className="primary publish-talent" onClick={() => openPublish()}>发布信息 ＋</button>}</div><div className="filters"><label>地点<select value={city} onChange={(event) => setCity(event.target.value)}>{cities.map((value) => <option key={value}>{value}</option>)}</select></label><label>岗位<select value={role} onChange={(event) => setRole(event.target.value)}>{roles.map((value) => <option key={value}>{value}</option>)}</select></label><span>{syncState === "loading" ? "正在同步…" : syncState === "error" ? "同步暂不可用" : mode === "jobs" ? `${shownJobs.length} 个匹配岗位` : `${people.length} 位开放人才`}</span></div>{syncState !== "ready" && <p className={`talent-sync-message ${syncState}`}>{syncState === "loading" ? "正在读取全站共享的人才信息…" : syncError}</p>}
      {mode === "jobs" ? shownJobs.length ? <div className="job-grid">{shownJobs.map((job) => <article className="job-card" key={job.id || `${job.company}-${job.title}`}>{job.bossDirect && <span className="boss-direct-badge">Boss直推</span>}<h2>{job.company}</h2><h3>{job.title}</h3><div className="job-meta"><span>{job.city}</span><span>{job.type}</span><span>{job.level}</span></div><p>{job.description || job.focus}</p>{job.contact && <small className="listing-contact">联系方式：{job.contact}</small>}{admin && <div className="listing-admin-actions"><button onClick={() => openEdit("jobs", job)}>编辑</button><button onClick={() => void removeListing(job.id)}>删除</button></div>}</article>)}</div> : <EmptyTalentState title={city === "全部地点" && role === "全部岗位" ? "还没有招聘信息" : "没有符合筛选条件的岗位"} text={city === "全部地点" && role === "全部岗位" ? "首条招聘信息将从这里开始。" : "换一个地点或岗位试试。"} action={admin ? "发布招聘信息" : undefined} onClick={admin ? () => openPublish("jobs") : undefined} /> : people.length ? <div className="talent-grid">{people.map((person, index) => <article className="talent-card" key={person.id || `${person.title}-${index}`}><div className="talent-avatar">{String(index + 1).padStart(2, "0")}</div><div><span>开放求职</span><h2>{person.title}</h2><p>{person.city} · {person.exp}经验</p></div><div className="talent-tags">{person.tags.map((tag) => <i key={tag}>{tag}</i>)}</div><p className="talent-note">{person.note}</p>{person.contact && <small className="listing-contact">联系方式：{person.contact}</small>}{admin && <div className="listing-admin-actions"><button onClick={() => openEdit("people", person)}>编辑</button><button onClick={() => void removeListing(person.id)}>删除</button></div>}</article>)}</div> : <EmptyTalentState title="还没有开放求职信息" text="发布你的方向、地点与经验，让合适的机会找到你。" action={admin ? "发布求职信息" : undefined} onClick={admin ? () => openPublish("people") : undefined} />}</section>
    {admin && <section className="talent-callout shell"><div><p className="eyebrow">POST OR JOIN</p><h2>把正在寻找的，<br />说得更具体。</h2></div><div><p>招聘方可提交岗位；求职者可展示方向、地点和经验。发布后会在人才市场公开展示，所有浏览器都能看到。</p><button className="primary" onClick={() => openPublish()}>发布一条信息 →</button></div></section>}
    {editing && <div className="talent-modal" role="dialog" aria-modal="true" aria-label="发布人才信息"><form className="talent-form" onSubmit={(event) => { event.preventDefault(); void saveDraft(); }}><div className="talent-form-top"><div><p className="eyebrow">TALENT MARKET</p><h2>发布信息</h2></div><button type="button" onClick={() => setEditing(null)} aria-label="关闭">×</button></div><label>信息类型<select value={draft.kind} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as "jobs" | "people" }))}><option value="jobs">正在招聘</option><option value="people">开放求职</option></select></label>{draft.kind === "jobs" && <><label>公司名称<input value={draft.company} required onChange={(event) => setDraft((current) => ({ ...current, company: event.target.value }))} placeholder="例如：极瞬动画" /></label><label>岗位名称<input value={draft.title} required onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="例如：海外产品经理" /></label></>}{draft.kind === "people" && <label>目标岗位<input value={draft.title} required onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="例如：海外增长运营" /></label>}<div className="form-columns"><label>地点<input value={draft.city} onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))} placeholder="Dubai" /></label>{draft.kind === "jobs" ? <label>职能<input value={draft.focus} onChange={(event) => setDraft((current) => ({ ...current, focus: event.target.value }))} placeholder="产品" /></label> : <label>经验<input value={draft.exp} onChange={(event) => setDraft((current) => ({ ...current, exp: event.target.value }))} placeholder="3 年" /></label>}</div>{draft.kind === "jobs" ? <><div className="form-columns"><label>工作形式<input value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))} placeholder="全职" /></label><label>经验要求<input value={draft.level} onChange={(event) => setDraft((current) => ({ ...current, level: event.target.value }))} placeholder="1–3 年" /></label></div><label>岗位内容<textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="简要说明职责、团队或任职要求" /></label></> : <><label>标签（用顿号或逗号分隔）<input value={draft.tags} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} placeholder="语聊、增长、中东" /></label><label>补充说明<textarea value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} placeholder="说明你的方向或希望寻找的机会" /></label></>}<label>联系方式<input value={draft.contact} onChange={(event) => setDraft((current) => ({ ...current, contact: event.target.value }))} placeholder="微信、邮箱或职位链接" /></label>{admin && draft.kind === "jobs" && <label className="boss-direct-toggle"><input type="checkbox" checked={draft.bossDirect} onChange={(event) => setDraft((current) => ({ ...current, bossDirect: event.target.checked }))} /><span><b>Boss直推</b><small>仅用于可由老板或直属负责人直接沟通的岗位。</small></span></label>}<div className="talent-form-actions"><button type="button" onClick={() => setEditing(null)} disabled={saving}>取消</button><button className="primary" type="submit" disabled={saving}>{saving ? "正在发布…" : "发布并同步"}</button></div></form></div>}
    <footer className="shell"><span>© 2026 小骆 / TALENT MARKET</span><button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>回到顶部 ↑</button></footer>
  </>;
}

function EmptyTalentState({ title, text, action, onClick }: { title: string; text: string; action?: string; onClick?: () => void }) {
  return <div className="talent-empty"><p className="eyebrow">TALENT MARKET</p><h2>{title}</h2><p>{text}</p>{action && onClick && <button className="primary" onClick={onClick}>{action} ＋</button>}</div>;
}
