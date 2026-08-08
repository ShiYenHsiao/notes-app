/**
 * 樂觀鎖對不上的時候，要分辨兩種情況。
 *
 * 存檔帶著上次拿到的 `updated_at`，對不上就代表那一列在我們手上這份之後被動過。
 * 但「被動過」不等於「有第二個作者」：
 *
 * - **自己的 token 過期**：按了釘選（那也是一次 update，trigger 照樣重設 updated_at）、
 *   或前一次存檔的回應還沒回來就又送了一次。內容其實還是我們上次寫進去的那份。
 * - **真的有人改過**：另一個分頁、另一台裝置、或剛剛還原了某個版本。
 *
 * 分辨的依據是「資料庫現在的內容，是不是我們上次成功寫進去的那份」。是的話沒有第二個
 * 作者，換上新的 token 再存一次就好；不是的話才是真衝突，這時候絕對不能自動重試 ——
 * 那等於拿我們這邊的內容蓋掉對方。
 */

/** 連續自動恢復的上限。有東西一直碰那一列時，不要無止境地重試下去。 */
export const MAX_CONFLICT_RECOVERIES = 3;

export type ConflictVerdict =
  /** 換上資料庫現在的 updated_at，重存一次。 */
  | "adopt"
  /** 停下來問使用者。 */
  | "conflict";

export function classifyConflict(input: {
  /** 資料庫現在的內容。筆記不見了（被刪或被丟進垃圾桶）時是 null。 */
  current: string | null;
  /** 我們上次成功寫進去的內容。 */
  lastSaved: string;
  /** 這一輪已經自動恢復幾次了。 */
  recoveries: number;
}): ConflictVerdict {
  // 讀不到就是筆記不在了，重存只會再失敗一次
  if (input.current === null) {
    return "conflict";
  }

  if (input.recoveries >= MAX_CONFLICT_RECOVERIES) {
    return "conflict";
  }

  return input.current === input.lastSaved ? "adopt" : "conflict";
}
