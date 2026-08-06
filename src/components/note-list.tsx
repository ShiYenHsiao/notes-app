"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { filterNotes } from "@/lib/actions/notes";
import { displayTitle, type NoteSummary, type TagSummary } from "@/lib/note-display";

import { IconSearch } from "./icons";

/** 停止輸入多久後才真的送出搜尋。 */
const SEARCH_DEBOUNCE_MS = 250;

export function NoteList({ notes, tags }: { notes: NoteSummary[]; tags: TagSummary[] }) {
  const params = useParams<{ id?: string }>();
  const activeId = params?.id;

  // 標籤篩選放在網址上，這樣可以加書籤，切換筆記時也不會掉。
  const searchParams = useSearchParams();
  const tagId = searchParams.get("tag") ?? undefined;
  const activeTag = tags.find((tag) => tag.id === tagId);

  const [query, setQuery] = useState("");
  // 連同查詢條件一起存，才能判斷手上這份結果是不是還對應目前的輸入。
  const [results, setResults] = useState<{ key: string; items: NoteSummary[] } | null>(null);
  const [, startFilter] = useTransition();

  const trimmed = query.trim();
  const filterKey = `${tagId ?? ""}::${trimmed}`;
  // 沒有任何條件時直接用 props，存檔後 revalidate 的結果才會反映到列表上。
  const isFiltered = Boolean(trimmed || tagId);

  useEffect(() => {
    if (!isFiltered) {
      return;
    }

    const timer = setTimeout(() => {
      startFilter(async () => {
        const items = await filterNotes({ query: trimmed || undefined, tagId });
        setResults({ key: filterKey, items });
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [filterKey, isFiltered, tagId, trimmed]);

  const isStale = isFiltered && results?.key !== filterKey;
  const visible = isFiltered ? (results?.key === filterKey ? results.items : []) : notes;

  return (
    <>
      <div className="border-b border-line px-3 py-3">
        <div className="flex items-center gap-2 rounded-[4px] border border-line bg-surface px-3 py-2 focus-within:border-accent">
          <IconSearch size={14} className="shrink-0 text-ink-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜尋筆記"
            className="w-full bg-transparent text-[12px] outline-none placeholder:text-ink-muted"
          />
        </div>

        {activeTag ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[9px] font-extrabold text-accent">
              #{activeTag.name}
            </span>
            <Link href="/" className="text-[10px] text-ink-muted hover:text-accent">
              清除篩選
            </Link>
          </div>
        ) : null}
      </div>

      <ul className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <li className="px-4 py-8 text-center text-[11px] text-ink-muted">
            {isFiltered ? (isStale ? "搜尋中…" : "找不到符合的筆記") : "還沒有筆記"}
          </li>
        ) : (
          visible.map((note) => (
            <li key={note.id}>
              <Link
                href={`/n/${note.id}${tagId ? `?tag=${tagId}` : ""}`}
                className={`grid gap-1 border-b border-line/70 border-l-2 px-4 py-3 transition-colors ${
                  note.id === activeId
                    ? "border-l-accent bg-surface"
                    : "border-l-transparent hover:bg-surface/70"
                }`}
              >
                <div className="flex items-center gap-2">
                  {note.pinned ? (
                    <span className="shrink-0 text-[9px] text-accent" title="已釘選">
                      ◆
                    </span>
                  ) : null}
                  <b className="truncate text-[12px] font-bold">{displayTitle(note)}</b>
                </div>
                {note.excerpt ? (
                  <small className="truncate text-[9px] text-ink-muted">{note.excerpt}</small>
                ) : null}
                <time className="text-[9px] text-ink-muted">{note.updated_label}</time>
              </Link>
            </li>
          ))
        )}
      </ul>
    </>
  );
}
