"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { listNotes, type NoteSummary } from "@/lib/notes";
import { createClient } from "@/lib/supabase/server";

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

  revalidatePath("/", "layout");
  return { status: "saved", updatedAt: data.updated_at };
}

/** 丟進垃圾桶（軟刪除）。 */
export async function trashNote(id: string) {
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
  redirect("/");
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
}): Promise<NoteSummary[]> {
  await requireUser();
  return listNotes(options);
}
