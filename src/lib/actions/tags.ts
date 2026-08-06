"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { normalizeTagName, type TagSummary } from "@/lib/note-display";
import { createClient } from "@/lib/supabase/server";
import { getNoteTags, listTags } from "@/lib/tags";

/** Postgres 的 unique_violation。同名標籤或重複掛載都會回這個。 */
const UNIQUE_VIOLATION = "23505";

/**
 * 把標籤掛到筆記上，標籤不存在就順便建。
 *
 * 回傳掛完之後這篇筆記的完整標籤清單，前端直接換掉自己那份就好。
 */
export async function addTagToNote(noteId: string, rawName: string): Promise<TagSummary[]> {
  const user = await requireUser();
  const name = normalizeTagName(rawName);

  if (!name) {
    return getNoteTags(noteId);
  }

  const supabase = await createClient();

  const { data: existing, error: lookupError } = await supabase
    .from("tags")
    .select("id")
    .eq("name", name)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`查詢標籤失敗：${lookupError.message}`);
  }

  let tagId = existing?.id;

  if (!tagId) {
    const { data, error } = await supabase
      .from("tags")
      .insert({ user_id: user.id, name })
      .select("id")
      .single();

    if (error) {
      // 同時在兩個地方建同名標籤時會撞到，重查一次拿既有的就好。
      if (error.code === UNIQUE_VIOLATION) {
        const { data: raced } = await supabase
          .from("tags")
          .select("id")
          .eq("name", name)
          .maybeSingle();
        tagId = raced?.id;
      }

      if (!tagId) {
        throw new Error(`新增標籤失敗：${error.message}`);
      }
    } else {
      tagId = data.id;
    }
  }

  const { error: linkError } = await supabase
    .from("note_tags")
    .insert({ note_id: noteId, tag_id: tagId });

  // 已經掛過了不算錯。
  if (linkError && linkError.code !== UNIQUE_VIOLATION) {
    throw new Error(`掛上標籤失敗：${linkError.message}`);
  }

  revalidatePath("/", "layout");
  return getNoteTags(noteId);
}

/**
 * 把標籤從筆記上拿掉。
 *
 * 如果拿掉之後這個標籤已經沒有掛在任何筆記上，就連標籤本身一起刪。
 * 原本刻意保留標籤想讓自動完成之後還提得出來，但實際用起來是側邊欄不斷累積
 * 計數 0 的死標籤，而且介面上沒有任何地方能清掉它們。沒有筆記的標籤沒有意義。
 */
export async function removeTagFromNote(noteId: string, tagId: string): Promise<TagSummary[]> {
  await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("note_tags")
    .delete()
    .eq("note_id", noteId)
    .eq("tag_id", tagId);

  if (error) {
    throw new Error(`移除標籤失敗：${error.message}`);
  }

  const { data: remaining, error: countError } = await supabase
    .from("note_tags")
    .select("note_id")
    .eq("tag_id", tagId)
    .limit(1);

  // 查不到剩餘關聯時寧可留著標籤 —— 誤刪比留下一個空標籤糟糕得多。
  if (!countError && (remaining ?? []).length === 0) {
    await supabase.from("tags").delete().eq("id", tagId);
  }

  revalidatePath("/", "layout");
  return getNoteTags(noteId);
}

/** 給標籤輸入框做自動完成用。 */
export async function suggestTags(): Promise<TagSummary[]> {
  await requireUser();
  return listTags();
}
