/**
 * 筆記的型別與顯示規則。
 *
 * 這個檔案刻意不 import 任何伺服器端的東西 —— 客戶端元件要用型別或 displayTitle 時
 * 從這裡拿，才不會把 supabase/server（用到 next/headers）一路拉進瀏覽器的 bundle。
 */

/** 列表用的精簡欄位，不含完整內文。 */
export type NoteSummary = {
  id: string;
  title: string | null;
  excerpt: string;
  pinned: boolean;
  updated_at: string;
  /** 已經在伺服器端格式化好的時間字串。 */
  updated_label: string;
  /** 標籤名稱。列表只顯示名字，不需要 id。 */
  tags: string[];
};

export type NoteDetail = {
  id: string;
  content: string;
  title: string | null;
  pinned: boolean;
  updated_at: string;
};

/** 版本紀錄清單用。 */
export type VersionSummary = {
  id: string;
  created_at: string;
  created_label: string;
  /** 快照當下的字數，讓人一眼看出哪一份是「還沒被刪掉」的那份。 */
  length: number;
};

/** 側邊欄與標籤列顯示用。count 是掛在這個標籤下、還沒被刪除的筆記數。 */
export type TagSummary = {
  id: string;
  name: string;
  count: number;
};

/** 標籤名稱的正規化規則，新增與比對都走這裡。 */
export function normalizeTagName(input: string): string {
  return input.trim().replace(/\s+/g, " ").slice(0, TAG_NAME_MAX_LENGTH);
}

/** 對齊資料表上的 check constraint。 */
export const TAG_NAME_MAX_LENGTH = 50;

/**
 * 從內文推導標題，跟資料庫的 generated column 同一套規則：
 * 取第一行、去掉開頭的 `#`、去掉前後空白，空的話回傳 null。
 *
 * 資料庫那份是存檔後才更新的，編輯時要即時顯示標題就得在前端再算一次。
 * 兩邊的規則必須一致，否則存檔前後標題會跳動 —— `tests/workspace.test.mjs` 有對應測試。
 */
export function titleFromContent(content: string): string | null {
  const firstLine = content.split("\n", 1)[0] ?? "";
  return firstLine.replace(/^#{1,6}[ \t]*/, "").trim() || null;
}

/**
 * 把幾份查詢結果併成一份列表：去掉重複，然後照列表的排序規則排。
 *
 * 排序跟 SQL 那邊一致 —— 釘選的在最前面，其餘按修改時間新到舊。搜尋要同時比對內文與
 * 標籤名稱，那是兩個查詢（標籤名在另一張表，硬湊成一句 SQL 要處理 PostgREST 的
 * `or()` 跳脫，使用者打個逗號就會壞掉），所以在這裡合併。
 */
export function mergeNoteLists(...lists: NoteSummary[][]): NoteSummary[] {
  const byId = new Map<string, NoteSummary>();

  for (const list of lists) {
    for (const note of list) {
      byId.set(note.id, note);
    }
  }

  return [...byId.values()].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    return b.updated_at.localeCompare(a.updated_at);
  });
}

/** 列表與編輯區共用的標題顯示規則：沒有標題就退回摘要，再沒有就顯示「無標題」。 */
export function displayTitle(note: { title: string | null; excerpt?: string }): string {
  if (note.title) {
    return note.title;
  }
  if (note.excerpt) {
    return note.excerpt;
  }
  return "無標題";
}
