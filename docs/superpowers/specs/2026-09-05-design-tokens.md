# 小骆官网设计令牌统一方案

## 目标

把全站反复使用的颜色、间距、圆角、字体和卡片交互集中到一个可维护的 `tokens.css`，使不同页面从同一数值来源取值。保持现有内容、页面结构和交互流程不变，延续克制、可信的行业编辑绿色体系。

## 设计方向

- 受众：出海社交、直播、语聊行业的产品、运营与商业化从业者。
- 核心用途：阅读行业研究，同时承接资源连接与商务合作。
- 风格：专业、克制、可信、清爽、有行业编辑感。
- 页面结构：保留现有编辑型信息架构，不进行布局重做。
- 品牌色：克制的行业编辑绿；不用高饱和荧光色，不使用装饰性渐变。

## 令牌

令牌使用 CSS 自定义属性，并以用途命名。品牌色保留当前已确认色值，文字与中性色使用 OKLCH，便于后续稳定调整亮度和色度。

```css
:root {
  /* Color */
  --color-brand: #25866c;
  --color-brand-strong: #17614f;
  --color-brand-soft: #e8f5ee;
  --color-text: oklch(25% 0.018 245);
  --color-muted: oklch(50% 0.018 245);
  --color-border: oklch(90% 0.012 245);
  --color-page: #ffffff;
  --color-surface: #ffffff;
  --color-surface-subtle: oklch(97% 0.008 245);
  --color-highlight: #eaf7f1;
  --color-highlight-border: #cfe8dc;
  --color-selection-bg: #cfe8dc;
  --color-selection-text: #17614f;
  --color-overlay: rgba(12, 37, 29, .45);
  --color-danger: #b42318;
  --color-danger-border: #f1c5c1;

  /* Spacing */
  --space-tight: 8px;
  --space-content: 16px;
  --space-component: 24px;
  --space-section: 40px;

  /* Radius */
  --radius-control: 8px;
  --radius-card: 12px;

  /* Typography */
  --font-sans: Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-size-display: 48px;
  --font-size-display-mobile: 38px;
  --font-size-section: 36px;
  --font-size-section-mobile: 30px;
  --font-size-card: 24px;
  --font-size-card-mobile: 21px;
  --font-size-article-title: 34px;
  --font-size-article-title-mobile: 30px;
  --line-height-display: 1.12;
  --line-height-section: 1.2;
  --line-height-card: 1.35;
  --line-height-article-title: 1.22;

  /* Card interaction */
  --motion-duration: .2s;
  --motion-lift: translateY(-3px);
  --shadow-card-hover: 0 12px 26px color-mix(in oklch, var(--color-brand-strong) 8%, transparent);
}
```

圆形头像、悬浮社群按钮继续使用 `50%`；胶囊标签继续使用 `999px`。它们表达明确形状，不纳入普通圆角档位。

## 文件与加载顺序

1. 在项目根目录创建 `tokens.css`，作为基础视觉数值的唯一来源。
2. 在 `app/layout.tsx` 的首个样式导入位置加载 `../tokens.css`。
3. 保留现有页面样式文件的职责，不合并或删除文件。
4. 将 `home-*`、`app-*` 等旧变量改成指向新语义令牌的兼容别名，避免一次性大范围改写造成视觉漂移。
5. 新代码直接使用新的语义令牌；现有高频规则逐步替换为新令牌。

## 迁移规则

### 颜色

- 主要按钮、文字链接、活动导航和输入框焦点使用 `--color-brand`。
- 强调文字及按钮悬停使用 `--color-brand-strong`。
- 浏览器文字选中态使用 `--color-selection-bg` 与 `--color-selection-text`，保证反差清晰。
- 大面积高亮区块使用 `--color-highlight` 和 `--color-highlight-border`，小型弱提示背景使用 `--color-brand-soft`。
- 标题与正文使用 `--color-text`，辅助信息使用 `--color-muted`。
- 分隔线和卡片描边使用 `--color-border`。
- 页面与卡片使用两个 surface 令牌，不新增没有语义的一次性色彩令牌。

### 间距

- `--space-tight`：图标与文字、标签内部等紧密关系。
- `--space-content`：同一内容组内的标题、正文和操作间距。
- `--space-component`：卡片内边距及并列组件间距。
- `--space-section`：页面主要区块及文章卡片之间的间距。
- 只替换承担这些明确职责的值；只出现一次的排版校准值继续留在局部样式中。

### 圆角

- 输入框、按钮和小型控件使用 `--radius-control`。
- 卡片、弹窗和大型内容容器使用 `--radius-card`。
- 不通过增加阴影或渐变弥补层级问题，继续依靠字体层级、描边和留白区分内容。

### 字体与交互

- 全站正文、标题、按钮与表单统一使用 `--font-sans`，不混用衬线体。
- 可交互卡片统一使用 `--motion-duration`、`--motion-lift` 和 `--shadow-card-hover`。
- 卡片 hover 统一为品牌色描边、上移 3px 和轻阴影；触屏设备不强制 hover 效果。

## 实施边界

- 不改变任何页面文案和数据。
- 不改变路由、API、Cloudflare 绑定或后台功能。
- 不新增依赖。
- 不合并、删除现有生产样式文件。
- 不把每个偶发像素值都转换成令牌，避免令牌膨胀。
- 本轮仅做本地修改与预览，得到明确发布授权后才推送生产。

## 验证

1. 自动测试检查令牌文件存在、核心令牌完整、旧色彩变量只作为兼容别名引用统一源值。
2. 运行完整构建与现有测试套件。
3. 对首页、公司分析、出海矩阵、人才市场、商务合作、文章阅读页和后台页面进行视觉抽查。
4. 在 320、375、414、768 像素宽度检查无横向溢出、主要操作不折行、弹窗和卡片布局正常。
5. 本地预览确认绿色强调仅承担可操作或状态含义，没有无用途的装饰性色块。

## 完成标准

- 修改任一核心颜色、四档间距、两档圆角、全站字体或卡片交互令牌时，所有引用组件同步变化。
- 页面不再维护多套互相重复的实际品牌色值。
- 现有功能和内容保持不变。
- 自动测试全部通过，目标视口无明显视觉回归。
