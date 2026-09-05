import type { Metadata } from "next";
import "../tokens.css";
import "./globals.css";
import "./business-overrides.css";
import "./home-light.css";
import "./app-light.css";
import "./color-reset.css";
import "./matrix-title.css";
import "./talent-detail.css";
import "./practical-tools.css";
import "./analysis-list.css";

export const metadata: Metadata = {
  title: "小骆｜社交产品资讯与资源网络",
  description: "小骆的社交产品观察、内容笔记与行业资源网络。",
  icons: {
    icon: "/favicon.webp",
    shortcut: "/favicon.webp",
    apple: "/favicon.webp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
