"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { saveNote } from "@/lib/actions/notes";

/** 停止輸入多久之後存檔。 */
const AUTOSAVE_DELAY_MS = 1000;

/** 存檔失敗後隔多久自動重試。 */
const RETRY_DELAY_MS = 5000;

export type SaveStatus = "saved" | "dirty" | "saving" | "conflict" | "error";

export type AutosaveState = {
  status: SaveStatus;
  message?: string;
  /** 有沒有還沒寫進資料庫的改動，離開頁面前的提醒用得到。 */
  hasUnsavedChanges: boolean;
};

/**
 * 自動存檔。
 *
 * 存檔時帶上前一次拿到的 updated_at 做樂觀鎖：對不上代表這篇在別的地方被改過
 * （最常見的是自己在 Mac 上開了兩個分頁），這時停下來顯示衝突，不要默默蓋掉。
 */
export function useAutosave(
  noteId: string,
  content: string,
  initialUpdatedAt: string,
  /** 最新的內容，可能還沒進到 content。卸載時的補存用這個。 */
  latestContent?: React.RefObject<string>,
) {
  const [state, setState] = useState<AutosaveState>({
    status: "saved",
    hasUnsavedChanges: false,
  });

  // 這兩個值只在存檔成功時前進，放在 ref 裡才不會每次改動都重跑 effect。
  const updatedAtRef = useRef(initialUpdatedAt);
  const savedContentRef = useRef(content);

  // 給卸載時的補存讀。effect 的依賴陣列是空的，只能從 ref 拿最新值。
  const contentRef = useRef(content);
  const noteIdRef = useRef(noteId);
  useEffect(() => {
    contentRef.current = content;
    noteIdRef.current = noteId;
  }, [content, noteId]);

  // 失敗後遞增，用來重新觸發下面的 effect。
  const [retryCount, setRetryCount] = useState(0);

  // Cmd+S 用：下一次 effect 跑的時候不要等防抖，直接存。
  const flushRef = useRef(false);
  const [flushToken, setFlushToken] = useState(0);

  useEffect(() => {
    if (content === savedContentRef.current) {
      return;
    }

    const delay = flushRef.current ? 0 : AUTOSAVE_DELAY_MS;
    flushRef.current = false;

    setState({ status: "dirty", hasUnsavedChanges: true });

    const timer = setTimeout(async () => {
      setState({ status: "saving", hasUnsavedChanges: true });

      const result = await saveNote(noteId, content, updatedAtRef.current);

      if (result.status === "saved") {
        updatedAtRef.current = result.updatedAt;
        savedContentRef.current = content;
        setState({ status: "saved", hasUnsavedChanges: false });
        return;
      }

      if (result.status === "conflict") {
        // 衝突不自動重試 —— 重試只會用這邊的內容蓋掉對方，那正是要避免的事。
        setState({
          status: "conflict",
          hasUnsavedChanges: true,
          message: "這篇筆記在別的地方被改過了。重新整理會看到最新版本，但這裡的改動會不見。",
        });
        return;
      }

      setState({ status: "error", hasUnsavedChanges: true, message: result.message });
      setTimeout(() => setRetryCount((count) => count + 1), RETRY_DELAY_MS);
    }, delay);

    return () => clearTimeout(timer);
  }, [content, noteId, retryCount, flushToken]);

  /*
   * 卸載時補存。
   *
   * 打完字後一秒內切到別篇筆記，元件就卸載了，上面那個計時器會被清掉，
   * 那次修改永遠不會寫進資料庫。beforeunload 只擋得住關分頁，擋不住站內切換。
   *
   * 依賴陣列刻意留空：這個 effect 只該在真正卸載時跑一次，
   * 需要的值全部從 ref 讀，所以不需要列進依賴。
   */
  useEffect(() => {
    return () => {
      /*
       * lint 會警告「ref 的值到 cleanup 執行時可能已經變了」——
       * 這裡要的正是卸載當下的值，不是 effect 建立時的值，所以刻意這樣讀。
       */
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const pending = latestContent?.current ?? contentRef.current;

      if (pending !== savedContentRef.current) {
        // 不 await：元件都要消失了，等不到結果，也沒有地方顯示錯誤。
        void saveNote(noteIdRef.current, pending, updatedAtRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 還沒存完就關分頁的話擋一下。瀏覽器只會顯示自己的預設訊息，帶什麼字串都一樣。
  useEffect(() => {
    if (!state.hasUnsavedChanges) {
      return;
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [state.hasUnsavedChanges]);

  const retryNow = useCallback(() => setRetryCount((count) => count + 1), []);

  /** 立刻存檔，不等防抖。內容沒有改動時什麼都不做。 */
  const saveNow = useCallback(() => {
    flushRef.current = true;
    setFlushToken((token) => token + 1);
  }, []);

  return { ...state, retryNow, saveNow };
}
