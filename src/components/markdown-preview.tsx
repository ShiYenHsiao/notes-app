"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
