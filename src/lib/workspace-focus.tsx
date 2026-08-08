"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";

import {
  FOCUS_STORAGE_KEY,
  isFocusShortcut,
  OVERLAY_SELECTOR,
  parseStoredFocus,
  serializeFocus,
  shouldExitOnEscape,
} from "./focus-mode";

/**
 * 專注模式的狀態。
 *
 * 跟分頁列同一套做法：module 層的小 store 配 useSyncExternalStore。理由也一樣 ——
 * 這是「這台機器現在的工作狀態」，存 localStorage 而不是 Supabase，順便得到跨視窗
 * 同步與零 hydration 落差。判斷規則在 focus-mode.ts，那支有測試。
 */

let cache: boolean | null = null;
const listeners = new Set<() => void>();

function snapshot(): boolean {
  cache ??= parseStoredFocus(window.localStorage.getItem(FOCUS_STORAGE_KEY));
  return cache;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key === FOCUS_STORAGE_KEY) {
      cache = parseStoredFocus(event.newValue);
      for (const notify of listeners) {
        notify();
      }
    }
  };

  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function write(next: boolean) {
  cache = next;
  window.localStorage.setItem(FOCUS_STORAGE_KEY, serializeFocus(next));
  for (const notify of listeners) {
    notify();
  }
}

const FocusContext = createContext<{
  focused: boolean;
  toggle: () => void;
  exit: () => void;
}>({ focused: false, toggle: () => {}, exit: () => {} });

export function WorkspaceFocusProvider({ children }: { children: React.ReactNode }) {
  const focused = useSyncExternalStore(subscribe, snapshot, () => false);

  const toggle = useCallback(() => write(!snapshot()), []);
  const exit = useCallback(() => write(false), []);

  /*
   * ⌘⇧F 走**捕獲階段**並且 stopPropagation。
   *
   * CodeMirror 綁的是 ⌘F（搜尋），但它的按鍵比對有 shift 回退 —— 按 ⌘⇧F 時
   * 搜尋面板也會跳出來，變成一次按鍵做了兩件事。在捕獲階段把它攔下來，
   * 這組鍵就完全屬於專注模式，編輯器不會看到它。
   */
  useEffect(() => {
    function onCapture(event: KeyboardEvent) {
      if (isFocusShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        toggle();
      }
    }

    window.addEventListener("keydown", onCapture, true);
    return () => window.removeEventListener("keydown", onCapture, true);
  }, [toggle]);

  /*
   * ESC 相反，走冒泡階段：選單、對話框、tooltip、CodeMirror 的自動完成都比
   * 專注模式「更上層」，按一次 ESC 只該關掉一件事。它們處理過的按鍵會帶著
   * defaultPrevented 上來，我們就不再動作。
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const hasOverlay = document.querySelector(OVERLAY_SELECTOR) !== null;

      if (
        shouldExitOnEscape({
          key: event.key,
          defaultPrevented: event.defaultPrevented,
          hasOverlay,
          focused: snapshot(),
        })
      ) {
        exit();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exit]);

  return (
    <FocusContext.Provider value={{ focused, toggle, exit }}>{children}</FocusContext.Provider>
  );
}

export function useFocusMode() {
  return useContext(FocusContext);
}
