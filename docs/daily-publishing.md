# 小骆日报发布与自动化接入

当前五栏目正文的 Markdown 层级、来源和网站显示规范见 [日报 Markdown 格式规范](daily-markdown-format.md)，可复制的稿件模板见 [标准日报模板](examples/daily-report-template.md)。排版规范不替代下述事实核验与发布授权。

## 历史状态，不作为当前运行保证

2026-09-15 曾将日报同步至网站，并为当时的 `automation-3` 配置投递步骤；该记录仅描述当时操作，**不能据此认定现在定时任务仍在运行、线上仍具备 Wrangler 登录、或新结构化日报已上线**。旧文档把一个固定 `sourceThread` 当作允许发布的来源限制；现已撤销此“暗号式授权”。`sourceThread` 只记录报告来源，真正的写入权限来自运行环境的 Cloudflare/Wrangler 凭证，自动模式还必须通过独立核验签名。

## 手动路径与兼容迁移

`report.json` 仍需 `date`、`title`、完整公开 `body`、`sourceThread`，可附带 `edition`。先本地检查：

```sh
node scripts/publish-daily.mjs /absolute/report.json
```

只有人工已核对本期事实、正文和目标生产库之后，才使用显式手动确认标志：

```sh
node scripts/publish-daily.mjs /absolute/report.json --manual-confirmed --remote
```

旧的 `node scripts/publish-daily.mjs report.json --remote` **现在会安全失败**；不能悄悄把旧自动任务当作人工确认。更新现有任务前先确认任务 ID、状态、时区和当前 prompt，避免重复创建或更改用户原有邮件投递。手动同日修改仍可 upsert，自动模式不能覆盖同日不同版。

## 核验通过后自动发布

用户选择的是“核验通过后自动发布”，不是“有一份生成文本就发布”。自动路径需要同一天的 MD 与微信双版本、事实底稿、结构化版面，以及**由独立核验器签名的通过凭证**。发布脚本还会检查当天日期、原文 HTTPS 可访问性、事实底稿与页面条目一致、七天事件窗口、榜单口径、招聘有效性、公开归档的重复事件、同日幂等与生产回读。具体文件协议和命令见 [`daily-edition-bridge.md`](daily-edition-bridge.md#核验通过后自动发布安全门禁)。

保留的本机签名文件路径上线/启用顺序：

1. 核对实际生产 D1 和当前网站版本；如缺 `edition_json`，先对正确数据库执行 `db/daily-reports-edition.sql`，部署读取结构化版面的 Worker 与页面。
2. 单独配置核验器及 Ed25519 私钥；发布任务只配置公钥和 Wrangler 最小写入权限。核验器必须能判定每条事实是否确由原文支持；只检查 URL 或自报 `verified` 不够。
3. 用真实日报样本在本地跑 `--auto`（不带 `--remote`）及测试，再进行一次用户授权的生产演练和公开 API 回读。
4. 若要继续沿用旧本机任务，先核实其真实 ID、暂停状态和原有时间；不得根据旧文档假定为每天 10:00，也不得直接恢复。它只有在能隔离核验环境和最小生产写入权限后才能改造为 `--auto --fact-record ... --verification ... --remote`。任一步失败须停止并通知，不以旧闻或空白信息补齐；原文来源 URL 应按事实条目保留在双格式正文中。

云端自动化是另一条发布路径，部署及证据范围见 [`daily-automation.md`](daily-automation.md)。只有生产 Cron Trigger、独立复核、私有草稿和日报 API 的真实演练都通过后，才能称该路径已启用；旧本机任务保持暂停。

## 日报详情接口上线验收

2026-10-14 的生产排查发现：公开归档已有当天日报，但线上单期详情仍返回 HTML 404，且生产 D1 的 `daily_reports` 表缺少 `edition_json`。因此仅发布新版 Worker 会触发 SQL 错误，必须按以下顺序处理：

1. 在获得生产变更授权后，先备份并核对 `wrangler.daily.json` 指向的生产 D1；只读执行 `PRAGMA table_info(daily_reports)`，确认 `edition_json` 是否缺失。缺失时对该库执行一次 `db/daily-reports-edition.sql`；已有该列时不要重复执行。
2. 构建并发布包含 `/api/daily-reports/:date` 路由的新版网站。数据库迁移和网站发布须作为同一次受控上线验收，不要只完成其中一步。
3. 执行 `pnpm daily:smoke https://xiaoluo-social.pages.dev`。脚本要求轻量归档只返回日期、标题及头条标题，并用最新日期回读单期详情的 JSON 200；旧版全量归档和 HTML 404 都会使检查失败。还应人工打开该期页面确认正文可读。

这个验收只证明网站的日报读取链路正常，不等于“核验通过后自动发布”已经启用。
