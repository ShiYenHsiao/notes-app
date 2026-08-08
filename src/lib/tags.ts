import "server-only";

import type { TagSummary } from "@/lib/note-display";
import { createClient } from "@/lib/supabase/server";

/**
 * 全部標籤，附上各自掛了幾篇未刪除的筆記。
 *
 * 計數在 JS 這邊算而不是用 PostgREST 的 embedded aggregate —— note_tags 對個人筆記
 * 來說就幾百列，一次抓回來算比較單純，也不用在手寫的 Database 型別裡描述關聯。
 */
export async function listTags(): Promise<TagSummary[]> {
  const supabase = await createClient();

  const [tagsResult, linksResult, liveNotesResult] = await Promise.all([
    supabase.from("tags").select("id, name").order("name"),
    supabase.from("note_tags").select("note_id, tag_id"),
    supabase.from("notes").select("id").is("deleted_at", null),
  ]);

  if (tagsResult.error) {
    throw new Error(`讀取標籤失敗：${tagsResult.error.message}`);
  }
  if (linksResult.error) {
    throw new Error(`讀取標籤關聯失敗：${linksResult.error.message}`);
  }
  if (liveNotesResult.error) {
    throw new Error(`讀取筆記失敗：${liveNotesResult.error.message}`);
  }

  // 垃圾桶裡的筆記不該算進標籤計數。
  const liveNoteIds = new Set((liveNotesResult.data ?? []).map((note) => note.id));

  const counts = new Map<string, number>();
  for (const link of linksResult.data ?? []) {
    if (liveNoteIds.has(link.note_id)) {
      counts.set(link.tag_id, (counts.get(link.tag_id) ?? 0) + 1);
    }
  }

  return (tagsResult.data ?? []).map((tag) => ({
    id: tag.id,
    name: tag.name,
    count: counts.get(tag.id) ?? 0,
  }));
}

/** 某篇筆記掛了哪些標籤。 */
export async function getNoteTags(noteId: string): Promise<TagSummary[]> {
  const supabase = await createClient();

  const { data: links, error: linkError } = await supabase
    .from("note_tags")
    .select("tag_id")
    .eq("note_id", noteId);

  if (linkError) {
    throw new Error(`讀取筆記標籤失敗：${linkError.message}`);
  }

  const tagIds = (links ?? []).map((link) => link.tag_id);
  if (tagIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("tags")
    .select("id, name")
    .in("id", tagIds)
    .order("name");

  if (error) {
    throw new Error(`讀取筆記標籤失敗：${error.message}`);
  }

  // count 在這個情境用不到，補 0 讓型別一致。
  return (data ?? []).map((tag) => ({ id: tag.id, name: tag.name, count: 0 }));
}

/**
 * 名稱裡含有這段文字的標籤，掛在哪些筆記上。給搜尋用。
 *
 * 標籤搬出內文之後，搜「刑法」找不到掛了 #刑法 但內文沒提到的筆記 —— 那正是把標籤
 * 當分類用的人最會踩到的坑。
 */
export async function noteIdsForTagSearch(query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const supabase = await createClient();

  // ILIKE 的萬用字元要跳脫，否則搜 "50%" 會變成「以 50 開頭的任何標籤」
  const pattern = `%${trimmed.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

  const { data: tags, error: tagError } = await supabase
    .from("tags")
    .select("id")
    .ilike("name", pattern);

  if (tagError) {
    throw new Error(`搜尋標籤失敗：${tagError.message}`);
  }

  const tagIds = (tags ?? []).map((tag) => tag.id);
  if (tagIds.length === 0) {
    return [];
  }

  const { data: links, error: linkError } = await supabase
    .from("note_tags")
    .select("note_id")
    .in("tag_id", tagIds);

  if (linkError) {
    throw new Error(`讀取標籤關聯失敗：${linkError.message}`);
  }

  return [...new Set((links ?? []).map((link) => link.note_id))];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 掛在某個標籤下的筆記 id。給列表篩選用。
 *
 * tagId 來自網址參數，使用者改得到。不是 UUID 就當作沒有結果 ——
 * 直接丟給 Postgres 會因為型別轉換失敗而變成 500。
 */
export async function noteIdsForTag(tagId: string): Promise<string[]> {
  if (!UUID_PATTERN.test(tagId)) {
    return [];
  }

  const supabase = await createClient();

  const { data, error } = await supabase.from("note_tags").select("note_id").eq("tag_id", tagId);

  if (error) {
    throw new Error(`讀取標籤關聯失敗：${error.message}`);
  }

  return (data ?? []).map((link) => link.note_id);
}
