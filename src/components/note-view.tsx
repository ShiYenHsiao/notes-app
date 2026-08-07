"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { togglePin, trashNote } from "@/lib/actions/notes";
import { titleFromContent, type NoteDetail, type TagSummary } from "@/lib/note-display";
import { useAutosave } from "@/lib/use-autosave";
import { useImageUpload } from "@/lib/use-image-upload";
import { useReportSaveStatus } from "@/lib/workspace-status";

import { EditorToolbar } from "./editor-toolbar";
import { IconPin, IconTrash } from "./icons";
import type { EditorApi } from "./markdown-editor";
import { MarkdownPreview } from "./markdown-preview";
import { TagBar } from "./tag-bar";
import { Tooltip } from "./tooltip";
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
  const [content, setContent, latestContent] = useCoalescedState(note.content);
  const save = useAutosave(note.id, content, note.updated_at, latestContent);
  const isDesktop = useIsDesktop();

  // 分頁列靠這個顯示「還沒存」的點
  useReportSaveStatus(note.id, save.status);

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

  // 標題即時從內文推導，跟資料庫的 generated column 同一套規則
  const title = titleFromContent(content);

  return (
    <div className="flex h-full flex-col">
      {/*
        筆記的 metadata 區：標題與標籤在內容上方，用一條分隔線跟內容隔開。
        標籤是**資料庫欄位而不是內文的一部分**，所以它屬於這裡，不屬於編輯區裡面。
      */}
      <header className="shrink-0 border-b border-line px-5 pt-3 pb-2.5">
        <div className="flex items-center gap-3">
          <Link href="/" className="shrink-0 text-sm text-ink-muted hover:text-accent md:hidden">
            ← 返回
          </Link>

          <h1
            className={`min-w-0 flex-1 truncate text-lg font-semibold ${
              title ? "" : "text-ink-muted"
            }`}
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {title ?? "無標題"}
          </h1>

          <div className="flex shrink-0 items-center gap-0.5">
            <VersionHistory noteId={note.id} />

            <Tooltip label={note.pinned ? "取消釘選" : "釘選到列表最上面"}>
              <form action={togglePin.bind(null, note.id, !note.pinned)}>
                <button
                  type="submit"
                  aria-label={note.pinned ? "取消釘選" : "釘選"}
                  aria-pressed={note.pinned}
                  className={`flex size-8 items-center justify-center rounded-md transition-colors duration-150 hover:bg-accent-soft ${
                    note.pinned ? "text-gold" : "text-ink-muted hover:text-accent"
                  }`}
                >
                  <IconPin />
                </button>
              </form>
            </Tooltip>

            {/* 刪除跟其他操作隔開，減少手滑的機會 */}
            <span className="mx-1.5 h-4 w-px bg-line" aria-hidden />

            {/* 刪的是正在看的這篇，所以刪完要離開它（goHome = true） */}
            <Tooltip label="丟進垃圾桶" shortcut="可還原">
              <form action={trashNote.bind(null, note.id, true)}>
                <button
                  type="submit"
                  aria-label="刪除"
                  className="flex size-8 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 hover:bg-danger-soft hover:text-danger"
                >
                  <IconTrash />
                </button>
              </form>
            </Tooltip>
          </div>
        </div>

        <div className="mt-1.5">
          <TagBar noteId={note.id} initialTags={noteTags} allTags={allTags} />
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

      {/*
        分割模式下兩欄各半。min-w-0 是必要的：flex 項目的預設 min-width 是 auto，
        少了它，長網址或寬表格會把欄位撐開而讓整頁出現水平捲軸。
      */}
      <div className="flex min-w-0 flex-1 overflow-hidden">
        {showEditor ? (
          <div
            className={`min-w-0 bg-surface ${
              showPreview ? "flex-1 basis-1/2 border-r border-line" : "w-full"
            }`}
          >
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
          <div
            className={`min-w-0 overflow-y-auto bg-paper px-8 py-8 ${
              showEditor ? "flex-1 basis-1/2" : "w-full"
            }`}
          >
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

      <footer className="flex shrink-0 items-center justify-end gap-4 border-t border-line px-5 py-1.5 text-xs text-ink-muted">
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

/** 把連續的輸入合併成一次更新的間隔。 */
const COALESCE_MS = 120;

/**
 * 跟 useState 一樣用，但連續的 setter 呼叫會被合併成一次更新。
 *
 * CodeMirror 每個 transaction 都會回呼一次，直接接 setState 有兩個問題：
 * 每按一個鍵就重繪整個編輯畫面並把整份文件重新 parse 一次；而快速輸入時
 * 這些更新是在 MutationObserver 的 flush 裡同步發生的，會撞到 React
 * 的巢狀更新上限而整個中斷。
 *
 * 合併之後預覽最多慢 120ms，感覺不出來，但按鍵不再跟重繪綁在一起。
 */
function useCoalescedState(
  initial: string,
): [string, (value: string) => void, React.RefObject<string>] {
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 永遠是最新的內容，不受合併延遲影響。卸載時的補存靠它。
  const latest = useRef(initial);

  const push = useCallback((next: string) => {
    latest.current = next;

    if (timer.current !== null) {
      return;
    }

    timer.current = setTimeout(() => {
      timer.current = null;
      setValue(latest.current);
    }, COALESCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  return [value, push, latest];
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
