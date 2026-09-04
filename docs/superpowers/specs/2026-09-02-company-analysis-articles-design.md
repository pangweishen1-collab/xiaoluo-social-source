# 公司分析文章后台与阅读页设计

## 目标

把“公司分析”从前端静态卡片升级为可管理的文章栏目：管理员在独立后台发布、编辑或删除纯文字文章；访客可从前台列表进入专业资讯阅读页。

## 范围

- 新增独立后台登录页与管理页；登录成功后直接进入管理页。
- 后台新增、编辑、删除文章；保存即发布，没有草稿状态。
- 文章字段为标题、公司、分类、摘要、标签、正文、发布时间和 URL 标识。
- 正文采用受限 Markdown：`#`、`##`、段落、无序/有序列表和加粗；不支持 HTML、图片或外链嵌入。
- 公司分析列表读取 D1 已发布文章，卡片可点击跳转到独立文章阅读页。
- 阅读页提供大标题、元信息、导语、层级标题与易读正文排版，以及返回公司分析列表的入口。

## 不在本期范围

- 图片、封面、文件上传和富文本编辑器。
- 草稿、定时发布、多作者、文章评论与阅读量统计。
- 复用现有人才市场的后台入口、账号或会话 Cookie。

## 架构

Cloudflare Worker 继续直接使用 D1，并新增独立的文章表与文章后台会话表。文章后台使用独立 Cookie 名称、独立认证端点和独立的环境变量账号凭据；人才市场现有 `xiaoluo_admin` Cookie 和接口保持不变。

前台保留现有单页导航用于栏目浏览；路由层新增可直接打开的文章详情页和后台路由。文章列表在客户端从公开 API 拉取数据；详情页按 URL 标识请求单篇公开文章。后台所有写操作与文章管理列表均要求独立后台会话。

## 数据模型

`analysis_articles`：

- `id`：UUID 主键。
- `slug`：唯一 URL 标识，格式为小写字母、数字和连字符，长度 3–96。
- `title`：标题，1–120 字符。
- `company`：公司名称，1–120 字符。
- `category`：栏目分类，默认“公司分析”，最长 40 字符。
- `summary`：导语/摘要，1–500 字符。
- `tags`：JSON 字符串数组，最多 6 个，每项最多 24 字符。
- `body`：Markdown 正文，1–30,000 字符。
- `published_at`：ISO 时间；创建时写入，编辑不改变其值。
- `updated_at`：ISO 时间；每次更新时写入。

`article_admin_sessions`：`token` 主键及 `expires_at`，会话 7 天有效。

## API

公开接口：

- `GET /api/articles`：按 `published_at DESC` 返回文章摘要列表，不返回 `body`。
- `GET /api/articles/:slug`：返回单篇完整文章；不存在返回 404。

后台认证：

- `GET /api/article-admin/session`：返回独立会话是否有效。
- `POST /api/article-admin/session`：验证 `ARTICLE_ADMIN_USERNAME` 与 `ARTICLE_ADMIN_PASSWORD_HASH`，创建 `xiaoluo_article_admin` HttpOnly、SameSite=Strict Cookie。
- `DELETE /api/article-admin/session`：删除会话和 Cookie。

后台文章管理：

- `GET /api/article-admin/articles`：返回完整文章列表。
- `POST /api/article-admin/articles`：校验后创建并立即发布文章；重复 slug 返回 409。
- `PATCH /api/article-admin/articles/:id`：校验并更新文章；目标不存在返回 404。
- `DELETE /api/article-admin/articles/:id`：删除文章；目标不存在返回 404。

写接口必须拒绝不同源请求、未登录请求和无效 UUID；所有响应使用 `Cache-Control: no-store`。文章读取失败不得泄露后台凭据或 D1 错误细节。

## Markdown 渲染与安全

实现一个小型、白名单式 Markdown 渲染器，而非插入 HTML：仅生成 `h2`、`h3`、`p`、`ul`、`ol`、`li`、`strong` 和文本节点。所有原始 HTML 一律视为文本；不使用 `dangerouslySetInnerHTML`。文章详情页只在正文第一个 `# ` 标题出现时将其渲染为页面内一级标题，其余二级/三级标题形成正文结构；页面顶端固定使用文章的 `title` 作为视觉大标题。

## 前台体验

公司分析列表：保留搜索与卡片样式；文章 API 成功时显示动态文章，API 暂不可用时显示现有静态文章作为只读兜底。每张动态卡片使用链接而非按钮，目标为 `/analysis/:slug`。

文章详情页：顶部为栏目名、分类和发布日期；随后是大标题、摘要导语、标签与正文。内容列限制为约 760px，标题层级清晰，段落行高至少 1.85；窄屏上保持单列可读性。未找到文章显示简洁 404 状态与返回链接。

后台：`/admin/login` 只展示文章后台登录表单；有效登录后跳转 `/admin`。`/admin` 展示文章表格/列表、新建文章按钮和编辑表单。删除动作必须二次确认；保存错误应就地展示，成功后刷新列表。

## 配置与迁移

本地开发和部署需要为 Worker 配置独立的 `ARTICLE_ADMIN_USERNAME` 与 SHA-256 格式的 `ARTICLE_ADMIN_PASSWORD_HASH`。不得将新密码写进前端代码、仓库或现有人才后台常量。生产环境在 Cloudflare Pages 的变量/密钥中配置；本地通过 Wrangler 环境变量或 `.dev.vars` 提供。

现有 D1 数据保持不变。Worker 的 `CREATE TABLE IF NOT EXISTS` 保证首次访问创建文章表与会话表，不依赖手工重建数据库。

## 验收标准

1. 独立后台凭据登录后进入 `/admin`，且不能访问或影响人才市场管理会话。
2. 后台可创建、编辑、删除纯文字 Markdown 文章；新文章保存后立即在公司分析列表与详情页出现。
3. 文章列表卡片和直接 URL 都能进入详情页；缺失 slug 显示 404 状态。
4. Markdown 正文有可辨识的二级/三级标题、段落、列表和加粗，原始 HTML 不会执行。
5. 未登录、跨源或无效输入的写请求被拒绝；文章公开读取不泄露后台信息。
6. 新增的自动化测试覆盖认证隔离、文章 CRUD 校验、公开读取和 Markdown 渲染；生产构建通过。
