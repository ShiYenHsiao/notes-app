import type { Metadata, Viewport } from "next";

import { themeInitScript } from "@/lib/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: "NEXUM NOTE",
  description: "為法律考生與法律工作者設計的知識管理筆記工具",
};

export const viewport: Viewport = {
  // 深淺色主題都做了，讓瀏覽器 UI（網址列）跟著換色
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e8e4da" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1017" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // 字體全部走系統堆疊（PingFang TC / Georgia），不載 webfont。
    // CJK webfont 動輒好幾 MB，而且首次載入前會先閃一次 fallback 字體。
    // suppressHydrationWarning：下面那段腳本會在 React 接手前把主題 class 加到 <html>，
    // 所以伺服器與瀏覽器的 className 本來就會不一樣。這是刻意的，不是錯誤。
    // 只作用於這個元素本身的屬性，不會蓋掉子樹裡真正的 mismatch。
    <html lang="zh-Hant" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* 必須在畫面繪製前同步執行，否則重整時會先閃一下系統主題的顏色 */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
