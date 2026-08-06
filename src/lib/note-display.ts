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
};

export type NoteDetail = {
  id: string;
  content: string;
  title: string | null;
  pinned: boolean;
  updated_at: string;
};

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
