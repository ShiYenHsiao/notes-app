"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  getVersionContent,
  listVersions,
  writeSnapshot,
  type VersionSummary,
} from "@/lib/versions";

export async function fetchVersions(noteId: string): Promise<VersionSummary[]> {
  await requireUser();
  return listVersions(noteId);
}

export type RestoreResult = { status: "restored" } | { status: "error"; message: string };

/**
 * 把筆記還原成某一份快照的內容。
 *
 * 還原前會先把「現在的內容」也存成一份快照 —— 不然按錯了就回不去了，
 * 而還原本身就是最容易按錯的操作。
 */
export async function restoreVersion(
  noteId: string,
  versionId: string,
): Promise<RestoreResult> {
  await requireUser();
  const supabase = await createClient();

  const target = await getVersionContent(versionId);
  if (target === null) {
    return { status: "error", message: "找不到這份版本紀錄。" };
  }

  const { data: current, error: readError } = await supabase
    .from("notes")
    .select("content")
    .eq("id", noteId)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !current) {
    return { status: "error", message: readError?.message ?? "找不到這篇筆記。" };
  }

  if (current.content !== target) {
    await writeSnapshot(noteId, current.content);
  }

  // 還原是使用者明確要求的動作，不套樂觀鎖 —— 這裡的意圖就是「用這份蓋過去」。
  const { error } = await supabase.from("notes").update({ content: target }).eq("id", noteId);

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/", "layout");
  return { status: "restored" };
}
