"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { rehypeHighlight } from "@/lib/rehype-highlight";

/**
 * 右欄的渲染結果，手機唯讀模式也用同一個元件。
 *
 * react-markdown 預設不渲染原始 HTML，所以內文裡的 <script> 之類的東西只會被當成文字，
 * 不需要另外接消毒套件。
 */
export function MarkdownPreview({ content }: { content: string }) {
  if (!content.trim()) {
    return <p className="text-sm text-ink-muted">還沒有內容。</p>;
  }

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{ img: Image }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * 圖片。
 *
 * 網址還沒打完的 `![]()` 會產生 `<img src="">`，瀏覽器看到空的 src 會把整頁再抓一次，
 * React 也會警告。邊打字邊預覽的情況下這是常態而不是例外，所以擋在這裡。
 */
function Image({ src, alt }: { src?: string | Blob; alt?: string }) {
  if (typeof src !== "string" || !src.trim()) {
    return <span className="text-ink-muted">{alt?.trim() || "（圖片）"}</span>;
  }

  // 附件是 Supabase Storage 上的任意網址，用 next/image 得先設 remotePatterns，
  // 而且我們也不需要它的最佳化 —— 圖片在上傳前就壓過了。
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt ?? ""} loading="lazy" />;
}
