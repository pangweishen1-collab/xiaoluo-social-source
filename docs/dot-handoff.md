# 小骆网站开发接手说明

整理日期：2026-11-04（北京时间）。本次操作只同步源码，不部署、不修改生产数据、不触发日报生成。

## 项目入口

- 代码仓库：https://github.com/pangweishen1-collab/xiaoluo-social-source
- 接手分支：`main`。请重新拉取，不要继续使用 9 月的仓库缓存。
- 线上网站：https://xiaoluo-social.pages.dev/
- Cloudflare Pages 项目：`xiaoluo-social`。
- 当前 Mac 源码目录：`/Users/a123/Documents/Codex/2026-08-19/new-chat`。
- 本地工作分支：`online-main`，本次同步将当前提交以快进方式推送到远端 `main`。

先读取根目录 `AGENTS.md`、`package.json` 和本文件，再检查实际代码。仓库地址并不提供 Cloudflare 管理权限；需要通过用户已有授权的连接读取部署状态。不得把本地配置或部署文档当作定时任务已成功运行的证据。

## 用户希望继续确认的方案

日报达到核验条件后自动发布：只处理新增资讯，复用未变化内容的已核验结果，降低重复 AI 消耗。读取原文，核对真实日期、产品身份、数字和具体变化；独立复核通过后发布，失败保留私有草稿及原因，不凑数、不把缺少内容当作已发布。先检查并提供具体改造方案，实施与部署等待用户分别确认。

## 自动化代码与配置

| 环节 | 源码 | 配置 |
| --- | --- | --- |
| 日报生成 | `worker/daily-automation/generator.mjs` | `wrangler.daily-generator.json` |
| 独立复核 | `worker/daily-automation/reviewer.mjs` | `wrangler.daily-reviewer.json` |
| 日报发布 | `worker/daily-automation/publisher.mjs` | `wrangler.daily-publisher.json` |
| 原文读取 | `worker/daily-automation/source.mjs` | 由生成和复核服务使用 |
| 热点榜及备用触发 | `worker/hot-daily.ts` | `wrangler.hot.json` |

相关文档：`docs/daily-automation.md`、`docs/daily-publishing.md`、`docs/daily-edition-bridge.md`、`docs/hot-list.md`。

当前仓库配置的时间：热点榜 08:00、日报生成 11:00、日报备用触发 11:15，均为北京时间。这只是源码配置，接手时应核对云端实际部署的版本、Cron 和调用记录。

注意：现有自动生成流程仍以热点原文驱动，旧的自动版面与新的人工作者五栏目格式可能存在差距；榜单快照和招聘采集能力不可仅凭前端栏目存在就认定已实现。先核对源码和证据覆盖范围，再决定如何补齐。

公开运行状态：`https://xiaoluo-social.pages.dev/api/daily-automation-status`。公开状态不包含私有草稿；管理员草稿需经已有权限读取。此前本地异常提醒任务曾被用户暂停，不能因为仓库保留了说明就自动重新启用提醒或触发生产补跑。

## 日报显示规范

- `docs/daily-markdown-format.md`：完整规范。
- `docs/examples/daily-report-template.md`：五栏目模板。
- `app/daily-markdown.tsx`、`app/daily-markdown.css`：安全渲染与蓝色重点。
- 标准重点写法 `***重点***`，普通 `**加粗**` 不变蓝，不开启原始 HTML。
- 旧稿中的 HTML span 不会因代码更新自动被转换；显示修改与生产内容写入是不同操作。

## 本地开发与验证

项目使用 Node.js >= 22.13.0、pnpm 10.10.0。普通环境执行：

```sh
pnpm install --frozen-lockfile
pnpm run dev
pnpm run check
git diff --check
```

`check` 包含浏览器及 Worker 类型检查、生产构建和单元测试，不包含 ESLint 或完整安全审计。日报发布后的读取验证命令为 `pnpm run daily:smoke https://xiaoluo-social.pages.dev`。

本次源码同步前，2026-11-04 的 `pnpm run check` 已通过：类型检查、生产构建及 468 项单元测试；`git diff --check` 通过。此结果不证明线上定时任务当天已运行，也不代替后续改造的重新验证。

本地默认部分公开 GET 请求代理到线上，管理写入走本地。需要全本地数据模式时设置 `XIAOLUO_REMOTE_ARTICLES=0`，并准备测试数据；不要将测试写请求误发生产。

## 边界与待核对事项

- 不重置已有工作，不批量重跑历史迁移，不覆盖既有日报。
- 每次完成代码更新依照 `AGENTS.md` 维护 `app/site-updates.json` 的 draft；只有用户明确授权发布时才构建发布候选并部署。
- 仓库未包含环境 secret、登录态、本地 D1 数据、缓存或依赖目录。生产日报和其他动态内容仍需从对应数据源读取，克隆代码不是备份生产数据库。
- `worker/index.ts` 仍有历史硬编码管理员凭据哈希，应作为单独的凭据治理事项审查；本次同步未轮换生产凭据，不在此文档复述其值。
- `docs/infrastructure-audit-2026-09-15.md` 是历史检查记录，不能直接当作当前安全或测试结论。

请先反馈：实际读取的提交、三个 Worker 的现状、去重与缓存、原文核验、失败草稿、同日覆盖保护和权限边界，再给出可验证的改造步骤。
