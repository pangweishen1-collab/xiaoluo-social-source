// Only manually reviewed translations of exact feed headlines belong here.
// A new or edited headline stays in English until its translation is checked.
const REVIEWED_HEADLINES = [
  ["Reddit's Developer Platform adds wiki access, closing the last gap forcing moderation bots to stay on the old API", "Reddit 开发者平台新增 Wiki 访问功能，补齐版主管理机器人迁移至新 API 的最后一项缺口"],
  ["BBC News launches 24/7 YouTube stream as legacy broadcasters test whether platform distribution can recapture younger audiences", "BBC 新闻在 YouTube 开设全天候直播，探索能否重新吸引年轻观众"],
  ["TikTok, Vertical Studio Made By Us Studios™ Partner to Produce Creator-Led Micro-Series", "TikTok 与竖屏制作公司 Made By Us Studios 合作，计划制作创作者主导的微短剧"],
  ["Now You Can Invite Anyone to a WhatsApp Call", "WhatsApp 现可邀请没有账号的人加入通话"],
  ["WhatsApp provides chat guest links for non-users", "WhatsApp 向非用户提供访客链接"],
  ["Your Algorithm, Your Words: New Ways to Shape What You See on Facebook", "Facebook 推出用自然语言调整 Feed 和 Reels 推荐的功能"],
  ["Facebook is giving users more control over their algorithm", "Facebook 让用户更直接地控制内容推荐"],
  ["Instagram's 2x Reels speed, launched 18 months ago, signals what YouTube and TikTok already know: audiences want control, not shorter videos", "Instagram Reels 的 2 倍速功能上线 18 个月，显示用户想要的是播放控制，而非更短的视频；YouTube 和 TikTok 早已注意到这一点"],
  ["WhatsApp users may soon be able to schedule messages", "WhatsApp 用户或将很快可以定时发送消息"],
  ["X re-builds its third-party usage showcase", "X 重建第三方 API 应用案例展示站"],
  ["X rebuilds its third-party usage showcase", "X 重建第三方 API 应用案例展示站"],
  ["Remember Orkut? Its founder wants to bring it back", "还记得 Orkut 吗？创始人希望让它回归"],
  ["TikTok Accused of Giving Children Placebo Safety Features in New Lawsuit", "新诉讼指控 TikTok 为儿童提供形同虚设的安全功能"],
  ["New York alleges TikTok gave teens, children a placebo safety feature instead of a real one", "纽约州指控 TikTok 向青少年和儿童提供形同虚设的安全功能，而非真正有效的功能"],
  ["X launches MLB Gametime experience", "X 推出 MLB Gametime 赛事体验"],
  ["X expands its ‘Gametime’ sports hub beyond the NFL, starting with MLB", "X 将 Gametime 体育专区扩展至 NFL 之外的赛事，首先接入 MLB"],
  ["TikTok opens 400,000-app ad network to US advertisers, but Smart+ campaigns pull it in by default", "TikTok 向美国广告主开放覆盖 40 万款应用的广告网络，Smart+ 广告系列默认纳入投放"],
  ["Meta will charge for Instagram AI after daily caps, putting production cost on creators for first time", "Meta 将在 Instagram AI 功能达到每日使用上限后收费，创作者首次需承担相关制作成本"],
  ["Facebook tests going Reels-first in India", "Facebook 在印度测试优先展示 Reels 的界面"],
  ["TikTok's Halloween travel push turns creator discovery into booking revenue as GO closes the transaction loop", "TikTok 借万圣节旅行推广，将创作者推荐转化为预订收入，并通过 TikTok GO 完成交易闭环"],
  ["A YouTube test brought creator analytics directly into brands’ YouTube Studio dashboards", "YouTube 曾测试在品牌方的 YouTube Studio 后台直接展示创作者数据"],
  ["Threads recognizes top posts with in-app Gems program", "Threads 推出站内 Gems 计划，表彰带动讨论的优质帖子"],
  ["Discord's Halloween cosmetics campaign tests FOMO mechanics the platform once avoided", "Discord 万圣节虚拟装扮活动试水其过去回避的限时稀缺促购机制"],
  ["Discord Patch Notes: October 6, 2026", "Discord 更新日志：2026 年 10 月 6 日"],
  ["WhatsApp adds new parental controls for teen accounts", "WhatsApp 为青少年账号新增家长控制功能"],
  ["YouTube's new live tools turn reaction streams into revenue contests, but most won't ship until 2027", "YouTube 新直播工具将反应类直播引入创收竞争，但多数功能要到 2027 年才上线"],
  ["Find Your Community With Forum, a Dedicated App for Facebook Groups", "用 Forum 寻找社区：一款面向 Facebook 群组的独立应用"],
  ["Expanding Instagram’s School Partnership Program to Help Teens Stay Informed", "Instagram 扩大校园合作计划，帮助青少年及时获取相关信息"],
  ["Discord Update: September 25, 2026", "Discord 更新：2026 年 9 月 25 日"],
  ["TikTok’s US arm joins Lantern, a cross-platform child safety initiative", "TikTok 美国业务加入跨平台儿童安全倡议 Lantern"],
  ["TikTok removes Instagram and YouTube profile links, forcing creators onto Linktree as platform tightens ecosystem control", "TikTok 移除个人主页中的 Instagram、YouTube 链接；文章称创作者转向 Linktree"],
  ["TikTok comments are getting more interactive with voice comments, polls, and more", "TikTok 评论区新增语音评论、投票等互动方式"],
  ["TikTok reaches $400M settlement over children’s privacy lawsuit", "TikTok 就儿童隐私诉讼达成 4 亿美元和解"],
  ["TikTok explores peer-to-peer payments via DMs, report says", "报道称 TikTok 正探索通过私信进行用户间支付"],
  ["BIGO LIVE Brings Esports World Cup 2026 to MENA Fans", "BIGO LIVE 为中东北非粉丝带来 2026 电竞世界杯内容"],
  ["Adding the Discord Updates YOU Want to See", "Discord 新增用户期待的更新内容"],
];

function normalizeHeadline(title) {
  return title.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

const translations = new Map(REVIEWED_HEADLINES.map(([english, chinese]) => [normalizeHeadline(english), chinese]));

export function reviewedTitleZh(title) {
  if (typeof title !== "string") return null;
  return translations.get(normalizeHeadline(title)) ?? null;
}

/** Resolve copy at render time so old cached feeds also use reviewed translations.
 * A translated headline does not imply that the article body passed fact review.
 * @param {{ title: string, titleZh?: string|null, detail?: { status?: string, titleZh?: string|null } }} story
 */
export function hotTitleForDisplay(story) {
  const candidates = [
    story.detail?.status === "ready" ? story.detail.titleZh : null,
    story.titleZh,
    reviewedTitleZh(story.title),
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && /[\u3400-\u9fff]/u.test(candidate)) return candidate.trim();
  }
  // No keyword substitution or guessed translations: preserve the exact original.
  return story.title;
}
