# 日报独立页面：事实底稿到结构化版面

小骆日报仍按 Skill 的固定三栏生成 MD 和微信纯文本；网站的 `edition` 是同一事实底稿的**第三种展示数据**，不是对正文的自动摘要，也不改写旧日报。`docs/examples/daily-edition.example.json` 仅演示字段，内容与链接是虚构的，**不可发布**。

## 数据与人工选择

`shared/daily-edition.mjs` 提供 `createDailyEditionFromFactRecord(record, options)`、`validateDailyEdition(edition)` 和 `parseDailyEdition(value)`。事实底稿采用用户 Skill 的 `references/fact-record-example.json` 字段：`section`、`event_key`、`reported_title`、`verified_facts`、`event_date`、`source_urls`、`verification_status`、`previously_reported`、`substantive_new_detail`。只有 `verification_status: "verified"`、具体非空的 `verified_facts`、至少一个可访问原文的 HTTPS 链接，才有资格成为网站条目。`previously_reported: true` 且没有非空 `substantive_new_detail` 的旧事件会被过滤；有新进展时允许收录，但新事实仍须人工核实并写进本期条目。生成器还按 `event_key` 去重，不补虚构事实、日期或来源；真实来源是否独立、是否支持该事实仍须人工核验。

`sections` 永远按产品雷达、团队与招聘动向、语聊直播产品近一周变化排序。空栏目保留空数组，页面可显示“本期暂无可核验内容”，不凑条目。`leadItemId` 必须指向本期已核实条目；优先显式指定 `lead_event_key` 或 CLI `--lead-event-key`，未指定时默认取第一条真实合格条目；本期没有合格条目则为 `null`。`highlightIds` 最多三条，默认空，不能捏造“看点”。

网站条目保留 `sourceUrls` 以供读者点开核对；**MD 与微信正文也逐条保留完整原文 URL**，并要求与对应网站条目完全一致：Markdown 用 URL 本身作为链接文字，微信纯文本将原始 URL 单独成行。旧库记录没有 `edition_json` 时，API 返回 `edition: null`，页面回退展示完整 Markdown。

## 本地生成与发布

从实际核验过的事实底稿生成版面 JSON（stdout，可在终端重定向到自选文件）：

```sh
node scripts/prepare-daily-edition.mjs /absolute/fact-record.json \
  --lead-event-key '产品ID::事件主题::版本或活动ID'
```

发布 JSON 含 `date`、`title`、`body`、`sourceThread`；`sourceThread` **仅用于溯源，不是发布授权**。`body` 必须是已校对的完整公开日报。结构化版面可放在同一 JSON 的 `edition` 字段，也可单独通过 `--edition` 指向版面 JSON；两种方式不可同时用。手动发布先不带 `--remote` 本地校验；人工核验后需要显式 `--manual-confirmed` 才可远程写入：

```sh
node scripts/publish-daily.mjs /absolute/report.json --edition /absolute/edition.json
node scripts/publish-daily.mjs /absolute/report.json --edition /absolute/edition.json --manual-confirmed --remote
```

管理员后台若直接提交，`POST/PATCH /api/daily-reports` 的 `edition` 使用相同 JSON 结构；不提交该字段时保留旧纯正文提交格式。`PATCH` 修改正文但不附新版 `edition` 时清空旧结构化版面，避免网页头条与正文互相矛盾。脚本的 SQL 也遵守此语义。发布成功后按日期详情 API 回读正文和结构化数据。

上线顺序是：先执行 `db/daily-reports-edition.sql` 到**已确认的生产 D1**，再部署支持 `edition_json` 的 Worker／页面，最后才运行新版远程发布脚本或更改现有定时任务。未迁移数据库时新版脚本应明确报错，不能悄悄回退到可能留下过期版面的旧 SQL。自动模式的远程写入还会回读线上 API 比对全文和版面；同日期不同内容时拒绝覆盖，保持幂等。

## 核验通过后自动发布：安全门禁

既有本机日报任务目前为暂停状态，不能假定每天 10:00 运行，也不能直接用“生成完成”代替“核验通过”。该节描述保留的签名文件发布路径；新建的云端生成、独立复核及 D1 私有发布服务见 [`daily-automation.md`](daily-automation.md)。文件发布路径的任务应依次产出：

1. 同一事实底稿 `facts.json`：`report_date` 与日报日期一致；每条已核实事件含产品身份、具体 `verified_facts`、原文 HTTPS 链接、`retrieved_at`、事件或公告日期及跨日报去重信息。榜单需市场／商店／榜类／快照名次，招聘需确认仍开放，七日变化需窗口内日期。
2. 同一事实底稿生成的 `report.json`：含两个完整且逐行一致的 `body`（MD）和 `wechatBody`（纯文本），以及**内嵌** `edition`。自动模式不接受另一个 `--edition` 文件，以便核验签名覆盖最终网页内容。三栏必须固定，至少有一条已核实事实；证据不足时应暂停，不以旧闻或空话凑数。
3. 与生成步骤隔离的核验器，对每个事实检查原文确实支持断言、产品身份和日期／榜单口径正确，核对历史日报是否重复；所有项目通过后，形成独立 `review.json`，再由**仅核验器持有的 Ed25519 私钥**签发 `verification.json`。生成日报的任务和网站发布任务只能拿到对应公钥，不应持有私钥。单纯能访问 URL、或底稿自写 `verification_status: "verified"`，均不等于事实被核验。签发工具只负责校验格式与来源可访问性并签名，**不会代替语义事实核查**。
4. 发布任务运行如下命令；脚本再次校验签名、精确文件哈希、栏目及双版本一致性、日期时效、来源 URL 在线状态和最近公开日报的事件键，再写入 D1 并回读生产 API。不通过时退出非零且不写库，应通知人工补证或改稿。

先由运行环境的密钥管理器提供多行 `XIAOLU_DAILY_VERIFIER_PUBLIC_KEY`，再运行：

```sh
node scripts/publish-daily.mjs /absolute/report.json \
  --auto --fact-record /absolute/facts.json --verification /absolute/verification.json --remote
```

`verification.json` 签名内容是除 `signature` 外整个 JSON 按 `scripts/daily-publication-gate.mjs` 的 `canonicalJson()` 排序后的 UTF-8 字节；签名字段是 Ed25519 原始签名的 Base64。必填：`schemaVersion: 1`、`verdict: "pass"`、`reportDate`、原始 `report.json` 和 `facts.json` 文件字节的 SHA-256 (`payloadSha256`、`factRecordSha256`)、24 小时内 `checkedAt`、`verifierId`、覆盖所有发布条目的 `verifiedEventKeys`，以及全部为 `"pass"` 的 `checks.source_access`、`claim_support`、`app_identity`、`date_scope`、`dedupe`、`output_parity`。更改任何正文或事实底稿后必须重新核验签名。私钥不能放进仓库、计划任务发布阶段或浏览器。

独立核验器完成逐条原文核对后，`review.json` 至少写入 `verdict: "pass"`、`verifierId`、与版面完全一致的 `verifiedEventKeys`，以及上面六个检查项的通过结果。它应在**隔离的核验环境**中、从密钥管理器读取多行 `XIAOLU_DAILY_VERIFIER_PRIVATE_KEY`，随后执行：

```sh
node scripts/sign-daily-verification.mjs /absolute/report.json /absolute/facts.json \
  /absolute/review.json --out /absolute/verification.json
```

签发脚本会再次核对文件、底稿、双版本格式及来源 URL，且拒绝覆盖已有签名文件；它不判断英文原文是否真的支持中文断言，因此 `review.json` 必须由独立核验流程作出，不能让生成稿件的任务自签。

自动模式只允许北京时间**当天**新报告，生产中已有同日不同版时拒绝覆盖；历史纠错使用单独人工审核流程。公开归档 API 目前最多返回最近 90 期，自动去重据此覆盖可访问的历史结构化版面；更长期的去重仍需要可靠事件台账。外部站点拒绝脚本访问或核验器无法判定事实时都应暂停，而不是绕过门禁。

**路径区分：**本节的 `scripts/publish-daily.mjs --auto` 仍是需要 Ed25519 凭证的文件发布路径；独立云端日报自动化使用私有 Cloudflare Worker Service Bindings 和单独的生产 D1 发布 Worker，不使用本机私钥或恢复旧定时任务。旧任务若仍用裸 `--remote`，脚本会拒绝写入。

## 与 AIHOT 开源逻辑的边界

这一阶段借鉴“先有事实条目，再编排头条和栏目”的思路，但没有复制或运行 AIHOT 的完整抓取、队列、LLM 双次评分与事件聚类服务。小骆现有热点榜只可作为线索，不能自动进入日报；社交产品归属、榜单同口径比较、招聘开放状态与七日内实质变化仍由 Skill 的证据规则决定。先让每期独立页面和证据数据可靠，再单独评估自动采集能力。
