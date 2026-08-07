"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import { addTagToNote, removeTagFromNote } from "@/lib/actions/tags";
import { TAG_NAME_MAX_LENGTH, type TagSummary } from "@/lib/note-display";

/**
 * 筆記的標籤列（標題下方的 metadata）。
 *
 * **標籤是資料表的一筆關聯，不是內文的一部分** —— 內文要能原封不動匯出成 `.md`，
 * 塞 `#tag` 進去會跟 Markdown 的標題語法打架，而且改一個標籤名就得掃過每一篇內文。
 * 它跟標題一樣屬於「這篇筆記是什麼」，所以放在內容上方而不是編輯區底部。
 */

/**
 * 筆記列表的右鍵選單要把焦點送到標籤欄，但那有兩種情況：
 * 已經在這篇筆記上（元件還掛著，用事件），或是要先換頁過來（元件之後才掛，
 * 用 sessionStorage 留一個一次性的旗標）。兩條路都要走，只做一條會有一半的情況失效。
 */
export const FOCUS_TAGS_EVENT = "nexum:focus-tags";

const FOCUS_TAGS_KEY = "nexum:focus-tags";

/** 選單那邊呼叫：標記「等一下開啟的那篇要把焦點放在標籤欄」。 */
export function requestTagFocus(noteId: string) {
  try {
    window.sessionStorage.setItem(FOCUS_TAGS_KEY, noteId);
  } catch {
    // 無痕模式之類的環境可能不給寫，那就只靠事件那條路
  }
  window.dispatchEvent(new Event(FOCUS_TAGS_EVENT));
}

export function TagBar({
  noteId,
  initialTags,
  allTags,
}: {
  noteId: string;
  initialTags: TagSummary[];
  allTags: TagSummary[];
}) {
  const [tags, setTags] = useState(initialTags);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const listId = useId();
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focus = () => field.current?.focus();
    window.addEventListener(FOCUS_TAGS_EVENT, focus);

    // 從別頁被叫過來的：旗標是一次性的，用完就清掉
    try {
      if (window.sessionStorage.getItem(FOCUS_TAGS_KEY) === noteId) {
        window.sessionStorage.removeItem(FOCUS_TAGS_KEY);
        focus();
      }
    } catch {
      // 讀不到就算了
    }

    return () => window.removeEventListener(FOCUS_TAGS_EVENT, focus);
  }, [noteId]);

  const attached = new Set(tags.map((tag) => tag.name));
  const suggestions = allTags.filter((tag) => !attached.has(tag.name));

  function add(name: string) {
    if (!name.trim()) {
      return;
    }
    startTransition(async () => {
      setTags(await addTagToNote(noteId, name));
      setInput("");
    });
  }

  function remove(tagId: string) {
    startTransition(async () => {
      setTags(await removeTagFromNote(noteId, tagId));
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="group/chip flex items-center gap-1 rounded-full border border-line bg-accent-soft/70 py-0.5 pr-1.5 pl-2.5 text-2xs font-medium text-accent transition-colors duration-150"
        >
          {tag.name}
          <button
            type="button"
            onClick={() => remove(tag.id)}
            disabled={pending}
            aria-label={`移除標籤 ${tag.name}`}
            className="opacity-0 transition-opacity duration-150 group-hover/chip:opacity-60 hover:opacity-100 focus:opacity-100 disabled:opacity-25"
          >
            ×
          </button>
        </span>
      ))}

      <input
        ref={field}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add(input);
            return;
          }
          // 輸入框空著時按退格，拿掉最後一個標籤 —— chip 介面的慣例。
          if (event.key === "Backspace" && !input && tags.length > 0) {
            event.preventDefault();
            remove(tags[tags.length - 1].id);
          }
        }}
        list={listId}
        maxLength={TAG_NAME_MAX_LENGTH}
        placeholder={tags.length === 0 ? "加標籤…" : "＋"}
        disabled={pending}
        aria-label="新增標籤"
        className="min-w-16 flex-1 bg-transparent text-2xs outline-none placeholder:text-ink-muted disabled:opacity-50"
      />

      <datalist id={listId}>
        {suggestions.map((tag) => (
          <option key={tag.id} value={tag.name} />
        ))}
      </datalist>
    </div>
  );
}
