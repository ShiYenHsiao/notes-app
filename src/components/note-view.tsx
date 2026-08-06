"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";

import { togglePin, trashNote } from "@/lib/actions/notes";
import type { NoteDetail, TagSummary } from "@/lib/note-display";
import { useAutosave } from "@/lib/use-autosave";

import { MarkdownPreview } from "./markdown-preview";
import { TagBar } from "./tag-bar";
import { VersionHistory } from "./version-history";

// CodeMirror 只在桌機載入。手機是唯讀的，沒必要讓它下載整包編輯器。
const MarkdownEditor = dynamic(
  () => import("./markdown-editor").then((module) => module.MarkdownEditor),
  {
    ssr: false,
    loading: () => <div className="p-6 text-sm text-ink-muted">載入編輯器…</div>,
  },
);

export function NoteView({
  note,
  noteTags,
  allTags,
}: {
  note: NoteDetail;
  noteTags: TagSummary[];
  allTags: TagSummary[];
}) {
  const [content, setContent] = useState(note.content);
  const save = useAutosave(note.id, content, note.updated_at);
  const isDesktop = useIsDesktop();

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-2 text-sm">
        <Link href="/" className="text-ink-muted hover:text-accent md:hidden">
          ← 返回
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <VersionHistory noteId={note.id} />
          <form action={togglePin.bind(null, note.id, !note.pinned)}>
            <button type="submit" className="text-ink-muted hover:text-accent">
              {note.pinned ? "取消釘選" : "釘選"}
            </button>
          </form>
          <form action={trashNote.bind(null, note.id)}>
            <button type="submit" className="text-ink-muted hover:text-accent">
              刪除
            </button>
          </form>
        </div>
      </header>

      {save.status === "conflict" || save.status === "error" ? (
        <div
          role="alert"
          className="flex items-center gap-3 border-b border-line bg-accent-soft px-4 py-2 text-sm"
        >
          <span>{save.message}</span>
          {save.status === "error" ? (
            <button onClick={save.retryNow} className="shrink-0 underline underline-offset-4">
              立刻重試
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-1 overflow-hidden">
        {isDesktop ? (
          <div className="flex-1 border-r border-line bg-surface">
            <MarkdownEditor initialValue={note.content} onChange={setContent} />
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto bg-paper px-6 py-6">
          <MarkdownPreview content={content} />
        </div>
      </div>

      <footer className="flex items-center gap-4 border-t border-line px-4 py-2 text-xs text-ink-muted">
        <div className="min-w-0 flex-1">
          <TagBar noteId={note.id} initialTags={noteTags} allTags={allTags} />
        </div>
        <SaveIndicator status={save.status} />
      </footer>
    </div>
  );
}

const STATUS_LABELS = {
  saved: "已儲存",
  dirty: "未儲存",
  saving: "儲存中…",
  conflict: "有衝突，未儲存",
  error: "儲存失敗",
} as const;

function SaveIndicator({ status }: { status: keyof typeof STATUS_LABELS }) {
  const isProblem = status === "conflict" || status === "error";
  return (
    <span className={isProblem ? "font-semibold text-accent" : undefined}>
      {STATUS_LABELS[status]}
    </span>
  );
}

/**
 * 是不是桌機寬度。
 *
 * 初次渲染一律當成手機（唯讀），掛載後才升級成編輯模式 —— 這樣伺服器端與瀏覽器端
 * 的第一次輸出一致，不會有 hydration mismatch。
 */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(query.matches);

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isDesktop;
}
