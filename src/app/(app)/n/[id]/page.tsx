import { notFound } from "next/navigation";

import { NoteView } from "@/components/note-view";
import { requireUser } from "@/lib/auth";
import { getNote } from "@/lib/notes";

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();

  const { id } = await params;
  const note = await getNote(id);

  if (!note) {
    notFound();
  }

  // key 讓切換筆記時整個重新掛載，編輯器與存檔狀態才不會沿用上一篇的。
  return <NoteView key={note.id} note={note} />;
}
