"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  HELP_TAB_ID,
  nextActiveAfterClose,
  parseStoredTabs,
  pathForTab,
  tabIdForPath,
} from "./tabs";

/**
 * 工作區的分頁。
 *
 * **狀態存在瀏覽器，不進資料庫**：開著哪幾篇是「這台機器現在的工作狀態」，
 * 不是筆記本身的資料。存進 Supabase 的話，手機開個唯讀頁面也會去改桌機的分頁列，
 * 而且每加一個欄位都要寫 migration。localStorage 沒有這些問題，清掉也不痛。
 *
 * 實作上是一個 module 層的小 store 配 useSyncExternalStore，而不是 useState 加
 * useEffect 同步 —— localStorage 本來就是「React 外面的狀態」，用對的工具接它會
 * 順便換到兩個好處：同一個瀏覽器開兩個視窗時互相同步，SSR 也不會有 hydration 落差。
 *
 * 判斷用的純規則都在 tabs.ts，那支有測試。
 */
const STORAGE_KEY = "notes.workspace.tabs";

/** 伺服器端與尚未讀取時的空值。必須是同一個 reference，否則會無限重繪。 */
const EMPTY: string[] = [];

let cache: string[] | null = null;
const listeners = new Set<() => void>();

function snapshot(): string[] {
  cache ??= parseStoredTabs(window.localStorage.getItem(STORAGE_KEY));
  return cache;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // 同一個瀏覽器開了第二個視窗時，兩邊的分頁列要一致。
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      cache = parseStoredTabs(event.newValue);
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

function write(next: string[]) {
  cache = next;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  for (const notify of listeners) {
    notify();
  }
}

export type OpenTabs = {
  /** 目前開著的分頁，已經濾掉不存在的筆記。 */
  ids: string[];
  /** 網址對應的分頁。停在垃圾桶之類的頁面時是 null。 */
  activeId: string | null;
  open(id: string): void;
  close(id: string): void;
  closeOthers(id: string): void;
};

/**
 * @param knownIds 目前還存在的筆記 id。刪掉的筆記要從分頁列消失，但只在畫面上濾掉 ——
 *   列表有筆數上限也有篩選，不能拿它當「這篇不存在了」的證據去改儲存的內容。
 */
export function useOpenTabs(knownIds: ReadonlySet<string>): OpenTabs {
  const pathname = usePathname();
  const router = useRouter();
  const activeId = tabIdForPath(pathname);

  const stored = useSyncExternalStore(subscribe, snapshot, () => EMPTY);

  // 走到哪一篇就把它加進分頁列，不管是點列表、直接貼網址還是重新整理進來的。
  useEffect(() => {
    if (activeId && !snapshot().includes(activeId)) {
      write([...snapshot(), activeId]);
    }
  }, [activeId]);

  const close = useCallback(
    (id: string) => {
      const current = snapshot();
      if (id === activeId) {
        const fallback = nextActiveAfterClose(current, id);
        router.push(fallback ? pathForTab(fallback) : "/");
      }
      write(current.filter((open) => open !== id));
    },
    [activeId, router],
  );

  const closeOthers = useCallback(
    (id: string) => {
      write(snapshot().filter((open) => open === id));
      if (activeId !== id) {
        router.push(pathForTab(id));
      }
    },
    [activeId, router],
  );

  const open = useCallback(
    (id: string) => {
      router.push(pathForTab(id));
    },
    [router],
  );

  const ids = stored.filter((id) => id === HELP_TAB_ID || knownIds.has(id));

  return { ids, activeId, open, close, closeOthers };
}
