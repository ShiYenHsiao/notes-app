"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { quickCreateKnowledgeNote } from "@/lib/actions/knowledge";
import { resolveKnowledgeLinks } from "@/lib/knowledge-client";
import { togglePin, trashNote } from "@/lib/actions/notes";
import type { BacklinkItem } from "@/lib/knowledge";
import { titleFromContent, type NoteDetail, type TagSummary } from "@/lib/note-display";
import { headingAnchorId, parseOutline, type OutlineItem } from "@/lib/outline";
import { printPath } from "@/lib/print-export";
import { useActiveHeading } from "@/lib/use-active-heading";
import { useAutosave } from "@/lib/use-autosave";
import { useImageUpload } from "@/lib/use-image-upload";
import { useScrollSync } from "@/lib/use-scroll-sync";
import { useFocusMode } from "@/lib/workspace-focus";
import { useReportSaveStatus } from "@/lib/workspace-status";
import {
  uniqueWikiTitles,
  replaceMarkdownTitle,
  type WikiLinkResolution,
} from "@/lib/wiki-links";

import { ContextMenu, useContextMenu } from "./context-menu";
import { EditorToolbar } from "./editor-toolbar";
import {
  IconEditorView,
  IconFocus,
  IconMore,
  IconOutline,
  IconPreviewView,
  IconSplitView,
} from "./icons";
import type { EditorApi } from "./markdown-editor";
import { MarkdownPreview } from "./markdown-preview";
import { OutlinePanel } from "./outline-panel";
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
  initialWikiLinks,
  backlinks,
  backlinksError,
}: {
  note: NoteDetail;
  noteTags: TagSummary[];
  allTags: TagSummary[];
  userId: string;
  initialWikiLinks: WikiLinkResolution[];
  backlinks: BacklinkItem[];
  backlinksError: string | null;
}) {
  const [content, setContent, latestContent] = useCoalescedState(note.content);
  const save = useAutosave(note.id, content, note.updated_at, latestContent);
  const isDesktop = useIsDesktop();
  const router = useRouter();
  const wikiLinks = useWikiLinkResolutions(content, initialWikiLinks);
  const [pendingWikiTitle, setPendingWikiTitle] = useState<{
    title: string;
    ambiguous: boolean;
  } | null>(null);

  // 分頁列靠這個顯示「還沒存」的點
  useReportSaveStatus(note.id, save.status);

  const editorApi = useRef<EditorApi | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  // 編輯器是動態載入的，apiRef 要等它掛好才有東西 —— 捲動同步靠這個決定何時接事件
  const [editorReady, setEditorReady] = useState(false);
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
  const { focused, toggle: toggleFocus } = useFocusMode();

  // ⌘1 / ⌘2 / ⌘3 切換三種檢視、⌘⇧I 插入圖片。這些鍵瀏覽器沒有佔用，攔得下來。
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.metaKey || event.altKey) {
        return;
      }

      // 工具列上一直寫著 ⌘⇧I，但以前沒有人綁它 —— 現在它是真的了
      if (event.shiftKey) {
        if (event.key.toLowerCase() === "i") {
          event.preventDefault();
          filePicker.current?.click();
        }
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

  /*
   * 大綱的開關兩種模式各記一份。
   *
   * 專注模式那份預設是關的（進去就是要清場），但使用者仍然可以手動打開；一般模式
   * 那份完全不受影響，所以退出專注模式時自然就回到原本的樣子 —— 不需要進場拍快照、
   * 退場還原，也就不需要在 effect 裡改 state。
   *
   * 其他狀態（側邊欄收合、檢視模式、捲動與游標）都只是被藏起來，底下沒有被動過。
   */
  const [outlineOpenNormal, setOutlineOpenNormal] = useState(false);
  const [outlineOpenFocus, setOutlineOpenFocus] = useState(false);
  const outlineOpen = focused ? outlineOpenFocus : outlineOpenNormal;
  const setOutlineOpen = focused ? setOutlineOpenFocus : setOutlineOpenNormal;

  const outline = parseOutline(content);

  useScrollSync({
    editorApi,
    preview: previewRef,
    outline,
    // 只有分割模式才有對象可以同步
    enabled: editorReady && showEditor && showPreview,
  });

  // 大綱上的「現在讀到這裡」。只有預覽區在畫面上時判斷得出來。
  const activeHeading = useActiveHeading(previewRef, outline, outlineOpen && showPreview);

  /*
   * 點大綱時兩邊一起跳：編輯器把游標移到那一行，預覽區捲到對應的標題。
   * 只做其中一邊的話，在分割模式下另一半就停在原處，反而更難對照。
   */
  function goToHeading(item: OutlineItem) {
    editorApi.current?.revealLine(item.line);
    document
      .getElementById(headingAnchorId(item.index))
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="relative flex h-full flex-col" data-focus-mode={focused || undefined}>
      {/*
        筆記的 metadata 區：標題與標籤在內容上方，用一條分隔線跟內容隔開。
        標籤是**資料庫欄位而不是內文的一部分**，所以它屬於這裡，不屬於編輯區裡面。
      */}
      <header
        className={`shrink-0 border-b border-line bg-paper/80 transition-[padding] duration-200 ease-out ${
          focused ? "px-6 pt-2.5 pb-2" : "px-5 pt-3 pb-2.5"
        }`}
      >
        <div className="flex items-center gap-3">
          <Link href="/" className="shrink-0 text-sm text-ink-muted hover:text-accent md:hidden">
            ← 返回
          </Link>

          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <h1
              className={`min-w-0 truncate text-lg font-semibold ${
                title ? "" : "text-ink-muted"
              }`}
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {title ?? "無標題"}
            </h1>

            {focused ? (
              <span className="shrink-0 rounded-sm bg-accent-soft px-1.5 py-0.5 text-2xs font-semibold tracking-[0.08em] text-accent">
                專注
              </span>
            ) : null}
          </div>

          {isDesktop ? <ViewModeControl value={viewMode} onChange={setViewMode} /> : null}

          {/*
            高頻的留在檯面上（大綱、專注模式），低頻的收進 ⋯：
            版本紀錄、釘選、刪除加起來一週用不到幾次，卻佔著標題列一半的寬度。
          */}
          <div className="flex shrink-0 items-center gap-0.5">
            {isDesktop ? (
              <>
                <HeaderButton
                  label={outlineOpen ? "關閉大綱" : "大綱"}
                  ariaLabel="大綱"
                  pressed={outlineOpen}
                  onClick={() => setOutlineOpen((open) => !open)}
                >
                  <IconOutline />
                </HeaderButton>

                <HeaderButton
                  label="專注模式"
                  shortcut="⌘⇧F"
                  ariaLabel="專注模式"
                  pressed={focused}
                  onClick={toggleFocus}
                >
                  <IconFocus />
                </HeaderButton>
              </>
            ) : null}

            {/* 版本紀錄自己帶一個面板，維持獨立按鈕；釘選與刪除收進選單 */}
            <VersionHistory noteId={note.id} />

            <NoteActionsMenu
              noteId={note.id}
              pinned={note.pinned}
              canPrint={!save.hasUnsavedChanges}
              onPin={() => void togglePin(note.id, !note.pinned)}
              onTrash={() => void trashNote(note.id, true)}
            />
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

      {save.status === "rename" && save.rename ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="確認筆記改名"
          className="fixed inset-0 z-[90] grid place-items-center bg-ink/20 p-5 backdrop-blur-[1px]"
        >
          <section className="w-full max-w-md rounded-sm border border-gold/25 bg-surface p-5 shadow-[var(--shadow-pop)]">
            <p className="eyebrow">Rename Knowledge Links</p>
            <h2 className="mt-2 font-serif text-lg font-semibold">確認筆記改名</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              將「{save.rename.oldTitle}」改為「{save.rename.newTitle}」，並原子更新
              {save.rename.sourceCount} 篇來源筆記中的精確 Wiki Link。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setContent(replaceMarkdownTitle(content, save.rename!.oldTitle));
                  save.cancelRename();
                }}
                className="rounded-sm px-3 py-1.5 text-sm text-ink-muted hover:bg-list"
              >
                取消改名
              </button>
              <button
                type="button"
                onClick={save.confirmRename}
                className="rounded-sm bg-accent px-3 py-1.5 text-sm font-medium text-white"
              >
                更新連結並改名
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {/* 只看預覽時沒有編輯器可以操作，工具列就不該佔一整條 */}
      {isDesktop && showEditor ? (
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
      <div className="relative flex min-w-0 flex-1 overflow-hidden">
        {showEditor ? (
          /*
           * 分割時 45 / 55 —— 這是法律學習工具，讀比寫原始語法重要一點。
           * 只有編輯區時給它一個置中的書寫欄（寬度由 --editor-measure 控制，
           * 編輯器的主題會讀它），不然在 27 吋螢幕上一行會拉到一千多 px。
           */
          <div
            className={`min-w-0 bg-surface transition-[flex-basis] duration-200 ease-out ${
              showPreview
                ? "flex-1 basis-[45%] border-r border-line/80"
                : // 置中的是整個編輯器（含行號）而不是只有文字 —— 只置中文字的話，
                  // 行號會貼在視窗最左邊，跟它標示的那一行隔著半個螢幕
                  "mx-auto w-full max-w-[60rem]"
            }`}
            style={
              showPreview ? undefined : ({ "--editor-measure": "100%" } as React.CSSProperties)
            }
          >
            <MarkdownEditor
              initialValue={note.content}
              onChange={setContent}
              onFiles={uploadFiles}
              onSaveRequest={save.saveNow}
              onReady={() => setEditorReady(true)}
              apiRef={editorApi}
              wikiLinks={wikiLinks}
            />
          </div>
        ) : null}

        {showPreview ? (
          /* 只有預覽時給它更多上下呼吸空間，那是真正的閱讀模式 */
          <div
            ref={previewRef}
            className={`min-w-0 overflow-y-auto bg-paper px-6 transition-[flex-basis,padding] duration-200 ease-out lg:px-8 ${
              showEditor ? "flex-1 basis-[55%] py-8" : focused ? "w-full py-16" : "w-full py-10"
            }`}
          >
            <MarkdownPreview
              content={content}
              wikiLinks={wikiLinks}
              onOpenWikiLink={(targetId) => router.push(`/n/${targetId}`)}
              onUnresolvedWikiLink={(wikiTitle, ambiguous) =>
                setPendingWikiTitle({ title: wikiTitle, ambiguous })
              }
            />
            <Backlinks
              items={backlinks}
              error={backlinksError}
              onOpen={(sourceId) => router.push(`/n/${sourceId}`)}
            />
          </div>
        ) : null}

        {isDesktop ? (
          <OutlinePanel
            items={outline}
            open={outlineOpen}
            activeIndex={activeHeading}
            onSelect={goToHeading}
          />
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

      {focused ? (
        /*
         * 專注模式沒有頁尾，存檔狀態改成浮在右下角的一行小字。
         * 它是背景資訊，只有出問題時才該搶注意力。
         */
        <div className="pointer-events-none absolute right-5 bottom-3 z-10 text-sm">
          <SaveIndicator status={save.status} />
        </div>
      ) : (
        <footer className="flex shrink-0 items-center justify-end gap-4 border-t border-line px-5 py-1.5 text-xs">
          <SaveIndicator status={save.status} />
        </footer>
      )}

      {pendingWikiTitle ? (
        <WikiLinkDialog
          sourceNoteId={note.id}
          title={pendingWikiTitle.title}
          ambiguous={pendingWikiTitle.ambiguous}
          onClose={() => setPendingWikiTitle(null)}
          onOpen={(targetId) => {
            setPendingWikiTitle(null);
            router.push(`/n/${targetId}`);
          }}
        />
      ) : null}
    </div>
  );
}

function Backlinks({
  items,
  error,
  onOpen,
}: {
  items: BacklinkItem[];
  error: string | null;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="mt-12 border-t border-line pt-6" aria-labelledby="backlinks-title">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="backlinks-title" className="font-sans text-sm font-semibold text-ink">
          Linked References
        </h2>
        <span className="font-sans text-2xs text-ink-muted">{items.length} 篇來源</span>
      </div>

      {error ? (
        <p role="status" className="font-sans text-sm text-danger">
          {error}
        </p>
      ) : items.length === 0 ? (
        <p className="font-sans text-sm text-ink-muted">目前沒有其他筆記連到這裡。</p>
      ) : (
        <ul className="grid gap-2.5">
          {items.map((item) => (
            <li key={item.sourceId}>
              <button
                type="button"
                onClick={() => onOpen(item.sourceId)}
                className="w-full rounded-sm border border-line bg-surface/55 px-3 py-2.5 text-left transition-colors hover:border-accent/35 hover:bg-accent-soft/35"
              >
                <b className="block truncate font-sans text-sm font-semibold text-accent">
                  {item.sourceTitle}
                </b>
                {item.contexts.map((context) => (
                  <span
                    key={context}
                    className="mt-1 block line-clamp-2 font-sans text-xs leading-relaxed text-ink-muted"
                  >
                    <BacklinkContext value={context} />
                  </span>
                ))}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BacklinkContext({ value }: { value: string }) {
  const match = /\[\[[^\]]+\]\]/.exec(value);
  if (!match || match.index === undefined) {
    return value;
  }

  const before = value.slice(0, match.index);
  const after = value.slice(match.index + match[0].length);
  return (
    <>
      {before}
      <mark className="rounded-[2px] bg-accent-soft px-0.5 text-inherit">{match[0]}</mark>
      {after}
    </>
  );
}

function WikiLinkDialog({
  sourceNoteId,
  title,
  ambiguous,
  onClose,
  onOpen,
}: {
  sourceNoteId: string;
  title: string;
  ambiguous: boolean;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function create() {
    startTransition(async () => {
      setError(undefined);
      const result = await quickCreateKnowledgeNote(sourceNoteId, title);
      if (result.status === "created" || result.status === "existing") {
        onOpen(result.noteId);
        return;
      }
      setError("message" in result ? result.message : "建立筆記失敗。");
    });
  }

  return (
    <div
      className="absolute inset-0 z-50 grid place-items-center bg-ink/15 p-5 backdrop-blur-[1px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="wiki-create-title"
        className="w-full max-w-sm rounded-sm border border-line bg-surface p-5 shadow-[var(--shadow-pop)]"
      >
        <p className="eyebrow">Knowledge Link</p>
        <h2 id="wiki-create-title" className="mt-2 font-serif text-lg font-semibold">
          {ambiguous ? "同名筆記無法解析" : "建立連結目標？"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          {ambiguous
            ? `「${title}」目前對應多篇筆記。v1 的 [[Title]] 沒有 id 或 alias，不能安全地任選其中一篇。`
            : `目前找不到「${title}」。確認後會建立一篇以此為標題的新筆記，原 Markdown 不會改成 UUID。`}
        </p>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm px-3 py-1.5 text-sm text-ink-muted hover:bg-list"
          >
            關閉
          </button>
          {!ambiguous ? (
            <button
              type="button"
              onClick={create}
              disabled={pending}
              className="rounded-sm bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-55"
            >
              {pending ? "建立中…" : `建立「${title}」`}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function useWikiLinkResolutions(
  content: string,
  initial: WikiLinkResolution[],
): WikiLinkResolution[] {
  const [resolutions, setResolutions] = useState(initial);
  const request = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const titles = uniqueWikiTitles(content);
  const key = titles.join("\u0000");

  useEffect(() => {
    const requestId = ++request.current;
    const timer = setTimeout(() => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      void resolveKnowledgeLinks(titles, controller.signal)
        .then((next) => {
          if (request.current === requestId) {
            setResolutions(next);
          }
        })
        .catch(() => {
          // 正文與 autosave 不依賴解析查詢；暫時保留上一份狀態即可。
        });
    }, 250);

    return () => {
      clearTimeout(timer);
      abort.current?.abort();
    };
    // key 是集中正規化後的 title set；普通輸入不應重送解析請求。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return resolutions;
}

/**
 * 三種既有檢視原本只有快捷鍵，功能存在但畫面上看不出目前狀態。
 * 做成一組 28px 的安靜 segmented control，不增加新的 workspace state。
 */
function ViewModeControl({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const modes: {
    value: ViewMode;
    label: string;
    shortcut: string;
    icon: React.ReactNode;
  }[] = [
    { value: "editor", label: "只看編輯", shortcut: "⌘1", icon: <IconEditorView /> },
    { value: "split", label: "左右分割", shortcut: "⌘2", icon: <IconSplitView /> },
    { value: "preview", label: "只看預覽", shortcut: "⌘3", icon: <IconPreviewView /> },
  ];

  return (
    <div
      role="group"
      aria-label="檢視模式"
      className="hidden shrink-0 items-center gap-0.5 rounded-md bg-list/65 p-0.5 ring-1 ring-line/70 ring-inset md:flex"
    >
      {modes.map((mode) => {
        const active = value === mode.value;
        return (
          <Tooltip key={mode.value} label={mode.label} shortcut={mode.shortcut}>
            <button
              type="button"
              aria-label={mode.label}
              aria-pressed={active}
              onClick={() => onChange(mode.value)}
              className={`flex size-7 items-center justify-center rounded-sm transition-colors duration-150 ${
                active
                  ? "bg-surface text-accent shadow-[inset_0_0_0_1px_var(--line)]"
                  : "text-ink-muted hover:bg-accent-soft/60 hover:text-accent"
              }`}
            >
              {mode.icon}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** 標題列的 icon 按鈕。尺寸、hover、pressed 全部一致。 */
function HeaderButton({
  label,
  shortcut,
  ariaLabel,
  pressed,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  ariaLabel: string;
  pressed?: boolean;
  /** 收下事件物件：選單要靠按鈕的位置決定開在哪裡。 */
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label} shortcut={shortcut}>
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        aria-pressed={pressed}
        className={`flex size-8 items-center justify-center rounded-md transition-colors duration-150 hover:bg-accent-soft ${
          pressed ? "bg-accent-soft text-accent" : "text-ink-muted hover:text-accent"
        }`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/** 低頻操作。放在檯面上只會讓標題列變成一排看不懂的圖示。 */
function NoteActionsMenu({
  noteId,
  pinned,
  canPrint,
  onPin,
  onTrash,
}: {
  noteId: string;
  pinned: boolean;
  canPrint: boolean;
  onPin: () => void;
  onTrash: () => void;
}) {
  const menu = useContextMenu();

  return (
    <>
      <HeaderButton label="更多" ariaLabel="更多操作" onClick={menu.openBelow}>
        <IconMore />
      </HeaderButton>

      {menu.position ? (
        <ContextMenu
          position={menu.position}
          onClose={menu.close}
          label="筆記操作"
          items={[
            { label: pinned ? "取消釘選" : "釘選到列表最上面", onSelect: onPin },
            {
              label: "匯出 PDF",
              hint: canPrint ? "Study / Clean" : "等待儲存",
              disabled: !canPrint,
              separated: true,
              onSelect: () =>
                window.open(printPath(noteId), "_blank", "noopener,noreferrer"),
            },
            {
              label: "移至垃圾桶",
              hint: "可還原",
              danger: true,
              separated: true,
              onSelect: onTrash,
            },
          ]}
        />
      ) : null}
    </>
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
  rename: "等待確認改名",
  conflict: "有衝突，未儲存",
  error: "儲存失敗",
} as const;

/**
 * 存檔狀態。平常是背景資訊，低對比、不搶視線；出問題時才提高權重。
 */
function SaveIndicator({ status }: { status: keyof typeof STATUS_LABELS }) {
  const isProblem = status === "conflict" || status === "error";
  return (
    <span className={isProblem ? "font-semibold text-danger" : "text-ink-muted/70"}>
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
