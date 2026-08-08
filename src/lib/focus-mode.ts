/**
 * 專注模式的規則。
 *
 * 專注模式收起導覽（側邊欄、筆記列表、分頁列），把整個視窗讓給一篇筆記。
 * 它**只是把東西藏起來**，底下的狀態一個都不動 —— 側邊欄的收合、檢視模式、
 * 分頁、捲動位置、游標位置都還在原處，所以退出時自然就回到原本的樣子，
 * 不需要另外存一份快照再還原。唯一例外是大綱（見 workspace-focus.tsx）。
 *
 * 純函式放這裡，測試不必拉起 React。
 */

/** 專注狀態存在瀏覽器，跟分頁列同一個層級的「這台機器的工作狀態」。 */
export const FOCUS_STORAGE_KEY = "nexum.workspace.focus";

/** 這些元素出現時代表畫面上有浮層，ESC 要先關它們。 */
export const OVERLAY_SELECTOR = '[role="menu"], [role="dialog"], [role="tooltip"], .cm-tooltip';

type KeyLike = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
};

/**
 * 是不是專注模式的快捷鍵（⌘⇧F／Ctrl+Shift+F）。
 *
 * 挑這一組是因為目前沒人用：編輯器占了 ⌘B／⌘I／⌘K／⌘S／⌘⇧C／⌘⇧M／⌘⇧H，
 * 應用層占了 ⌘1／⌘2／⌘3／⌘\，CodeMirror 的搜尋是 ⌘F（沒有 shift）。
 */
export function isFocusShortcut(event: KeyLike): boolean {
  if (event.altKey || !event.shiftKey) {
    return false;
  }
  // Mac 用 ⌘，Windows／Linux 用 Ctrl
  if (!event.metaKey && !event.ctrlKey) {
    return false;
  }
  return event.key.toLowerCase() === "f";
}

/**
 * ESC 該不該退出專注模式。
 *
 * 三個都要成立：真的按了 ESC、目前在專注模式、而且畫面上沒有更上層的東西要關。
 * `defaultPrevented` 涵蓋 CodeMirror 自己處理掉的情況（自動完成的選單、
 * 「按 ESC 再按 Tab 移出編輯器」的無障礙出口）—— 那些已經吃掉這次按鍵了。
 */
export function shouldExitOnEscape(input: {
  key: string;
  defaultPrevented: boolean;
  hasOverlay: boolean;
  focused: boolean;
}): boolean {
  if (input.key !== "Escape" || !input.focused) {
    return false;
  }
  return !input.defaultPrevented && !input.hasOverlay;
}

/** 存起來的值。壞掉或沒存過都當作「不在專注模式」。 */
export function parseStoredFocus(raw: string | null): boolean {
  return raw === "1";
}

export function serializeFocus(focused: boolean): string {
  return focused ? "1" : "0";
}
