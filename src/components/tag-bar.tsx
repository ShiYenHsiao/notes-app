"use client";

import { useId, useState, useTransition } from "react";

import { addTagToNote, removeTagFromNote } from "@/lib/actions/tags";
import { TAG_NAME_MAX_LENGTH, type TagSummary } from "@/lib/note-display";

/**
 * 編輯區底部的標籤列。
 *
 * 標籤存在資料表而不是寫進 Markdown 內文 —— 內文要能原封不動匯出成 .md，
 * 塞 `#tag` 進去會跟 Markdown 的標題語法打架。
 */
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
          className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent"
        >
          #{tag.name}
          <button
            type="button"
            onClick={() => remove(tag.id)}
            disabled={pending}
            aria-label={`移除標籤 ${tag.name}`}
            className="opacity-60 hover:opacity-100 disabled:opacity-30"
          >
            ×
          </button>
        </span>
      ))}

      <input
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
        placeholder={tags.length === 0 ? "加標籤…" : ""}
        disabled={pending}
        className="min-w-24 flex-1 bg-transparent text-xs outline-none placeholder:text-ink-muted disabled:opacity-50"
      />

      <datalist id={listId}>
        {suggestions.map((tag) => (
          <option key={tag.id} value={tag.name} />
        ))}
      </datalist>
    </div>
  );
}
