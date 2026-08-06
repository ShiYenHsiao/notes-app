"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { togglePin, trashNote } from "@/lib/actions/notes";
import type { NoteDetail, TagSummary } from "@/lib/note-display";
import { useAutosave } from "@/lib/use-autosave";
import { useImageUpload } from "@/lib/use-image-upload";

import { EditorToolbar } from "./editor-toolbar";
import { IconPin, IconTrash } from "./icons";
import type { EditorApi } from "./markdown-editor";
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
  userId,
}: {
  note: NoteDetail;
  noteTags: TagSummary[];
  allTags: TagSummary[];
  userId: string;
}) {
  const [content, setContent] = useState(note.content);
  const save = useAutosave(note.id, content, note.updated_at);
  const isDesktop = useIsDesktop();

  const editorApi = useRef<EditorApi | null>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string>();

  const uploadFiles = useImageUpload(note.id, userId, {
    onStart: (placeholder) => {
      setUploadError(undefined);
      editorApi.current?.insertAtCursor(placeholder);
    },
    onFinish: (placeholder, replacement) =>
      editorApi.current?.replaceFirst(placeholder, replacement),
    onError: setUploadError,
  });

  const [viewMode, setViewMode] = useState<ViewMode>("split");

  // ⌘1 / ⌘2 / ⌘3 切換三種檢視。這些鍵瀏覽器沒有佔用，攔得下來。
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.metaKey || event.shiftKey || event.altKey) {
        return;
      }
      const mode = VIEW_MODE_KEYS[event.key];
      if (mode) {
        event.preventDefault();
        setViewMode(mode);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const showEditor = isDesktop && viewMode !== "preview";
  const showPreview = !isDesktop || viewMode !== "editor";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-2 text-sm">
        <Link href="/" className="text-ink-muted hover:text-accent md:hidden">
          ← 返回
        </Link>

        <div className="ml-auto flex items-center gap-0.5">
          <VersionHistory noteId={note.id} />

          <form action={togglePin.bind(null, note.id, !note.pinned)}>
            <button
              type="submit"
              title={note.pinned ? "取消釘選" : "釘選到列表最上面"}
              aria-label={note.pinned ? "取消釘選" : "釘選"}
              aria-pressed={note.pinned}
              className={`flex size-7 items-center justify-center rounded-md transition-colors hover:bg-accent-soft ${
                note.pinned ? "text-accent" : "text-ink-muted hover:text-accent"
              }`}
            >
              <IconPin />
            </button>
          </form>

          {/* 刪除跟其他操作隔開，減少手滑的機會 */}
          <span className="mx-1.5 h-4 w-px bg-line" aria-hidden />

          <form action={trashNote.bind(null, note.id)}>
            <button
              type="submit"
              title="丟進垃圾桶（可還原）"
              aria-label="刪除"
              className="flex size-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger"
            >
              <IconTrash />
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

      {isDesktop ? (
        <EditorToolbar api={editorApi} onOpenImagePicker={() => filePicker.current?.click()} />
      ) : null}

      {uploadError ? (
        <div
          role="alert"
          className="flex items-center gap-3 border-b border-line bg-accent-soft px-4 py-2 text-sm"
        >
          <span className="flex-1">{uploadError}</span>
          <button
            onClick={() => setUploadError(undefined)}
            className="shrink-0 underline underline-offset-4"
          >
            關閉
          </button>
        </div>
      ) : null}

      <div className="flex flex-1 overflow-hidden">
        {showEditor ? (
          <div className={`${showPreview ? "flex-1 border-r border-line" : "w-full"} bg-surface`}>
            <MarkdownEditor
              initialValue={note.content}
              onChange={setContent}
              onFiles={uploadFiles}
              onSaveRequest={save.saveNow}
              apiRef={editorApi}
            />
          </div>
        ) : null}

        {showPreview ? (
          <div className="flex-1 overflow-y-auto bg-paper px-6 py-6">
            <MarkdownPreview content={content} />
          </div>
        ) : null}
      </div>

      {/* 工具列的圖片按鈕走這個，跟貼上／拖曳共用同一條上傳流程 */}
      <input
        ref={filePicker}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) {
            uploadFiles(files);
          }
          // 清掉才能連續選同一個檔案
          event.target.value = "";
        }}
      />

      <footer className="flex items-center gap-4 border-t border-line px-4 py-2 text-xs text-ink-muted">
        <div className="min-w-0 flex-1">
          <TagBar noteId={note.id} initialTags={noteTags} allTags={allTags} />
        </div>
        <SaveIndicator status={save.status} />
      </footer>
    </div>
  );
}

type ViewMode = "editor" | "split" | "preview";

/** ⌘1 只看編輯、⌘2 左右分割、⌘3 只看預覽 —— 對齊 README 的快捷鍵表。 */
const VIEW_MODE_KEYS: Record<string, ViewMode | undefined> = {
  "1": "editor",
  "2": "split",
  "3": "preview",
};

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
