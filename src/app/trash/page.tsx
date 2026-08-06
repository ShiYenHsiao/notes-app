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
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/" className="text-sm text-ink-muted hover:text-accent">
        ← 回筆記
      </Link>

      <h1 className="mt-4 text-2xl font-semibold">垃圾桶</h1>
      <p className="mt-1 text-sm text-ink-muted">丟進來的筆記會在 30 天後自動清除。</p>

      {notes.length === 0 ? (
        <p className="mt-10 text-sm text-ink-muted">垃圾桶是空的。</p>
      ) : (
        <ul className="mt-8 divide-y divide-line">
          {notes.map((note) => (
            <li key={note.id} className="flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate">{displayTitle(note)}</p>
                <p className="truncate text-xs text-ink-muted">{note.excerpt}</p>
              </div>
              <form action={restoreNote.bind(null, note.id)}>
                <button type="submit" className="shrink-0 text-sm text-accent hover:underline">
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
