"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { searchNotes } from "@/lib/actions/notes";
import { displayTitle, type NoteSummary } from "@/lib/note-display";

/** 停止輸入多久後才真的送出搜尋。 */
const SEARCH_DEBOUNCE_MS = 250;

export function NoteList({ notes }: { notes: NoteSummary[] }) {
  const params = useParams<{ id?: string }>();
  const activeId = params?.id;

  const [query, setQuery] = useState("");
  // 連同查詢字串一起存，才能判斷手上這份結果是不是還對應目前輸入的內容。
  const [results, setResults] = useState<{ query: string; items: NoteSummary[] } | null>(null);
  const [, startSearch] = useTransition();

  const trimmed = query.trim();

  useEffect(() => {
    const current = query.trim();
    if (!current) {
      return;
    }

    const timer = setTimeout(() => {
      startSearch(async () => {
        setResults({ query: current, items: await searchNotes(current) });
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  const isStale = Boolean(trimmed) && results?.query !== trimmed;
  // 沒在搜尋時直接用 props，這樣存檔後 revalidate 的結果才會反映到列表上。
  const visible = trimmed ? (results?.query === trimmed ? results.items : []) : notes;

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
      </div>

      <ul className="flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-ink-muted">
            {trimmed ? (isStale ? "搜尋中…" : "找不到符合的筆記") : "還沒有筆記"}
          </li>
        ) : (
          visible.map((note) => (
            <li key={note.id}>
              <Link
                href={`/n/${note.id}`}
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
