"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { markdownFilename } from "@/lib/export";
import { getNote, listNotes, type NoteSummary } from "@/lib/notes";
import { createClient } from "@/lib/supabase/server";
import { isSnapshotDue, writeSnapshot } from "@/lib/versions";

export type SaveResult =
  | { status: "saved"; updatedAt: string }
  | { status: "conflict" }
  | { status: "error"; message: string };

/** 新增一篇空筆記並跳過去。 */
export async function createNote() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notes")
    .insert({ user_id: user.id, content: "" })
    .select("id")
    .single();

  if (error) {
    throw new Error(`新增筆記失敗：${error.message}`);
  }

  revalidatePath("/", "layout");
  redirect(`/n/${data.id}`);
}

/**
 * 存檔。
 *
 * `expectedUpdatedAt` 是前端上次拿到的 updated_at，對不上就代表這篇在別的地方被改過
 * （最常見的是自己在 Mac 上開了兩個分頁），這時回報衝突而不是默默蓋掉對方的內容。
 */
export async function saveNote(
  id: string,
  content: string,
  expectedUpdatedAt: string,
): Promise<SaveResult> {
  await requireUser();
  const supabase = await createClient();

  // 快照要記錄「存檔前」的狀態，所以得在 update 之前把舊內容讀出來。
  // 只有真的到了留快照的時間才多這一次查詢。
  const snapshotDue = await isSnapshotDue(id);
  let previousContent: string | null = null;

  if (snapshotDue) {
    const { data: before } = await supabase
      .from("notes")
      .select("content")
      .eq("id", id)
      .maybeSingle();
    previousContent = before?.content ?? null;
  }

  const { data, error } = await supabase
    .from("notes")
    .update({ content })
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .is("deleted_at", null)
    .select("updated_at")
    .maybeSingle();

  if (error) {
    return { status: "error", message: error.message };
  }

  if (!data) {
    // 沒有任何一列被更新：不是有人先改了，就是這篇已經被丟進垃圾桶。
    return { status: "conflict" };
  }

  if (snapshotDue && previousContent !== null) {
    await writeSnapshot(id, previousContent);
  }

  revalidatePath("/", "layout");
  return { status: "saved", updatedAt: data.updated_at };
}

/**
 * 丟進垃圾桶（軟刪除）。
 *
 * `goHome` 是給編輯區用的：刪掉正在看的那篇當然要離開它。從列表的選單刪別篇時
 * 傳 false —— 手上正在編輯的筆記不該因為刪了另一篇而被換掉。
 */
export async function trashNote(id: string, goHome = true) {
  await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("notes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error(`刪除失敗：${error.message}`);
  }

  revalidatePath("/", "layout");

  if (goHome) {
    redirect("/");
  }
}

/**
 * 單篇筆記的 Markdown 原文。列表選單的「複製」與「匯出」用。
 *
 * 複製與匯出都在瀏覽器端完成（clipboard 與 Blob 下載），這裡只負責把內容送過去 ——
 * 列表為了輕量本來就不帶完整內文。
 */
export async function noteMarkdown(id: string) {
  await requireUser();

  const note = await getNote(id);
  if (!note) {
    return null;
  }

  return { filename: markdownFilename(note.title), content: note.content };
}

/** 從垃圾桶還原。 */
export async function restoreNote(id: string) {
  await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("notes").update({ deleted_at: null }).eq("id", id);

  if (error) {
    throw new Error(`還原失敗：${error.message}`);
  }

  revalidatePath("/", "layout");
}

/** 切換釘選。 */
export async function togglePin(id: string, pinned: boolean) {
  await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("notes").update({ pinned }).eq("id", id);

  if (error) {
    throw new Error(`更新釘選失敗：${error.message}`);
  }

  revalidatePath("/", "layout");
}

/** 搜尋與標籤篩選。給列表即時呼叫用。 */
export async function filterNotes(options: {
  query?: string;
  tagId?: string;
  pinned?: boolean;
}): Promise<NoteSummary[]> {
  await requireUser();
  return listNotes(options);
}
