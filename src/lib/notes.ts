import "server-only";

import type { NoteDetail, NoteSummary } from "@/lib/note-display";
import { createClient } from "@/lib/supabase/server";

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

function toSummary(row: NoteRow): NoteSummary {
  return {
    id: row.id,
    title: row.title,
    excerpt: toExcerpt(row.content),
    pinned: row.pinned,
    updated_at: row.updated_at,
    updated_label: formatUpdatedAt(row.updated_at),
  };
}

/**
 * 筆記列表。`query` 有值時做全文搜尋。
 *
 * 搜尋只比對 content —— title 是從內文第一行推導出來的，本來就是 content 的子字串，
 * 另外再比一次沒有意義，還要處理 PostgREST 的 or 語法跳脫。
 */
export async function listNotes(options: { query?: string; trashed?: boolean } = {}) {
  const supabase = await createClient();

  let request = supabase
    .from("notes")
    .select("id, title, content, pinned, updated_at")
    .limit(LIST_LIMIT);

  request = options.trashed
    ? request.not("deleted_at", "is", null).order("deleted_at", { ascending: false })
    : request
        .is("deleted_at", null)
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false });

  const query = options.query?.trim();
  if (query) {
    request = request.ilike("content", `%${escapeLikePattern(query)}%`);
  }

  const { data, error } = await request;
  if (error) {
    throw new Error(`讀取筆記列表失敗：${error.message}`);
  }

  return (data ?? []).map(toSummary);
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

  const [all, trashed] = await Promise.all([
    supabase.from("notes").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("notes").select("*", { count: "exact", head: true }).not("deleted_at", "is", null),
  ]);

  return {
    all: all.count ?? 0,
    trashed: trashed.count ?? 0,
  };
}

