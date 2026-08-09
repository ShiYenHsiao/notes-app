"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  formatPrintDate,
  normalizePrintStyle,
  printBodyContent,
  printDisplayTitle,
  printTags,
  type PrintStyle,
} from "@/lib/print-export";
import type { WikiLinkResolution } from "@/lib/wiki-links";

import { MarkdownPreview } from "./markdown-preview";

export function PrintPreview({
  noteId,
  title,
  content,
  tags,
  exportedAt,
  initialStyle = "study",
  wikiLinks,
}: {
  noteId: string;
  title: string | null;
  content: string;
  tags: string[];
  exportedAt: string;
  initialStyle?: PrintStyle;
  wikiLinks: WikiLinkResolution[];
}) {
  const router = useRouter();
  const [style, setStyle] = useState<PrintStyle>(() => normalizePrintStyle(initialStyle));
  const displayTitle = printDisplayTitle(title);
  const metadataTags = printTags(tags);
  const backHref = `/n/${noteId}`;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) {
        router.push(backHref);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [backHref, router]);

  return (
    <main className="print-preview" data-print-style={style}>
      <nav className="print-preview-controls" aria-label="PDF 預覽控制列">
        <Link href={backHref} className="print-preview-back" aria-label="返回筆記">
          ← 返回筆記
        </Link>

        <strong className="print-preview-label">PDF 預覽</strong>

        <div className="print-style-picker" role="group" aria-label="PDF 樣式">
          <span>Style</span>
          {PRINT_STYLES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={style === option.value}
              onClick={() => setStyle(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="print-preview-action"
          aria-label="列印或儲存 PDF"
          onClick={() => window.print()}
        >
          列印 / 儲存 PDF
        </button>
      </nav>

      <div className="print-preview-stage">
        <article className="print-document" aria-label={`${displayTitle} PDF 預覽`}>
          <header className="print-document-header">
            <p className="print-document-brand">NEXUM NOTE</p>
            <h1>{displayTitle}</h1>
            {metadataTags.length > 0 ? (
              <p className="print-document-tags" aria-label="標籤">
                {metadataTags.join("　")}
              </p>
            ) : null}
            <p className="print-document-date">
              匯出日期 <time dateTime={exportedAt}>{formatPrintDate(exportedAt)}</time>
            </p>
          </header>

          {/* 同一個 renderer、同一組 remark/rehype pipeline；列印只換 presentation。 */}
          <MarkdownPreview
            content={printBodyContent(content)}
            imageLoading="eager"
            wikiLinks={wikiLinks}
            interactiveWikiLinks={false}
          />

          <footer className="print-document-footer">NEXUM NOTE</footer>
        </article>
      </div>
    </main>
  );
}

const PRINT_STYLES: { value: PrintStyle; label: string }[] = [
  { value: "study", label: "Study" },
  { value: "clean", label: "Clean" },
];
