import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { PrintPreview } from "@/components/print-preview";
import { requireUser } from "@/lib/auth";
import { knowledgeForContent } from "@/lib/knowledge";
import { getNote } from "@/lib/notes";
import { normalizePrintStyle, printDocumentTitle } from "@/lib/print-export";
import { getNoteTags } from "@/lib/tags";

const authorizedNote = cache(async (id: string) => {
  await requireUser();
  return getNote(id);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const note = await authorizedNote(id);
  return { title: printDocumentTitle(note?.title ?? null) };
}

export default async function NotePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ style?: string | string[] }>;
}) {
  const { id } = await params;
  // Print route 不經過 App Shell，但授權不能因此少一層。
  const note = await authorizedNote(id);
  if (!note) {
    notFound();
  }

  const [tags, wikiLinks] = await Promise.all([
    getNoteTags(note.id),
    knowledgeForContent(note.content),
  ]);
  const requestedStyle = (await searchParams).style;

  return (
    <PrintPreview
      noteId={note.id}
      title={note.title}
      content={note.content}
      tags={tags.map((tag) => tag.name)}
      exportedAt={new Date().toISOString()}
      initialStyle={normalizePrintStyle(
        Array.isArray(requestedStyle) ? requestedStyle[0] : requestedStyle,
      )}
      wikiLinks={wikiLinks}
    />
  );
}
