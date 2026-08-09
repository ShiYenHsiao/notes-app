"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { searchKnowledgeNotes } from "@/lib/knowledge-client";
import { displayTitle, type NoteSummary } from "@/lib/note-display";
import { useOpenTabs } from "@/lib/use-open-tabs";
import { rankWikiCandidates, type WikiNoteCandidate } from "@/lib/wiki-links";

const SEARCH_DELAY_MS = 200;

export function QuickOpen({
  notes,
  searchNotes = searchKnowledgeNotes,
}: {
  notes: NoteSummary[];
  searchNotes?: (query: string, limit: number) => Promise<WikiNoteCandidate[]>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WikiNoteCandidate[]>([]);
  const [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();
  const requestId = useRef(0);
  const searchAbort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const tabs = useOpenTabs(new Set(notes.map((note) => note.id)));

  const recent = useMemo(() => {
    const byId = new Map(notes.map((note) => [note.id, note]));
    const opened = [...tabs.ids]
      .reverse()
      .map((id) => byId.get(id))
      .filter((note): note is NoteSummary => Boolean(note));
    const seen = new Set(opened.map((note) => note.id));
    return [...opened, ...notes.filter((note) => !seen.has(note.id))]
      .slice(0, 20)
      .map((note) => ({
        id: note.id,
        title: displayTitle(note),
        updatedAt: note.updated_at,
        updatedLabel: note.updated_label,
      }));
  }, [notes, tabs.ids]);

  const visible = query.trim() ? results : recent;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setOpen(true);
        setQuery("");
        setActive(0);
        requestAnimationFrame(() => input.current?.focus());
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  useEffect(() => {
    if (!open || !query.trim()) {
      return;
    }

    const current = ++requestId.current;
    const timer = setTimeout(() => {
      searchAbort.current?.abort();
      const controller = new AbortController();
      searchAbort.current = controller;
      startTransition(async () => {
        try {
          const candidates =
            searchNotes === searchKnowledgeNotes
              ? await searchKnowledgeNotes(query, 24, controller.signal)
              : await searchNotes(query, 24);
          if (current === requestId.current) {
            setResults(rankWikiCandidates(candidates, query, 20));
            setActive(0);
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          if (current === requestId.current) {
            setResults([]);
          }
        }
      });
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      searchAbort.current?.abort();
    };
  }, [open, query, searchNotes]);

  function close() {
    requestId.current += 1;
    searchAbort.current?.abort();
    setOpen(false);
  }

  function select(candidate: WikiNoteCandidate) {
    tabs.open(candidate.id);
    close();
  }

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] grid items-start justify-items-center bg-background/65 px-4 pt-[13vh] backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          close();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="快速開啟筆記"
        className="w-full max-w-xl overflow-hidden rounded-lg border border-border-default bg-elevated shadow-[var(--shadow-pop)]"
      >
        <div className="flex items-center gap-3 border-b border-border-subtle px-4">
          <span aria-hidden className="text-gold">⌕</span>
          <input
            ref={input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onCompositionStart={() => requestId.current += 1}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) {
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                close();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((index) => Math.min(index + 1, Math.max(visible.length - 1, 0)));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => Math.max(index - 1, 0));
              } else if (event.key === "Enter" && visible[active]) {
                event.preventDefault();
                select(visible[active]);
              }
            }}
            placeholder="搜尋筆記標題"
            aria-label="搜尋筆記標題"
            aria-activedescendant={visible[active] ? `quick-open-${visible[active].id}` : undefined}
            className="h-13 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
          />
          <kbd className="text-2xs text-ink-muted">ESC</kbd>
        </div>

        <div className="px-3 pt-2 text-2xs font-semibold tracking-[0.08em] text-ink-muted uppercase">
          {query.trim() ? "搜尋結果" : "最近開啟"}
        </div>
        <ul role="listbox" className="max-h-[22rem] overflow-y-auto p-2">
          {visible.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-ink-muted">
              {pending ? "搜尋中…" : "找不到符合的筆記"}
            </li>
          ) : (
            visible.map((candidate, index) => (
              <li
                key={candidate.id}
                id={`quick-open-${candidate.id}`}
                role="option"
                aria-selected={index === active}
              >
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => select(candidate)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors duration-150 ${
                    index === active
                      ? "bg-active text-primary shadow-[inset_2px_0_0_var(--accent-gold)]"
                      : "text-secondary hover:bg-hover hover:text-primary"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{candidate.title}</span>
                  <span className="shrink-0 text-2xs text-ink-muted">
                    {candidate.updatedLabel}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
