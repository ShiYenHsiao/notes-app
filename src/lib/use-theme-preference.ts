"use client";

import { useCallback, useSyncExternalStore } from "react";

import { applyTheme, readStoredTheme, storeTheme, type ThemePreference } from "./theme";

/**
 * 主題偏好。
 *
 * 值存在 localStorage —— 那是 React 外面的狀態，所以用 useSyncExternalStore 接，
 * 不是 useState 配 useEffect 同步。順帶處理兩件事：同一頁裡有多個地方讀它時會一起更新
 * （storage 事件只跨分頁不跨元件，所以自己再維護一組 listener），SSR 也不會有落差。
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** 伺服器端讀不到 localStorage，先當作跟隨系統，掛載後 React 會自動校正。 */
function getServerSnapshot(): ThemePreference {
  return "system";
}

export function useThemePreference(): [ThemePreference, (next: ThemePreference) => void] {
  const preference = useSyncExternalStore(subscribe, readStoredTheme, getServerSnapshot);

  const choose = useCallback((next: ThemePreference) => {
    storeTheme(next);
    applyTheme(next);
    for (const listener of listeners) {
      listener();
    }
  }, []);

  return [preference, choose];
}
