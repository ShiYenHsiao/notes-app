import Link from "next/link";
import { redirect } from "next/navigation";

import { restoreNote } from "@/lib/actions/notes";
import { requireUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { displayTitle } from "@/lib/note-display";
import { listNotes } from "@/lib/notes";

export default async function TrashPage() {
  if (!isSupabaseConfigured()) {
    redirect("/");
  }

  await requireUser();
  const notes = await listNotes({ trashed: true });

  return (
    <main className="mx-auto max-w-2xl px-9 py-9">
      <Link href="/" className="text-[11px] text-ink-muted hover:text-accent">
        ← 回筆記
      </Link>

      <div className="mt-6 mb-6">
        <p className="eyebrow">TRASH</p>
        <h1 className="mt-1.5 text-[30px] font-semibold" style={{ fontFamily: "var(--font-serif)" }}>
          垃圾桶
        </h1>
        <p className="mt-1.5 text-[12px] text-ink-muted">丟進來的筆記會在 30 天後自動清除。</p>
      </div>

      {notes.length === 0 ? (
        <p className="border border-line bg-surface px-7 py-8 text-center text-[11px] text-ink-muted">
          垃圾桶是空的。
        </p>
      ) : (
        <ul className="border-t border-line">
          {notes.map((note) => (
            <li key={note.id} className="flex items-center gap-4 border-b border-line py-3">
              <div className="grid min-w-0 flex-1 gap-1">
                <b className="truncate text-[12px]">{displayTitle(note)}</b>
                <small className="truncate text-[9px] text-ink-muted">{note.excerpt}</small>
              </div>
              <form action={restoreNote.bind(null, note.id)}>
                <button
                  type="submit"
                  className="shrink-0 rounded-[3px] border border-line px-2.5 py-1.5 text-[10px] font-bold text-accent transition-colors hover:border-accent"
                >
                  還原
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
