"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  rebuildNoteLinksSafely,
  rebuildSourcesForTitle,
} from "@/lib/knowledge";
import { createClient } from "@/lib/supabase/server";
import { normalizeWikiTitle, WIKI_TITLE_CREATE_LIMIT } from "@/lib/wiki-links";

export type QuickCreateKnowledgeResult =
  | { status: "created" | "existing"; noteId: string }
  | { status: "ambiguous" | "invalid"; message: string }
  | { status: "error"; message: string };

export async function quickCreateKnowledgeNote(
  sourceNoteId: string,
  requestedTitle: string,
): Promise<QuickCreateKnowledgeResult> {
  await requireUser();
  const title = normalizeWikiTitle(requestedTitle);
  if (!title || title.length > WIKI_TITLE_CREATE_LIMIT || /[\r\n]/.test(title)) {
    return {
      status: "invalid",
      message: `標題必須是單行且不超過 ${WIKI_TITLE_CREATE_LIMIT} 個字。`,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_linked_note", { p_title: title });
  if (error) {
    return { status: "error", message: `建立筆記失敗：${error.message}` };
  }

  const result = data[0];
  if (!result || result.status === "ambiguous" || !result.note_id) {
    return {
      status: "ambiguous",
      message: "目前已有多篇同名筆記；v1 的 [[Title]] 無法安全選定其中一篇。",
    };
  }

  const { data: source } = await supabase
    .from("notes")
    .select("id, title, content, updated_at")
    .eq("id", sourceNoteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (source) {
    await rebuildNoteLinksSafely(source);
  }
  await rebuildSourcesForTitle(title);

  revalidatePath("/", "layout");
  return {
    status: result.status === "created" ? "created" : "existing",
    noteId: result.note_id,
  };
}
