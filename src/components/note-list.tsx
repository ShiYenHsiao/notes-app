"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { filterNotes } from "@/lib/actions/notes";
import { displayTitle, type NoteSummary, type TagSummary } from "@/lib/note-display";

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
      <div className="border-b border-line p-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜尋筆記…"
          className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm outline-none placeholder:text-ink-muted focus:border-accent"
        />

        {activeTag ? (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent">
              #{activeTag.name}
            </span>
            <Link href="/" className="text-ink-muted hover:text-accent">
              清除篩選
            </Link>
          </div>
        ) : null}
      </div>

      <ul className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-ink-muted">
            {isFiltered ? (isStale ? "搜尋中…" : "找不到符合的筆記") : "還沒有筆記"}
          </li>
        ) : (
          visible.map((note) => (
            <li key={note.id}>
              <Link
                href={`/n/${note.id}${tagId ? `?tag=${tagId}` : ""}`}
                className={`block border-b border-line/60 px-4 py-3 ${
                  note.id === activeId ? "bg-accent-soft" : "hover:bg-accent-soft/40"
                }`}
              >
                <div className="flex items-baseline gap-2">
                  {note.pinned ? <span className="text-xs text-accent">釘</span> : null}
                  <span className="truncate font-medium">{displayTitle(note)}</span>
                </div>
                <div className="mt-0.5 flex items-baseline gap-2 text-xs text-ink-muted">
                  <span className="shrink-0 font-mono">{note.updated_label}</span>
                  <span className="truncate">{note.excerpt}</span>
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>
    </>
  );
}
