"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { rehypeCallout } from "@/lib/rehype-callout";
import { rehypeHeadingIds } from "@/lib/rehype-heading-ids";
import { rehypeHighlight } from "@/lib/rehype-highlight";
import { rehypeWikiLinks, type WikiLinkResolution } from "@/lib/wiki-links";

/**
 * 右欄的渲染結果，手機唯讀模式也用同一個元件。
 *
 * react-markdown 預設不渲染原始 HTML，所以內文裡的 <script> 之類的東西只會被當成文字，
 * 不需要另外接消毒套件。
 */
export function MarkdownPreview({
  content,
  imageLoading = "lazy",
  wikiLinks = [],
  interactiveWikiLinks = true,
  onOpenWikiLink,
  onUnresolvedWikiLink,
}: {
  content: string;
  imageLoading?: "lazy" | "eager";
  wikiLinks?: WikiLinkResolution[];
  interactiveWikiLinks?: boolean;
  onOpenWikiLink?: (noteId: string) => void;
  onUnresolvedWikiLink?: (title: string, ambiguous: boolean) => void;
}) {
  if (!content.trim()) {
    return <p className="text-sm text-ink-muted">還沒有內容。</p>;
  }

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // callout 要先跑：它會把 blockquote 換成 div，換完再讓螢光筆處理裡面的文字
        rehypePlugins={[
          rehypeCallout,
          rehypeHighlight,
          [rehypeWikiLinks, { resolutions: wikiLinks, interactive: interactiveWikiLinks }],
          rehypeHeadingIds,
        ]}
        components={{
          img: ({ src, alt }) => (
            <Image src={src} alt={alt ?? ""} loading={imageLoading} />
          ),
          a: ({ href, children, className, ...props }) => {
            const wikiTitle = stringProperty(props, "data-wiki-title");
            if (!wikiTitle) {
              return (
                <a href={href} className={className}>
                  {children}
                </a>
              );
            }

            const targetId = stringProperty(props, "data-wiki-target");
            const ambiguous = stringProperty(props, "data-wiki-status") === "ambiguous";
            return (
              <a
                href={href}
                className={className}
                aria-label={stringProperty(props, "aria-label")}
                data-wiki-title={wikiTitle}
                data-wiki-target={targetId}
                data-wiki-status={stringProperty(props, "data-wiki-status")}
                onClick={(event) => {
                  if (targetId) {
                    if (onOpenWikiLink) {
                      event.preventDefault();
                      onOpenWikiLink(targetId);
                    }
                    return;
                  }
                  event.preventDefault();
                  onUnresolvedWikiLink?.(wikiTitle, ambiguous);
                }}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function stringProperty(properties: object, name: string): string | undefined {
  const value = (properties as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
}

/**
 * 圖片。
 *
 * 網址還沒打完的 `![]()` 會產生 `<img src="">`，瀏覽器看到空的 src 會把整頁再抓一次，
 * React 也會警告。邊打字邊預覽的情況下這是常態而不是例外，所以擋在這裡。
 */
function Image({
  src,
  alt,
  loading,
}: {
  src?: string | Blob;
  alt?: string;
  loading: "lazy" | "eager";
}) {
  if (typeof src !== "string" || !src.trim()) {
    return <span className="text-ink-muted">{alt?.trim() || "（圖片）"}</span>;
  }

  // 附件是 Supabase Storage 上的任意網址，用 next/image 得先設 remotePatterns，
  // 而且我們也不需要它的最佳化 —— 圖片在上傳前就壓過了。
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt ?? ""} loading={loading} />;
}
