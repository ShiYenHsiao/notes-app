import "server-only";

import { mergeNoteLists, type NoteDetail, type NoteSummary } from "@/lib/note-display";
import { createClient } from "@/lib/supabase/server";
import { noteIdsForTag, noteIdsForTagSearch } from "@/lib/tags";

export type { NoteDetail, NoteSummary };

/** 列表一次抓多少筆。個人筆記量不大，先不做分頁。 */
const LIST_LIMIT = 300;

/** 列表摘要取幾個字。 */
const EXCERPT_LENGTH = 80;

/**
 * ILIKE 的萬用字元跳脫。少了這個，搜尋 "50%" 會變成「以 50 開頭的任何內容」。
 */
function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** 內文轉成列表要顯示的摘要：去掉標題那行與 Markdown 符號。 */
function toExcerpt(content: string): string {
  const withoutTitle = content.split("\n").slice(1).join(" ");
  const plain = withoutTitle
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[*_`>~]/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return plain.length > EXCERPT_LENGTH ? `${plain.slice(0, EXCERPT_LENGTH)}…` : plain;
}

type NoteRow = {
  id: string;
  title: string | null;
  content: string;
  pinned: boolean;
  updated_at: string;
};

/**
 * 時間字串固定在伺服器端用 Asia/Taipei 算好。
 *
 * 如果丟給瀏覽器自己格式化，SSR（Vercel 是 UTC）跟瀏覽器（Asia/Taipei）會算出不同結果，
 * React 就會噴 hydration mismatch。單人使用的站沒有跨時區需求，寫死時區最省事。
 */
function formatUpdatedAt(iso: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function toSummary(row: NoteRow, tags: string[]): NoteSummary {
  return {
    id: row.id,
    title: row.title,
    excerpt: toExcerpt(row.content),
    pinned: row.pinned,
    updated_at: row.updated_at,
    updated_label: formatUpdatedAt(row.updated_at),
    tags,
  };
}

/**
 * 這批筆記各自掛了哪些標籤名稱。
 *
 * 兩次查詢再在 JS 這邊併起來，不用 PostgREST 的 embedded select ——
 * 手寫的 Database 型別沒有描述關聯，embedded 過不了型別檢查（listTags 也是同樣做法）。
 */
async function tagNamesByNote(noteIds: string[]): Promise<Map<string, string[]>> {
  const byNote = new Map<string, string[]>();
  if (noteIds.length === 0) {
    return byNote;
  }

  const supabase = await createClient();

  const { data: links, error: linkError } = await supabase
    .from("note_tags")
    .select("note_id, tag_id")
    .in("note_id", noteIds);

  if (linkError) {
    throw new Error(`讀取標籤關聯失敗：${linkError.message}`);
  }
  if (!links || links.length === 0) {
    return byNote;
  }

  const { data: tags, error: tagError } = await supabase
    .from("tags")
    .select("id, name")
    .in("id", [...new Set(links.map((link) => link.tag_id))]);

  if (tagError) {
    throw new Error(`讀取標籤失敗：${tagError.message}`);
  }

  const names = new Map((tags ?? []).map((tag) => [tag.id, tag.name]));

  for (const link of links) {
    const name = names.get(link.tag_id);
    if (!name) {
      continue;
    }
    byNote.set(link.note_id, [...(byNote.get(link.note_id) ?? []), name]);
  }

  for (const list of byNote.values()) {
    list.sort((a, b) => a.localeCompare(b, "zh-TW"));
  }

  return byNote;
}

/**
 * 筆記列表。`query` 有值時做全文搜尋。
 *
 * 搜尋比對**內文與標籤名稱**。標題不用另外比 —— 它是從內文第一行推導出來的，
 * 本來就是 content 的子字串。標籤則不在內文裡，所以要另外撈（見下面的註解）。
 */
export async function listNotes(
  options: { query?: string; trashed?: boolean; tagId?: string; pinned?: boolean } = {},
) {
  const supabase = await createClient();

  // 標籤篩選先換成 id 清單再用 in()，不走 PostgREST 的 embedded filter ——
  // 手寫的 Database 型別沒有描述關聯，embedded select 過不了型別檢查。
  let tagFilterIds: string[] | null = null;
  if (options.tagId) {
    tagFilterIds = await noteIdsForTag(options.tagId);
    if (tagFilterIds.length === 0) {
      return [];
    }
  }

  /*
   * 每次查詢都從這裡長出來。搜尋要跑兩次（內文一次、標籤名稱一次），所以做成函式
   * 而不是一個可變的 request 物件。
   */
  const base = () => {
    let request = supabase
      .from("notes")
      .select("id, title, content, pinned, updated_at")
      .limit(LIST_LIMIT);

    if (tagFilterIds) {
      request = request.in("id", tagFilterIds);
    }

    request = options.trashed
      ? request.not("deleted_at", "is", null).order("deleted_at", { ascending: false })
      : request
          .is("deleted_at", null)
          .order("pinned", { ascending: false })
          .order("updated_at", { ascending: false });

    if (options.pinned) {
      request = request.eq("pinned", true);
    }

    return request;
  };

  const query = options.query?.trim();

  if (!query) {
    return toSummaries(await run(base()));
  }

  /*
   * 搜尋同時比對內文與標籤名稱。
   *
   * 兩個查詢再在 JS 這邊合併，不硬湊成一句 `or()` —— PostgREST 的 or 語法裡逗號與括號
   * 有意義，使用者搜尋字串裡打一個逗號就會壞掉，而跳脫規則跟 ILIKE 的又不一樣。
   * 搜尋本來就不是熱路徑，多一次查詢換掉一整類跳脫問題很划算。
   */
  const taggedIds = await noteIdsForTagSearch(query);

  const [byContent, byTag] = await Promise.all([
    run(base().ilike("content", `%${escapeLikePattern(query)}%`)),
    taggedIds.length > 0 ? run(base().in("id", taggedIds)) : Promise.resolve([]),
  ]);

  // 先併成一份再轉，標籤名稱那趟查詢才只跑一次；mergeNoteLists 會去掉重複並排序
  return mergeNoteLists(await toSummaries([...byContent, ...byTag]));
}

async function run(request: PromiseLike<{ data: NoteRow[] | null; error: { message: string } | null }>) {
  const { data, error } = await request;
  if (error) {
    throw new Error(`讀取筆記列表失敗：${error.message}`);
  }
  return data ?? [];
}

async function toSummaries(rows: NoteRow[]): Promise<NoteSummary[]> {
  const tags = await tagNamesByNote(rows.map((row) => row.id));
  return rows.map((row) => toSummary(row, tags.get(row.id) ?? []));
}

/** 單篇筆記的完整內容。找不到（或不屬於這個使用者）時回傳 null。 */
export async function getNote(id: string): Promise<NoteDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notes")
    .select("id, content, title, pinned, updated_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`讀取筆記失敗：${error.message}`);
  }

  return data;
}

/** 側邊欄的計數。 */
export async function countNotes() {
  const supabase = await createClient();

  const [all, trashed, pinned] = await Promise.all([
    supabase.from("notes").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("notes").select("*", { count: "exact", head: true }).not("deleted_at", "is", null),
    supabase
      .from("notes")
      .select("*", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("pinned", true),
  ]);

  return {
    all: all.count ?? 0,
    trashed: trashed.count ?? 0,
    pinned: pinned.count ?? 0,
  };
}

