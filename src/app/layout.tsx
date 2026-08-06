import type { Metadata, Viewport } from "next";
import { Geist_Mono, Source_Serif_4 } from "next/font/google";

import { themeInitScript } from "@/lib/theme";

import "./globals.css";

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "筆記",
  description: "跨裝置的個人筆記工具",
};

export const viewport: Viewport = {
  // 深淺色主題都做了，讓瀏覽器 UI（網址列）跟著換色
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f3ea" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1815" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className={`${sourceSerif.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        {/* 必須在畫面繪製前同步執行，否則重整時會先閃一下系統主題的顏色 */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
