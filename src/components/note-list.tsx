"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { filterNotes, noteMarkdown, togglePin, trashNote } from "@/lib/actions/notes";
import { displayTitle, type NoteSummary, type TagSummary } from "@/lib/note-display";

import { ContextMenu, useContextMenu } from "./context-menu";
import { IconMore, IconPinned, IconSearch } from "./icons";
import { requestTagFocus } from "./tag-bar";

/** 停止輸入多久後才真的送出搜尋。 */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * 側邊欄的「搜尋筆記」用這個事件把焦點丟過來。
 *
 * 搜尋框長在列表上方（那是結果出現的地方），側邊欄那一項只是入口。用事件而不是
 * context：兩邊沒有其他要共享的狀態，為了一個 focus() 拉一層 provider 不划算。
 */
export const FOCUS_SEARCH_EVENT = "nexum:focus-search";

/** 操作結果的提示顯示多久。 */
const TOAST_MS = 2200;

export function NoteList({ notes, tags }: { notes: NoteSummary[]; tags: TagSummary[] }) {
  const params = useParams<{ id?: string }>();
  const activeId = params?.id;

  // 標籤篩選放在網址上，這樣可以加書籤，切換筆記時也不會掉。
  const searchParams = useSearchParams();
  const tagId = searchParams.get("tag") ?? undefined;
  const activeTag = tags.find((tag) => tag.id === tagId);
  const pinnedOnly = searchParams.get("pinned") === "1";

  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focus = () => searchInput.current?.focus();
    window.addEventListener(FOCUS_SEARCH_EVENT, focus);
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, focus);
  }, []);

  const [query, setQuery] = useState("");
  // 連同查詢條件一起存，才能判斷手上這份結果是不是還對應目前的輸入。
  const [results, setResults] = useState<{ key: string; items: NoteSummary[] } | null>(null);
  const [, startFilter] = useTransition();

  // 複製、匯出這些沒有畫面變化的動作要有回饋，否則不知道到底做了沒有。
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (toast === null) {
      return;
    }
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const trimmed = query.trim();
  const filterKey = `${tagId ?? ""}::${pinnedOnly}::${trimmed}`;
  // 沒有任何條件時直接用 props，存檔後 revalidate 的結果才會反映到列表上。
  const isFiltered = Boolean(trimmed || tagId || pinnedOnly);

  useEffect(() => {
    if (!isFiltered) {
      return;
    }

    const timer = setTimeout(() => {
      startFilter(async () => {
        const items = await filterNotes({
          query: trimmed || undefined,
          tagId,
          pinned: pinnedOnly || undefined,
        });
        setResults({ key: filterKey, items });
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [filterKey, isFiltered, tagId, pinnedOnly, trimmed]);

  const isStale = isFiltered && results?.key !== filterKey;
  const visible = isFiltered ? (results?.key === filterKey ? results.items : []) : notes;

  return (
    <>
      <div className="shrink-0 px-3 pt-3 pb-2.5">
        <div className="flex h-9 items-center gap-2 rounded-md border border-line bg-surface px-2.5 transition-colors duration-150 focus-within:border-accent">
          <IconSearch size={15} className="shrink-0 text-ink-muted" />
          <input
            ref={searchInput}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜尋筆記"
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-muted"
          />
        </div>

        {activeTag || pinnedOnly ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-2xs font-semibold text-accent">
              {activeTag ? `# ${activeTag.name}` : "已釘選"}
            </span>
            <Link
              href="/"
              className="text-2xs text-ink-muted transition-colors duration-150 hover:text-accent"
            >
              清除篩選
            </Link>
          </div>
        ) : null}
      </div>

      <ul className="flex-1 overflow-y-auto px-2 pb-2">
        {visible.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-ink-muted">
            {isFiltered ? (isStale ? "搜尋中…" : "找不到符合的筆記") : "還沒有筆記"}
          </li>
        ) : (
          visible.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              href={`/n/${note.id}${tagId ? `?tag=${tagId}` : ""}`}
              active={note.id === activeId}
              onToast={setToast}
            />
          ))
        )}
      </ul>

      {toast ? (
        <div
          role="status"
          className="animate-[toast-in_150ms_ease-out] border-t border-line bg-accent-soft px-4 py-2 text-sm text-accent"
        >
          {toast}
        </div>
      ) : null}
    </>
  );
}

function NoteRow({
  note,
  href,
  active,
  onToast,
}: {
  note: NoteSummary;
  href: string;
  active: boolean;
  onToast: (message: string) => void;
}) {
  const menu = useContextMenu();
  const router = useRouter();

  async function withMarkdown(action: (payload: { filename: string; content: string }) => void) {
    const payload = await noteMarkdown(note.id);
    if (!payload) {
      onToast("找不到這篇筆記");
      return;
    }
    action(payload);
  }

  const items = [
    { label: "開啟", onSelect: () => router.push(href) },
    {
      label: note.pinned ? "取消釘選" : "釘選",
      onSelect: async () => {
        await togglePin(note.id, !note.pinned);
      },
    },
    {
      /*
       * 「新增標籤」與「修改標籤」在這裡是同一件事：都是開啟筆記並把游標放進標題下方的
       * 標籤欄。分成兩個選項只會讓人先猜自己要按哪一個，實際做的事一模一樣。
       */
      label: note.tags.length === 0 ? "新增標籤" : "編輯標籤",
      hint: note.tags.length > 0 ? `${note.tags.length}` : undefined,
      onSelect: () => {
        requestTagFocus(note.id);
        router.push(href);
      },
    },
    {
      label: "複製 Markdown",
      separated: true,
      onSelect: () =>
        withMarkdown(async ({ content }) => {
          try {
            await navigator.clipboard.writeText(content);
            onToast("已複製 Markdown");
          } catch {
            // 瀏覽器沒給剪貼簿權限時不要靜默失敗
            onToast("複製失敗，瀏覽器擋下了剪貼簿");
          }
        }),
    },
    {
      label: "匯出 Markdown",
      onSelect: () =>
        withMarkdown(({ filename, content }) => {
          downloadText(filename, content);
          onToast(`已下載 ${filename}`);
        }),
    },
    {
      label: "移至垃圾桶",
      danger: true,
      separated: true,
      onSelect: async () => {
        // 刪的是正在編輯的那篇才需要離開；刪別篇時留在原地。
        await trashNote(note.id, false);
        if (active) {
          router.push("/");
        }
        onToast("已移至垃圾桶，可到垃圾桶還原");
      },
    },
  ];

  return (
    <li className="group relative" onContextMenu={menu.openAtPointer}>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`grid h-[68px] content-center gap-1.5 rounded-md px-3 transition-colors duration-150 ${
          active
            ? "bg-accent-soft/55 shadow-[inset_2px_0_0_var(--accent)]"
            : "hover:bg-surface/65"
        }`}
      >
        <div className="flex items-center gap-1.5">
          {note.pinned ? (
            <IconPinned size={13} className="shrink-0 text-gold" aria-label="已釘選" />
          ) : null}
          <b
            className={`truncate text-base font-medium ${active ? "text-accent" : "text-ink"}`}
          >
            {displayTitle(note)}
          </b>
        </div>

        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <time className="shrink-0 tabular-nums">{note.updated_label}</time>
          {note.tags.length > 0 ? (
            <span className="truncate">{note.tags.map((tag) => `#${tag}`).join("　")}</span>
          ) : null}
        </div>
      </Link>

      {/*
        三點按鈕疊在列上面而不是放進 Link 裡 —— 巢狀的可點擊元素在鍵盤與
        輔助技術下都是壞的。右鍵開的是同一份選單。
      */}
      <button
        type="button"
        onClick={menu.openBelow}
        aria-label={`${displayTitle(note)} 的操作選單`}
        title="更多操作"
        className={`absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted transition-[opacity,color,background-color] duration-150 hover:bg-accent-soft hover:text-accent ${
          menu.isOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
        }`}
      >
        <IconMore size={15} />
      </button>

      {menu.position ? (
        <ContextMenu
          position={menu.position}
          onClose={menu.close}
          label={`${displayTitle(note)} 的操作選單`}
          items={items}
        />
      ) : null}
    </li>
  );
}

/** 把文字存成檔案。單篇匯出不打包，直接下載一個 .md。 */
function downloadText(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}
