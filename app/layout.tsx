import type { Metadata } from "next";
import "../tokens.css";
import "./globals.css";
import "./recommendation-badge.css";
import "./business-overrides.css";
import "./home-light.css";
import "./app-light.css";
import "./color-reset.css";
import "./matrix-title.css";
import "./talent-detail.css";
import "./practical-tools.css";
import "./analysis-list.css";
import "./responsive-fixes.css";
import "./site-updates.css";
import "./matrix-explorer.css";
import "./research-archive.css";
import "./business-collaboration.css";
import "./module-typography.css";
import "./company-map.css";
import "./company-regions.css";
import "./admin-layout.css";
import "./site-navigation.css";
import "./interaction-refresh.css";
import "./business-editorial.css";
import "./atlas-overview.css";
import "./modal-overlay.css";
import "./home-editorial.css";
import "./primary-page-motion.css";
import "./hot-list.css";
import "./heading-spacing.css";
import "./daily-markdown.css";

export const metadata: Metadata = {
  title: "小骆｜社交产品资讯与资源网络",
  description: "小骆的社交产品观察、内容笔记与行业资源网络。",
  icons: {
    icon: "/optimized/favicon.webp",
    shortcut: "/optimized/favicon.webp",
    apple: "/optimized/favicon.webp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
