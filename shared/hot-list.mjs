import { XMLParser, XMLValidator } from "fast-xml-parser";
import { reviewedTitleZh } from "./hot-translations.mjs";

// Only the trusted snapshot reader can attach this in-memory marker. Remote
// feed JSON cannot manufacture it; it never serializes into public responses.
export const PREVIOUSLY_REVIEWED_EVENT = Symbol("previously-reviewed-hot-event");

// Publisher-owned feeds and official public news indexes. These are discovery
// sources, not permission to reproduce articles; expose titles and original links.
// App IDs are pinned to the publishers' own store listings. Store descriptions
// are never treated as release notes or as evidence of a recent product change.
export const HOT_FEEDS = Object.freeze([
  { id: "yalla", name: "Yalla Group", url: "https://ir.yalla.com/News-Releases?pagetemplate=rss", kind: "official", owner: "yalla", hosts: ["ir.yalla.com"] },
  { id: "joyy-ir", name: "JOYY 投资者关系", url: "https://ir.joyy.com/rss/news-releases.xml?items=15", displayUrl: "https://ir.joyy.com/press-releases", kind: "official", owner: "joyy", hosts: ["ir.joyy.com"], maxBytes: 512 * 1024 },
  // The company's own press releases distributed by GlobeNewswire are still
  // JOYY's statements, not an additional independent publisher. Pin both its
  // organization index and release organization ID; do not crawl wire search.
  { id: "joyy-wire", name: "JOYY 官方新闻稿", url: "https://www.globenewswire.com/search/organization/joyy%2520inc%C2%A7", format: "globe-company-html", kind: "official", owner: "joyy", hosts: ["www.globenewswire.com"], releaseOrganizationId: "23553", maxBytes: 192 * 1024 },
  { id: "bigo-news", name: "BIGO LIVE 官方新闻", url: "https://www.bigo.tv/news-events/bigo-news", format: "bigo-html", kind: "official", owner: "joyy", hosts: ["www.bigo.tv", "bigo.tv"], maxBytes: 384 * 1024 },
  { id: "newborn-ir", name: "赤子城科技投资者关系", url: "https://internal.beijingqianji.com/api/newborntown/getList?lan=EN", displayUrl: "https://ir.newborntown.com/", format: "newborn-json", kind: "official", owner: "newborn-town", hosts: ["www1.hkexnews.hk"], feedHosts: ["internal.beijingqianji.com"], maxBytes: 512 * 1024 },
  { id: "newborn-news", name: "赤子城科技新闻中心", url: "https://group.beijingqianji.com/api/newborntown/getNewsCenterList?page=1&pageSize=100&lan=hk", displayUrl: "https://www.newborntown.com/news?lang=zh", format: "newborn-news-json", kind: "official", owner: "newborn-town", hosts: ["www.newborntown.com"], feedHosts: ["group.beijingqianji.com"] },
  { id: "bigo-app-store", name: "BIGO LIVE · App Store", url: "https://itunes.apple.com/lookup?id=1077137248&country=us", displayUrl: "https://apps.apple.com/us/app/id1077137248", format: "apple-lookup", kind: "official", owner: "joyy", productTopic: "BIGO LIVE", appId: 1077137248, appName: /^BIGO\s*LIVE\b/i, hosts: ["apps.apple.com"], feedHosts: ["itunes.apple.com"], maxBytes: 256 * 1024 },
  { id: "yalla-app-store", name: "Yalla · App Store", url: "https://itunes.apple.com/lookup?id=1091902866&country=us", displayUrl: "https://apps.apple.com/us/app/id1091902866", format: "apple-lookup", kind: "official", owner: "yalla", productTopic: "Yalla", appId: 1091902866, appName: /^Yalla\s*[-–:]/i, hosts: ["apps.apple.com"], feedHosts: ["itunes.apple.com"], maxBytes: 256 * 1024 },
  { id: "mico-app-store", name: "MICO · App Store", url: "https://itunes.apple.com/lookup?id=908023218&country=us", displayUrl: "https://apps.apple.com/us/app/id908023218", format: "apple-lookup", kind: "official", owner: "newborn-town", productTopic: "MICO", appId: 908023218, appName: /^MICO\s*[-–:]/i, hosts: ["apps.apple.com"], feedHosts: ["itunes.apple.com"], maxBytes: 256 * 1024 },
  { id: "yoho-app-store", name: "YoHo · App Store", url: "https://itunes.apple.com/lookup?id=1509635224&country=us", displayUrl: "https://apps.apple.com/us/app/id1509635224", format: "apple-lookup", kind: "official", owner: "newborn-town", productTopic: "YoHo", appId: 1509635224, appName: /^YoHo\s*[-–:]/i, hosts: ["apps.apple.com"], feedHosts: ["itunes.apple.com"], maxBytes: 256 * 1024 },
  { id: "toptop-app-store", name: "TopTop · App Store", url: "https://itunes.apple.com/lookup?id=1475867504&country=us", displayUrl: "https://apps.apple.com/us/app/id1475867504", format: "apple-lookup", kind: "official", owner: "newborn-town", productTopic: "TopTop", appId: 1475867504, appName: /^TopTop\s*[-–:]/i, hosts: ["apps.apple.com"], feedHosts: ["itunes.apple.com"], maxBytes: 256 * 1024 },
  { id: "sugo-app-store", name: "SUGO · App Store", url: "https://itunes.apple.com/lookup?id=1574436604&country=us", displayUrl: "https://apps.apple.com/us/app/id1574436604", format: "apple-lookup", kind: "official", owner: "newborn-town", productTopic: "SUGO", appId: 1574436604, appName: /^SUGO\s*[-–:]/i, hosts: ["apps.apple.com"], feedHosts: ["itunes.apple.com"], maxBytes: 256 * 1024 },
  { id: "meta", name: "Meta Newsroom", url: "https://about.fb.com/feed/", kind: "official", owner: "meta", hosts: ["about.fb.com"] },
  { id: "discord", name: "Discord Blog", url: "https://discord.com/blog/rss.xml", kind: "official", owner: "discord", hosts: ["discord.com"] },
  { id: "reddit", name: "Reddit Inc", url: "https://redditinc.com/news/rss.xml", kind: "official", owner: "reddit", hosts: ["redditinc.com"] },
  { id: "techcrunch", name: "TechCrunch Social", url: "https://techcrunch.com/category/social/feed/", kind: "media", owner: "techcrunch", hosts: ["techcrunch.com", "www.techcrunch.com"] },
  // TikTok's own newsroom does not offer a stable public RSS feed. This
  // publisher-provided topic feed adds coverage without treating it as a second
  // independent TechCrunch source or scraping TikTok's internal site APIs.
  { id: "techcrunch-tiktok", name: "TechCrunch · TikTok", url: "https://techcrunch.com/tag/tiktok/feed/", kind: "media", owner: "techcrunch", hosts: ["techcrunch.com", "www.techcrunch.com"] },
  { id: "social-media-today", name: "Social Media Today", url: "https://www.socialmediatoday.com/feeds/news/", kind: "media", owner: "social-media-today", hosts: ["www.socialmediatoday.com", "socialmediatoday.com"] },
  { id: "engadget", name: "Engadget", url: "https://www.engadget.com/rss.xml", kind: "media", owner: "engadget", hosts: ["www.engadget.com", "engadget.com"] },
  { id: "socialday", name: "SocialDay", url: "https://socialday.live/rss/news", kind: "media", owner: "socialday", hosts: ["socialday.live", "www.socialday.live"] },
  { id: "netinfluencer", name: "Net Influencer", url: "https://www.netinfluencer.com/feed/", kind: "media", owner: "netinfluencer", hosts: ["www.netinfluencer.com", "netinfluencer.com"] },
  { id: "restofworld-platforms", name: "Rest of World · Platforms", url: "https://restofworld.org/feed/the-platform-economy/", kind: "media", owner: "restofworld", hosts: ["restofworld.org", "www.restofworld.org"] },
]);

export const HOT_WINDOW_MS = 48 * 60 * 60 * 1000;
export const LEAD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const RANKING_WINDOW_MS = LEAD_WINDOW_MS;
export const RANKING_BACKFILL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const RANKING_ARCHIVE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

const TOPICS = [
  ["YallaChat", /\byalla\s*chat\b/i],
  ["Yalla Lite", /\byalla\s+lite\b/i],
  ["Yalla Ludo", /\byalla\s+ludo\b/i],
  ["Yalla Parchis", /\byalla\s+parchis\b/i],
  ["Yalla Baloot", /\byalla\s+baloot\b/i],
  ["Yalla Jackaroo", /\byalla\s+jackaroo\b/i],
  ["101 Okey Yalla", /\b101\s+okey\s+yalla\b/i],
  ["Yalla Group", /\byalla\s+group\b/i],
  ["Yalla", /\byalla\b/i],
  ["BIGO LIVE", /\bbigo\s*live\b/i],
  ["Likee", /\blikee\b/i],
  ["Hago", /\bhago\b/i],
  ["imo", /\bimo\b/i],
  ["MICO", /\bmico\b/i],
  ["YoHo", /\byoho\b/i],
  ["SUGO", /\bsugo\b/i],
  ["TopTop", /\btop\s*top\b/i],
  ["Blued", /\bblued\b/i],
  ["HeeSay", /\bhee\s*say\b/i],
  ["JOYY", /\bjoyy\b|欢聚(?:集团|时代)?/i],
  ["Newborn Town", /\bnewborn\s+town\b|赤子城(?:科技)?/i],
  ["Discord", /\bdiscord\b/i],
  ["Facebook", /\bfacebook\b/i],
  ["Instagram", /\binstagram\b/i],
  ["WhatsApp", /\bwhats\s*app\b/i],
  ["Messenger", /\bmessenger\b/i],
  ["Threads", /\bthreads\b/i],
  ["TikTok", /\btik\s*tok\b/i],
  ["Snapchat", /\bsnapchat\b/i],
  ["Reddit", /\breddit\b/i],
  ["Twitch", /\btwitch\b/i],
  ["Bluesky", /\bbluesky\b/i],
  ["Twitter", /\btwitter\b/i],
  ["Orkut", /\borkut\b/i],
  ["Clubhouse", /\bclubhouse\b/i],
  ["Telegram", /\btelegram\b/i],
  ["Kwai", /\bkwai\b/i],
  ["YouTube", /\byou\s*tube\b/i],
  ["Chamet", /\bchamet\b/i],
  ["Tango Live", /\btango\s+live\b/i],
  ["WePlay", /\bweplay\b/i],
  ["Litmatch", /\blitmatch\b/i],
  ["Azar", /\bazar\b/i],
];

// A named product alone is not an event. Exclude generic creator/user behavior,
// marketing advice and roundups unless the title describes an actual change.
// Product nouns such as "safety" or "moderation" alone are not a news event.
// Demand a change, claim, launch, test or other concrete action in the title.
const SUBSTANTIVE = /\b(?:launch\w*|relaunch\w*|introduc\w*|releas\w*|roll(?:s|ed|ing)?\s+out|rollout\w*|test\w*|trial\w*|pilot\w*|expand\w*|add\w*|updat\w*|rebuild\w*|re-build\w*|redesign\w*|chang\w*|partner\w*|collaborat\w*|alleg\w*|ban\w*|sue\w*|accus\w*|settl\w*|join\w*|explor\w*|kill\w*|shut\w*|end\w*|remov\w*|discontinu\w*|stop\w*|recogniz\w*|bring\s+it\s+back|bringing\s+back|monetiz\w*|charg\w*|paywall\w*|will\s+(?:soon\s+)?(?:be\s+able\s+to|start\s+to)|may\s+soon\s+be\s+able\s+to)\b|\b(?:comments?|messages?|chats?|live)\s+(?:are|is)\s+getting\s+(?:more\s+)?interactive\b|(?:上线|推出|发布|新增|更新|测试|试点|扩张|增长|合作|起诉|指控|封禁|下架|收购|商业化)/i;

const COMPANY_TOPICS = new Set(["Yalla Group", "JOYY", "Newborn Town"]);
const CORE_TOPICS = new Set(["Yalla", "YallaChat", "Yalla Lite", "Yalla Ludo", "Yalla Parchis", "Yalla Baloot", "Yalla Jackaroo", "101 Okey Yalla", "BIGO LIVE", "Likee", "Hago", "imo", "MICO", "YoHo", "SUGO", "TopTop", "Blued", "HeeSay", "Chamet", "Tango Live", "WePlay", "Litmatch", "Azar"]);
const AMBIGUOUS_TOPICS = new Set(["Yalla", "imo", "MICO", "YoHo", "SUGO", "TopTop", "Blued"]);
const SOCIAL_CONTEXT = /\b(?:voice|audio|video|chat|live|social\s+(?:app|platform|network)|stream\w*|dating|newborn\s+town|mico\s+world)\b|(?:语聊|语音|直播|社交|赤子城)/i;
const COMPANY_RESULTS = /\b(?:financial|quarterly|annual|interim|half.year|operating\s+data|revenue|earnings|business\s+update|trading\s+update)\b|(?:财报|业绩|经营数据|营收|收入)/i;
const CONCRETE_COMPANY_RESULT = /\b(?:revenues?|profits?|earnings|income|users?|maus?|daus?|arpu|arppu|gmv)\b.{0,100}(?:\d+(?:\.\d+)?\s*(?:%|million|billion|bn|m\b)|\b(?:ris\w*|rose|grow\w*|increas\w*|declin\w*|fell|fall\w*|dropp?\w*|hit|reach\w*|record)\b)|(?:收入|营收|利润|用户|付费用户).{0,25}(?:\d+(?:\.\d+)?\s*(?:%|亿|万|元|美元)|同比|环比|增长|上升|提升|下降|减少|达到)/i;
const COMPANY_NOISE = /\b(?:to\s+(?:announce|report)|esg|buyback|repurchase|share\s+scheme|board\s+meeting|appointment|director|monthly\s+return|next\s+day\s+disclosure|notification\s+letter|agm|general\s+meeting)\b|(?:回购|董事|股东大会|月报|股份变动|环境社会管治)/i;
const CORE_PRODUCT_ACTION = /\b(?:brings?|hosts?|streams?|teams?\s+up|announces?|unveils?|debuts?)\b/i;
const RETROSPECTIVE = /\b(?:\d+\s+(?:months?|years?)\s+ago|on\s+this\s+day|remember\s+when|look\s+back)\b/i;
const PERIPHERAL = /\b(?:travel|booking|sports?\s+hub|ad\s+network|grocery|food\s+delivery)\b/i;
const BROAD_PROMOTION = /\b(?:campaign|promotion|sweepstakes|giveaway|festival|concert|community\s+fest)\b/i;
const ADVISORY_ONLY = /\b(?:tips?|guides?|tutorials?|how[\s-]+to|best\s+practices)\b|(?:使用指南|安全提示|隐私指南|操作教程)/i;
const RELEASE_HEADING = /\b(?:updates?|patch\s+notes|release\s+notes|changelog|what['’]s\s+new)\b|(?:版本更新|最新动态|更新)/iu;
const BARE_ENGLISH_DATE = /^(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(?:\d{1,2},?\s+)?\d{4}|\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{4})$/i;
const BARE_NUMERIC_DATE = /^\d{4}(?:\s*[-/.年]\s*\d{1,2}(?:\s*[-/.月]\s*\d{1,2}\s*日?)?)?$/u;
const BARE_VERSION = /^(?:version\s*)?v?\d+(?:\.\d+){1,3}$/i;
const RELEASE_META_TERMS = /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|updates?|patch|notes|release|changelog|version|new|features?|Q[1-4])\b|(?:版本|年|月|日)/giu;
const HOLLOW_RELEASE_PROMO = /\b(?:updates?|features?|changes?)\s+(?:you|users?)\s+(?:want|asked|need|love)\b|\b(?:everything|what)\s+you\s+need\s+to\s+know\b/i;
const HOLLOW_ENGLISH_CHANGE = /\b(?:launch\w*|releas\w*|add\w*|introduc\w*|updat\w*|roll\s*out)\s+(?:(?:a|an|its|the)\s+)?(?:new\s+)?(?:features?|updates?|changes?|improvements?)\.?$/i;
const HOLLOW_CHINESE_CHANGE = /(?:上线|推出|发布|新增|更新)(?:了)?(?:一项|多项|全新|新的|新)?(?:功能|更新|改进|变化)[。！!]?$/u;
const COMPANY_SOCIAL_CHANGE = /\b(?:launch\w*|introduc\w*|releas\w*|roll\s*out|expand\w*|add\w*|updat\w*|partner\w*|acquir\w*)\b|(?:上线|推出|发布|新增|更新|扩展|合作|收购)/i;
const SOCIAL_PRODUCT_CONTEXT = /\b(?:chats?|chatting|chatrooms?|messag\w*|dms?|direct\s+messages?|reels?|feed|voice|audio|live|livestream\w*|live\s+stream\w*|stream\w*|gifts?|gifting|comments?|polls?|rooms?|creator\w*|community|communities|friend\w*|profile\w*|dating|social|privacy|safety|moderation|teen\w*|video\s+call\w*|group\s+call\w*)\b|(?:语聊|语音|直播|社交|社区|私信|群聊|评论|礼物|创作者|隐私|安全)/i;
const SOCIAL_FEATURE_SIGNAL = /\b(?:chats?|chatting|chatrooms?|messag\w*|dms?|voice|audio|live|livestream\w*|stream\w*|gifts?|gifting|comments?|polls?|rooms?|reels?|feeds?|communities|creator\w*)\b|(?:语聊|语音|直播|私信|群聊|评论|礼物|创作者)/i;
const SOCIAL_NATIVE_TOPICS = new Set(["Discord", "Orkut", "Clubhouse", "Tango Live", "Chamet", "Litmatch", "Azar"]);

// These publisher headlines were checked against the original product
// announcements. Keep the bridge exact: broad verbs such as "provides" or
// "giving" also appear in promotional stories with no concrete product change.
const REVIEWED_PRODUCT_EVENTS = new Map([
  ["now you can invite anyone to a whatsapp call", { topic: "WhatsApp", event: "whatsapp-guest-calling" }],
  ["whatsapp provides chat guest links for non-users", { topic: "WhatsApp", event: "whatsapp-guest-calling" }],
  ["your algorithm, your words: new ways to shape what you see on facebook", { topic: "Facebook", event: "facebook-algorithm-controls" }],
  ["facebook is giving users more control over their algorithm", { topic: "Facebook", event: "facebook-algorithm-controls" }],
]);

// This unusually specific algorithm change is asserted by one commentary
// article without a primary announcement or independent confirmation. Its
// headline alone is not enough to present it as a product update.
const REVIEWED_UNCORROBORATED_CLAIMS = new Set([
  "tiktok's 48-hour follower test kills broad reach for creators with disengaged audiences",
]);

export function reviewedProductEvent(title, topic) {
  const reviewed = REVIEWED_PRODUCT_EVENTS.get(title.normalize("NFKC").toLowerCase());
  return reviewed?.topic === topic ? reviewed.event : null;
}

const ACTIONS = [
  ["planned", /\b(?:wants?\s+to|hopes?\s+to|plans?\s+to|consider(?:s|ing)?|will\s+(?:soon\s+)?(?:be\s+able\s+to|start\s+to)|may\s+soon\s+be\s+able\s+to)\b|(?:计划|拟推出|有望)/i],
  ["test", /\b(?:test\w*|trial\w*|pilot\w*|experiment\w*|explor\w*)\b|(?:测试|试点)/i],
  ["finance", /\b(?:revenue|earning\w*|financial|quarter|results|profit\w*)\b|(?:财报|业绩|营收|收入|经营数据)/i],
  ["monetization", /\b(?:charg\w*|paywall\w*|subscription\w*|monetiz\w*|payment\w*|commerce)\b|(?:收费|订阅|付费|商业化)/i],
  ["policy", /\b(?:safety|safe|privacy|moderation|regulat\w*|alleg\w*|teen\w*|ban\w*)\b|(?:安全|隐私|监管|指控|诉讼)/i],
  ["partner", /\b(?:partner\w*|collaborat\w*|participat\w*)\b|(?:合作|联手)/i],
  ["launch", /\b(?:launch\w*|relaunch\w*|introduc\w*|releas\w*|roll(?:s|ed|ing)?\s+out|rollout\w*|debut\w*|unveil\w*)\b|(?:上线|推出|发布|首发)/i],
  ["expand", /\b(?:expand\w*|available|bring\s+it\s+back|bringing\s+back)\b|(?:扩大|扩展|拓展|扩张)/i],
  ["update", /\b(?:add\w*|updat\w*|patch\s+notes|rebuild\w*|re-build\w*|redesign\w*|chang\w*|recogniz\w*)\b|(?:新增|更新|改版|升级)/i],
];

const ACTION_WEIGHT = { planned: 0.35, finance: 1.2, monetization: 1.2, launch: 1.12, expand: 1.06, update: 1.04, partner: 1.04, test: 1, policy: 1, other: 0.9 };

// Only distinctive, directly translatable product objects may bridge Chinese
// official headlines and English reports. Broad words such as "social" do not.
const EVENT_OBJECTS = [
  ["voice-chat", /\b(?:voice\s+chat|audio\s+chat)\b|(?:语聊|语音聊天)/i],
  ["voice-room", /\b(?:voice|audio)\s+(?:chat\s+)?rooms?\b|(?:语聊房(?:间)?|语音房(?:间)?)/i],
  ["video-call", /\bvideo\s+(?:chat|calls?)\b|(?:视频聊天|视频通话)/i],
  ["group-chat", /\bgroup\s+(?:chat|messag\w*)\b|(?:群聊|群组聊天)/i],
  ["gift", /\b(?:gifts?|gifting)\b|(?:礼物|打赏)/i],
  ["subscription", /\bsubscriptions?\b|(?:订阅|会员)/i],
  ["messaging", /\b(?:direct\s+messages?|private\s+messages?)\b|(?:私信|即时通讯)/i],
];

const REGIONS = [
  ["india", /\bindia\b|印度/i], ["brazil", /\bbrazil\b|巴西/i],
  ["us", /\b(?:U\.S\.|United\s+States)\b|美国/], ["uk", /\b(?:U\.K\.|United\s+Kingdom)\b|英国/],
  ["mena", /\bMENA\b|中东和北非/i], ["middle-east", /\bMiddle\s+East\b|中东/i],
  ["saudi", /\bSaudi\s+Arabia\b|沙特/i], ["indonesia", /\bIndonesia\b|印尼|印度尼西亚/i],
  ["turkey", /\bT(?:ü|u)rkiye\b|\bTurkey\b|土耳其/i], ["japan", /\bJapan\b|日本/i],
];

const STOP_WORDS = new Set(`a an and are as at be by for from has have in into is it its new of on or our the their to with your says said more how what why will can app apps platform platforms social media users user company group inc ltd official meta facebook instagram whatsapp messenger threads tiktok snapchat discord reddit twitch bluesky twitter yalla ludo bigo live joyy newborn town likee hago mico yoho sugo toptop blued heesay youtube chamet tango weplay litmatch azar x launch launches launched release released releases introducing introduces introduced rollout rolling rolls tests testing tested expands expanded adding adds added updates updated update feature features`.split(" "));
const TRACKING_KEYS = new Set(["fbclid", "gclid", "mc_cid", "mc_eid"]);

const parser = new XMLParser({ ignoreAttributes: true, trimValues: true, parseTagValue: false, processEntities: false });

function scalar(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && typeof value["#text"] === "string") return value["#text"];
  return "";
}

function decodeXml(value) {
  return value.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    const key = entity.toLowerCase();
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (key in named) return named[key];
    const code = key.startsWith("#x") ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : match;
  });
}

function tidyTitle(value) {
  return decodeXml(scalar(value)).replace(/<[^>]{0,100}>/g, " ").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 220);
}

function tidyContent(value) {
  return decodeXml(scalar(value))
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(?:script|style|noscript)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript)>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, 12000);
}

export function parseRssFeed(xml) {
  if (typeof xml !== "string" || XMLValidator.validate(xml) !== true) throw new Error("Invalid RSS XML");
  const channel = parser.parse(xml)?.rss?.channel;
  if (!channel || typeof channel !== "object") throw new Error("Missing RSS channel");
  const items = channel.item == null ? [] : Array.isArray(channel.item) ? channel.item : [channel.item];
  return items.slice(0, 100).map((item) => {
    const contentText = [item?.["content:encoded"], item?.description].map(tidyContent).sort((a, b) => b.length - a.length)[0] ?? "";
    return {
      title: tidyTitle(item?.title),
      url: decodeXml(scalar(item?.link)).trim(),
      publishedAt: scalar(item?.pubDate).trim(),
      ...(contentText ? { contentText, contentKind: "feed" } : {}),
    };
  });
}

// Apple's public lookup response supplies the developer's release notes and
// version date. Bind both the numeric ID and product name, and never substitute
// its evergreen description when the developer supplied no concrete changelog.
export function parseAppStoreLookupJson(json, source) {
  let data;
  try { data = JSON.parse(json); } catch { throw new Error("Invalid App Store lookup JSON"); }
  if (!source || source.format !== "apple-lookup" || !Number.isSafeInteger(source.appId) || !(source.appName instanceof RegExp)
    || !Array.isArray(data?.results) || !Number.isSafeInteger(data.resultCount) || data.resultCount !== data.results.length) throw new Error("App Store lookup metadata missing");
  if (!data.results.length) return [];
  const row = data.results.find((entry) => entry?.trackId === source.appId);
  if (!row || !source.appName.test(scalar(row.trackName))) throw new Error("App Store product identity mismatch");
  const url = validSourceUrl(scalar(row.trackViewUrl), source);
  if (!url || !new URL(url).pathname.endsWith(`/id${source.appId}`)) throw new Error("App Store product URL mismatch");
  const version = scalar(row.version).trim();
  const contentText = tidyContent(row.releaseNotes);
  if (!version || version.length > 40 || !contentText) return [];
  return [{
    title: tidyTitle(`${row.trackName} · iOS ${version}`),
    url,
    publishedAt: scalar(row.currentVersionReleaseDate).trim(),
    version,
    contentText,
    contentKind: "release-notes",
    productTopic: source.productTopic,
  }];
}

function easternReleaseDate(text) {
  const match = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s+ET$/i.exec(text);
  if (!match) return null;
  const wallTime = Date.parse(`${match[1]} ${match[2]}, ${match[3]} ${match[4]}:${match[5]}:00 UTC`);
  if (!Number.isFinite(wallTime)) return null;
  const offsetLabel = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" }).formatToParts(wallTime).find((part) => part.type === "timeZoneName")?.value;
  const offset = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(offsetLabel ?? "");
  if (!offset) return null;
  const offsetMs = (Number(offset[2]) * 60 + Number(offset[3] ?? 0)) * 60 * 1000 * (offset[1] === "+" ? 1 : -1);
  const at = new Date(wallTime - offsetMs);
  const local = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hourCycle: "h23" }).formatToParts(at).map((part) => [part.type, part.value]));
  if (local.month.toLowerCase() !== match[1].toLowerCase() || Number(local.day) !== Number(match[2]) || Number(local.year) !== Number(match[3]) || Number(local.hour) !== Number(match[4]) || Number(local.minute) !== Number(match[5])) return null;
  return { publishedAt: at.toISOString(), day: new Date(wallTime).toISOString().slice(0, 10) };
}

// Public, server-rendered JOYY organization index. Each record must identify
// JOYY as its issuing company, use the pinned organization ID and provide its
// own publication time. Its short excerpt is discovery metadata, not body text.
export function parseJoyyWireHtml(html) {
  if (typeof html !== "string" || !html.includes("recentNewsH")) throw new Error("Invalid JOYY newswire page");
  const items = [];
  for (const row of html.matchAll(/<li\b[^>]*class=["'][^"']*\brow\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)) {
    const block = row[1];
    const issuingCompany = /<a\b[^>]*class=["'][^"']*\bsourceLink\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (tidyTitle(issuingCompany?.[1]) !== "JOYY Inc.") continue;
    const main = /<div\b[^>]*class=["'][^"']*\bmainLink\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(block);
    const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(main?.[1] ?? "");
    const dateBlock = /<div\b[^>]*class=["'][^"']*\bdate-source\b[^"']*["'][^>]*>\s*<span\b[^>]*>([^<]+)<\/span>/i.exec(block);
    const title = tidyTitle(anchor?.[2]);
    const path = decodeXml(anchor?.[1] ?? "");
    const date = easternReleaseDate(tidyTitle(dateBlock?.[1]));
    if (!/^JOYY\b/i.test(title) || !/^\/news-release\/\d{4}\/\d{2}\/\d{2}\/\d+\/23553\/en\/[a-z0-9][a-z0-9-]*\.html$/i.test(path) || !date || !path.startsWith(`/news-release/${date.day.replaceAll("-", "/")}/`)) continue;
    items.push({ title, url: `https://www.globenewswire.com${path}`, publishedAt: date.publishedAt });
    if (items.length >= 30) break;
  }
  if (!items.length) throw new Error("JOYY newswire metadata missing");
  return items;
}

// BIGO has a dated, server-rendered news index but does not expose a working RSS
// feed. Parse only its visible article metadata; never execute embedded scripts.
export function parseBigoNewsHtml(html) {
  if (typeof html !== "string" || !html.includes("blog-item")) throw new Error("Invalid BIGO news page");
  const items = [];
  const pattern = /<a\b(?=[^>]*\bclass="[^"]*\btitle\b[^"]*")(?=[^>]*\bhref="([^"]+)")[^>]*>([\s\S]*?)<\/a>[\s\S]{0,1600}?<div\b[^>]*\bclass="time"[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/div>/gi;
  for (const match of html.matchAll(pattern)) {
    let url;
    try { url = new URL(decodeXml(match[1]), "https://www.bigo.tv").toString(); } catch { continue; }
    items.push({ title: tidyTitle(match[2]), url, publishedAt: match[3] });
    if (items.length >= 100) break;
  }
  if (!items.length) throw new Error("BIGO news metadata missing");
  return items;
}

// The company's IR page uses this public JSON endpoint for HKEX disclosures.
// file_name is the actual disclosure headline; title is only its category.
export function parseNewbornDisclosuresJson(json) {
  let data;
  try { data = JSON.parse(json); } catch { throw new Error("Invalid Newborn Town disclosures JSON"); }
  const rows = data?.code === 0 ? data?.data?.list?.website_hk_news : null;
  if (!Array.isArray(rows)) throw new Error("Newborn Town disclosures missing");
  return rows.slice(0, 120).filter((row) => {
    const category = scalar(row?.title);
    const headline = scalar(row?.file_name);
    return /(?:Interim Results|Annual Results|Quarterly Results|Trading Update|Inside Information)/i.test(category)
      || /\b(?:MICO|YoHo|TopTop|SUGO|Blued|HeeSay|social\s+(?:network\w*|entertainment)|livestream|voice\s+chat)\b|(?:社交|语聊|直播)/i.test(headline);
  }).map((row) => ({
    title: tidyTitle(row.file_name),
    url: scalar(row.file_url).trim(),
    publishedAt: scalar(row.release_time).trim(),
    category: scalar(row.title).trim(),
  }));
}

// The company's public news page renders these records at /news/:id. The API
// order is editorial, not chronological, so use each article's own day field.
export function parseNewbornNewsJson(json) {
  let data;
  try { data = JSON.parse(json); } catch { throw new Error("Invalid Newborn Town news JSON"); }
  const rows = data?.code === 0 ? data?.data?.list : null;
  if (!Array.isArray(rows)) throw new Error("Newborn Town news missing");
  return rows.slice(0, 100).filter((row) => Number.isSafeInteger(row?.ID) && row.ID > 0).map((row) => {
    const contentText = tidyContent(row.content);
    return {
      title: tidyTitle(row.title),
      url: `https://www.newborntown.com/news/${row.ID}?lang=zh`,
      publishedAt: scalar(row.day).trim(),
      ...(contentText.length >= 80 ? { contentText, contentKind: "article" } : {}),
    };
  });
}

function validSourceUrl(raw, source) {
  if (typeof raw !== "string" || raw.length > 2048 || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !source.hosts.includes(url.hostname.toLowerCase())) return null;
  if (source.format === "apple-lookup" && !url.pathname.endsWith(`/id${source.appId}`)) return null;
  if (source.id === "joyy-wire" && !/^\/news-release\/\d{4}\/\d{2}\/\d{2}\/\d+\/23553\/en\/[a-z0-9][a-z0-9-]*\.html$/i.test(url.pathname)) return null;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || TRACKING_KEYS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  return url.toString();
}

function topicFor(title, source, category) {
  // The headline subject wins. Array order previously assigned TikTok news to
  // Instagram whenever the headline also mentioned its competitor. For aliases
  // starting at the same position, retain the more specific configured match.
  const matches = [];
  for (const [topic, pattern] of TOPICS) {
    const match = pattern.exec(title);
    if (!match) continue;
    if (AMBIGUOUS_TOPICS.has(topic) && source.owner !== "newborn-town" && !(topic === "imo" && source.owner === "joyy") && !(topic === "Yalla" && source.owner === "yalla") && !SOCIAL_CONTEXT.test(title)) continue;
    matches.push({ topic, index: match.index, length: match[0].length });
  }
  const x = /(?:^|[\s(])X(?:[\s:’'\-]|$)/.exec(title);
  if (x) matches.push({ topic: "X", index: x.index + (x[0].startsWith("X") ? 0 : 1), length: 1 });
  // Parent-company attribution ("赤子城旗下 YoHo" / "JOYY's BIGO LIVE")
  // does not make the company the subject of a concrete product announcement.
  const products = matches.filter((match) => !COMPANY_TOPICS.has(match.topic)
    && !matches.some((company) => COMPANY_TOPICS.has(company.topic) && company.index === match.index && company.length > match.length));
  if (matches.length) return (products.length ? products : matches).sort((a, b) => a.index - b.index)[0].topic;
  if (source.id === "bigo-news" && /\bbigo\b/i.test(title)) return "BIGO LIVE";
  if (source.id === "newborn-ir" && /(?:Interim Results|Annual Results|Quarterly Results|Trading Update|Inside Information)/i.test(category)) return "Newborn Town";
  return null;
}

function thirdPartyDistributionOnly(title, topic) {
  // A media outlet opening its own channel or continuous broadcast is a
  // publishing decision, not a change to the host platform. Keep this narrow:
  // the third party must precede the launch action, the named platform follows
  // it, and an explicit channel/24-hour stream must be the announced object.
  const action = /\b(?:launch(?:es|ed|ing)?|start(?:s|ed|ing)?|beg(?:in(?:s|ning)?|an)|open(?:s|ed|ing)?|debut(?:s|ed|ing)?|introduc(?:e[sd]?|ing))\b|(?:开通|开播|推出)/iu.exec(title);
  const platform = TOPICS.find(([name]) => name === topic)?.[1].exec(title);
  if (!action || !platform || action.index === 0 || platform.index <= action.index + action[0].length || !/[\p{L}\p{N}]/u.test(title.slice(0, action.index))) return false;
  const channel = /\bchannels?\b|\b24\s*(?:\/\s*7|[-\s]*hours?)\b[^.!?]{0,80}\bstreams?\b|(?:24\s*小时|全天候).{0,30}直播流/iu.test(title.slice(action.index));
  const mechanism = /\b(?:chats?|chatting|interactiv\w*|gifts?|gifting|permissions?|moderation|co[-\s]?host\w*|multi[-\s]?guest|guest[-\s]?approv\w*|invite[-\s]?links?|subscriptions?|paid\s+memberships?|tipp?ing|paywalls?|revenue[-\s]?shar\w*|monetiz\w*)\b|(?:聊天|语聊|连麦|礼物|打赏|权限|审核|付费|分账|订阅)/iu.test(title);
  return channel && !mechanism;
}

function relevantEvent(title, topic) {
  if (REVIEWED_UNCORROBORATED_CLAIMS.has(title.normalize("NFKC").toLowerCase())) return false;
  if (thirdPartyDistributionOnly(title, topic)) return false;
  // A dated release heading is a table of contents, not a specific product event.
  // We only ingest title/link/date metadata, so never infer details from its URL.
  const heading = RELEASE_HEADING.exec(title);
  if (heading) {
    const beforeHeading = title.slice(0, heading.index).trim();
    const detail = title.slice(heading.index + heading[0].length).replace(/^[\s:：|—–-]+/u, "").trim();
    const metadataOnly = !detail.replace(RELEASE_META_TERMS, "").replace(/\d+(?:\.\d+)*/g, "").replace(/[^\p{L}\p{N}]/gu, "");
    if ((!detail || BARE_ENGLISH_DATE.test(detail) || BARE_NUMERIC_DATE.test(detail) || BARE_VERSION.test(detail) || metadataOnly)
      && !SUBSTANTIVE.test(beforeHeading)) return false;
  }
  if (ADVISORY_ONLY.test(title) || HOLLOW_RELEASE_PROMO.test(title) || HOLLOW_ENGLISH_CHANGE.test(title) || HOLLOW_CHINESE_CHANGE.test(title)) return false;
  if (reviewedProductEvent(title, topic)) return true;
  if (COMPANY_TOPICS.has(topic)) return !COMPANY_NOISE.test(title)
    && ((COMPANY_RESULTS.test(title) && CONCRETE_COMPANY_RESULT.test(title))
      || (SOCIAL_CONTEXT.test(title) && COMPANY_SOCIAL_CHANGE.test(title)));
  if (RETROSPECTIVE.test(title) || PERIPHERAL.test(title)) return false;
  if (!CORE_TOPICS.has(topic) && BROAD_PROMOTION.test(title)) return false;
  if (!CORE_TOPICS.has(topic) && !SOCIAL_NATIVE_TOPICS.has(topic) && !SOCIAL_PRODUCT_CONTEXT.test(title)) return false;
  return SUBSTANTIVE.test(title) || (CORE_TOPICS.has(topic) && CORE_PRODUCT_ACTION.test(title));
}

function relevantContentEvent(title, contentText, topic, source, contentKind) {
  if (!contentText || contentText.length < 30 || COMPANY_NOISE.test(title)) return false;
  if (source.format === "apple-lookup") {
    if (contentKind !== "release-notes" || source.productTopic !== topic) return false;
    // Release notes must name an actual social surface and change, not just
    // "bug fixes", "performance improvements" or an unchanged app description.
    return SOCIAL_FEATURE_SIGNAL.test(contentText) && relevantEvent(`${topic} ${contentText}`, topic);
  }
  // Generic earnings headlines are discovery candidates only. Their body must
  // contain an actual social-business result or specific product change before
  // they can enter ranking; corporate calendars and buybacks remain excluded.
  if (!COMPANY_TOPICS.has(topic) || !COMPANY_RESULTS.test(title)) return false;
  const sentences = contentText.split(/(?<=[.!?。！？])\s+|[\r\n]+/u);
  return sentences.some((sentence) => sentence.length <= 1200 && SOCIAL_PRODUCT_CONTEXT.test(sentence)
    && (CONCRETE_COMPANY_RESULT.test(sentence) || (SOCIAL_FEATURE_SIGNAL.test(sentence) && COMPANY_SOCIAL_CHANGE.test(sentence))));
}

function publishedDate(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const check = Date.parse(`${value}T00:00:00Z`);
    // Official date-only indexes use Beijing calendar days. UTC midnight would
    // incorrectly mark today's issue as future until 08:00 Beijing time.
    return Number.isFinite(check) && new Date(check).toISOString().slice(0, 10) === value
      ? { at: Date.parse(`${value}T00:00:00+08:00`), dayOnly: true, dayText: value } : null;
  }
  if (!/(?:GMT|UTC|[+-]\d{4}|Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? { at, dayOnly: false } : null;
}

function actionFor(title) {
  for (const [action, pattern] of ACTIONS) if (pattern.test(title)) return action;
  return "other";
}

function titleTokens(title) {
  const words = title.normalize("NFKC").toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return new Set(words.filter((word) => word.length > 2 && !STOP_WORDS.has(word)));
}

function matchingKeys(title, entries) {
  return new Set(entries.filter(([, pattern]) => pattern.test(title)).map(([key]) => key));
}

function comparable(a, b) {
  if (a.topic !== b.topic) return false;
  const aRegions = matchingKeys(a.title, REGIONS);
  const bRegions = matchingKeys(b.title, REGIONS);
  if (aRegions.size && bRegions.size && ![...aRegions].some((region) => bRegions.has(region))) return false;
  const reviewedEvent = reviewedProductEvent(a.title, a.topic);
  if (reviewedEvent && reviewedEvent === reviewedProductEvent(b.title, b.topic)) return true;
  // A rollout may be called a launch by one outlet and an expansion by another.
  const productChange = new Set(["launch", "expand", "update"]);
  if (a.action !== b.action && !(productChange.has(a.action) && productChange.has(b.action))) return false;
  const overlap = [...a.tokens].filter((token) => b.tokens.has(token)).length;
  if (overlap >= 2) {
    const minSize = Math.min(a.tokens.size, b.tokens.size);
    const unionSize = new Set([...a.tokens, ...b.tokens]).size;
    if (overlap / minSize >= 0.65 && overlap / unionSize >= 0.25) return true;
  }
  // Require a shared, specific product object and compatible action. Do not
  // merge two translated headlines merely because they name the same company.
  if (/[\u3400-\u9fff]/.test(a.title) === /[\u3400-\u9fff]/.test(b.title) || Math.abs(a.at - b.at) > 24 * 60 * 60 * 1000) return false;
  const aObjects = matchingKeys(a.title, EVENT_OBJECTS);
  const bObjects = matchingKeys(b.title, EVENT_OBJECTS);
  return aObjects.size > 0 && aObjects.size === bObjects.size && [...aObjects].every((object) => bObjects.has(object));
}

function hashId(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `story-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function publicGroup(items, nowMs) {
  // Independence follows the publisher/owner, not its hostname or article count.
  const byOwner = new Map();
  for (const item of items) {
    const existing = byOwner.get(item.source.owner);
    if (!existing || existing.at < item.at) byOwner.set(item.source.owner, item);
  }
  const representatives = [...byOwner.values()].sort((a, b) => a.source.kind === b.source.kind ? b.at - a.at : a.source.kind === "official" ? -1 : 1);
  const latestAt = Math.max(...representatives.map((item) => item.at));
  const latest = representatives.find((item) => item.at === latestAt);
  return {
    id: hashId(`${representatives[0].topic}|${items.map((item) => item.url).sort().join("|")}`),
    title: representatives[0].title,
    topic: representatives[0].topic,
    publishedAt: latest.dayOnly ? latest.dayText : new Date(latestAt).toISOString(),
    sourceCount: representatives.length,
    verification: representatives.length >= 2 ? "multi-source" : "single-source",
    sources: representatives.map((item) => ({ name: item.source.name, title: item.title, url: item.url, publishedAt: item.dayOnly ? item.dayText : new Date(item.at).toISOString(), kind: item.source.kind, category: item.category })),
    _heat: representatives.reduce((sum, item) => sum + 2 ** (-(nowMs - item.at) / (24 * 60 * 60 * 1000)), 0)
      * (CORE_TOPICS.has(representatives[0].topic) ? 1.4 : COMPANY_TOPICS.has(representatives[0].topic) ? 1.05 : 1)
      * (ACTION_WEIGHT[representatives[0].action] ?? 1)
      * (SOCIAL_FEATURE_SIGNAL.test(representatives[0].title) ? 1.18 : 1),
  };
}

export function buildHotList(rawItems, now = new Date()) {
  const nowMs = +now;
  if (!Number.isFinite(nowMs)) throw new Error("Invalid clock");
  const bySource = new Map(HOT_FEEDS.map((source) => [source.id, source]));
  const seenUrls = new Set();
  const candidates = [];
  for (const raw of rawItems) {
    const source = bySource.get(raw?.sourceId);
    if (!source) continue;
    const title = tidyTitle(raw.title);
    const url = validSourceUrl(raw.url, source);
    const dateText = typeof raw.publishedAt === "string" ? raw.publishedAt.trim() : "";
    // Date-only indexes retain day precision; they are never stamped with crawl time.
    const date = publishedDate(dateText);
    const topic = source.format === "apple-lookup" ? source.productTopic : topicFor(title, source, typeof raw.category === "string" ? raw.category : "");
    const contentText = typeof raw.contentText === "string" ? tidyContent(raw.contentText) : "";
    const relevant = source.format === "apple-lookup"
      ? relevantContentEvent(title, contentText, topic, source, raw.contentKind)
      : relevantEvent(title, topic) || relevantContentEvent(title, contentText, topic, source, raw.contentKind);
    if (!title || !url || !date || date.at > nowMs || nowMs - date.at > RANKING_ARCHIVE_WINDOW_MS || !topic || thirdPartyDistributionOnly(title, topic)
      || (!relevant && raw[PREVIOUSLY_REVIEWED_EVENT] !== true)) continue;
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    candidates.push({ title, url, at: date.at, dayOnly: date.dayOnly, dayText: date.dayText, topic, action: actionFor(source.format === "apple-lookup" ? contentText : title), tokens: titleTokens(title), category: typeof raw.category === "string" ? raw.category : "", source });
  }

  // Pairwise, conservative title matching: each candidate must match the group's
  // first title. This avoids transitive chains merging distinct platform stories.
  candidates.sort((a, b) => b.at - a.at);
  const groups = [];
  for (const item of candidates) {
    const group = groups.find((entry) => Math.abs(entry[0].at - item.at) <= HOT_WINDOW_MS && comparable(entry[0], item));
    if (group) group.push(item);
    else groups.push([item]);
  }

  const stories = [];
  const leads = [];
  const recentRankings = [];
  const backfillRankings = [];
  const archiveRankings = [];
  for (const group of groups) {
    const recent = group.filter((item) => nowMs - item.at <= HOT_WINDOW_MS);
    const latestAt = Math.max(...group.map((item) => item.at));
    const recentOwners = new Set(recent.map((item) => item.source.owner));
    // A 48-hour, two-independent-publisher gate keeps confirmed stories distinct.
    if (recentOwners.size >= 2 && recent.some((item) => item.source.kind === "media")) {
      stories.push(publicGroup(recent, nowMs));
    } else if (latestAt >= nowMs - LEAD_WINDOW_MS && new Set(group.map((item) => item.source.owner)).size === 1) {
      leads.push(publicGroup(group, nowMs));
    }
    // Keep seven-day events first, then 30-day and 90-day verified fallbacks.
    // Never duplicate a group or invent an item to reach ten places.
    const ranked = publicGroup(group, nowMs);
    if (latestAt >= nowMs - RANKING_WINDOW_MS) recentRankings.push(ranked);
    else if (latestAt >= nowMs - RANKING_BACKFILL_WINDOW_MS) backfillRankings.push(ranked);
    else archiveRankings.push(ranked);
  }
  stories.sort((a, b) => b._heat - a._heat || Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  leads.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const rankByHeat = (a, b) => b._heat - a._heat || b.sourceCount - a.sourceCount || Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id);
  recentRankings.sort(rankByHeat);
  backfillRankings.sort(rankByHeat);
  archiveRankings.sort(rankByHeat);
  const rankings = [...recentRankings, ...backfillRankings, ...archiveRankings].slice(0, 10);
  const stripInternal = (item) => ({
    id: item.id, title: item.title, topic: item.topic, publishedAt: item.publishedAt,
    sourceCount: item.sourceCount, verification: item.verification, sources: item.sources,
  });
  return {
    stories: stories.slice(0, 10).map(stripInternal),
    leads: leads.slice(0, 16).map(stripInternal),
    rankings: rankings.map((item, index) => ({
      ...stripInternal(item), titleZh: reviewedTitleZh(item.title),
      backfillWindowDays: index < recentRankings.length ? null : index < recentRankings.length + backfillRankings.length ? 30 : 90,
      rank: index + 1,
    })),
  };
}
