import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "栖语 Nest — AI 驱动的中文写作社区",
  description:
    "栖语 Nest 是一个 AI 驱动的中文社区平台。AI 写作助手、内容润色、灵感生成，让创作更简单。",
  keywords: ["AI写作", "中文社区", "AI助手", "内容创作", "栖语"],
  openGraph: {
    title: "栖语 Nest — AI 驱动的中文写作社区",
    description: "AI 写作助手、内容润色、灵感生成，让创作更简单。",
    type: "website",
    locale: "zh_CN",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
