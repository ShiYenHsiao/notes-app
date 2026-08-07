/**
 * 分頁的純規則。
 *
 * 跟 use-open-tabs.ts 拆開是為了測試：那支要 React 與 next/navigation，
 * 這支只有字串與陣列，node --test 直接 import 就能跑。
 */

/** 內建說明頁也能當成一個分頁。它沒有 UUID，用這個當代號。 */
export const HELP_TAB_ID = "help";

/** 這個網址對應到哪個分頁。不是筆記也不是說明頁就回傳 null（例如垃圾桶）。 */
export function tabIdForPath(pathname: string): string | null {
  if (pathname === "/help") {
    return HELP_TAB_ID;
  }

  const match = /^\/n\/([^/?#]+)/.exec(pathname);
  return match ? match[1] : null;
}

export function pathForTab(id: string): string {
  return id === HELP_TAB_ID ? "/help" : `/n/${id}`;
}

/**
 * 關掉目前這個分頁之後該跳去哪一個。
 *
 * 優先左邊那個 —— 從右往左關的時候游標會停在同一個位置上，跟瀏覽器與編輯器的慣例一致。
 * 左邊沒有就往右找，全部關完回到列表（null）。
 */
export function nextActiveAfterClose(ids: string[], closing: string): string | null {
  const index = ids.indexOf(closing);
  if (index === -1) {
    return null;
  }

  const rest = ids.filter((id) => id !== closing);
  return rest[index - 1] ?? rest[index] ?? null;
}

/**
 * 解析存起來的分頁清單。存壞了就當作沒有 —— 分頁列不值得讓整個工作區掛掉。
 */
export function parseStoredTabs(raw: string | null): string[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}
