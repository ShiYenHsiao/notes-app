import { notFound } from "next/navigation";

import { NoteView } from "@/components/note-view";
import { requireUser } from "@/lib/auth";
import { getBacklinks, knowledgeForContent } from "@/lib/knowledge";
import { getNote } from "@/lib/notes";
import { getNoteTags, listTags } from "@/lib/tags";

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();

  const { id } = await params;
  const note = await getNote(id);

  if (!note) {
    notFound();
  }

  const [noteTags, allTags, wikiLinks, backlinkResult] = await Promise.all([
    getNoteTags(note.id),
    listTags(),
    knowledgeForContent(note.content),
    getBacklinks(note.id)
      .then((items) => ({ items, error: null }))
      .catch(() => ({
        items: [],
        error: "Linked References 暫時無法載入；筆記正文與儲存不受影響。",
      })),
  ]);

  // key 讓切換筆記時整個重新掛載，編輯器與存檔狀態才不會沿用上一篇的。
  return (
    <NoteView
      key={note.id}
      note={note}
      noteTags={noteTags}
      allTags={allTags}
      userId={user.id}
      initialWikiLinks={wikiLinks}
      backlinks={backlinkResult.items}
      backlinksError={backlinkResult.error}
    />
  );
}
