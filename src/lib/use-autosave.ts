"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { noteRevision, saveNote } from "@/lib/actions/notes";
import { classifyConflict } from "@/lib/save-conflict";

/** 停止輸入多久之後存檔。 */
const AUTOSAVE_DELAY_MS = 1000;

/** 存檔失敗後隔多久自動重試。 */
const RETRY_DELAY_MS = 5000;

export type SaveStatus = "saved" | "dirty" | "saving" | "rename" | "conflict" | "error";

export type AutosaveState = {
  status: SaveStatus;
  message?: string;
  /** 有沒有還沒寫進資料庫的改動，離開頁面前的提醒用得到。 */
  hasUnsavedChanges: boolean;
  rename?: { oldTitle: string; newTitle: string; sourceCount: number };
};

const CONFLICT_MESSAGE =
  "這篇筆記在別的地方被改過了。重新整理會看到最新版本，但這裡的改動會不見。";

/**
 * 自動存檔。
 *
 * 存檔時帶上前一次拿到的 `updated_at` 做樂觀鎖。這裡有兩件事必須成立，缺一個都會
 * 產生「明明只有我一個人在打字，卻一直說被別人改過」：
 *
 * 1. **一次只能有一個存檔在飛。** 兩次存檔帶著同一個 `updated_at` 送出去，第二次一定
 *    撞到自己的樂觀鎖。本機看不出來（一次存檔幾十毫秒），線上一次要一秒上下，
 *    打字打到一半按 ⌘S 就會撞到。
 * 2. **對不上的時候要先分辨是誰改的。** 按一下釘選也會讓 `updated_at` 前進（trigger
 *    是 for each row，不管改哪一欄），那時候內容根本沒變，卻會讓這個編輯器從此存不進去。
 *    判斷規則在 lib/save-conflict.ts。
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

  /*
   * 存檔的排隊。
   *
   * savingRef 標記「現在有一個在飛」，queuedRef 記下「它回來之後還要再存一次」，
   * queueToken 則是把那個「再存一次」丟回 effect 的方式。inFlightRef 讓卸載時的補存
   * 可以接在在飛的那一次後面 —— 直接送會用到過期的 token，最後幾個字就不見了。
   */
  const savingRef = useRef(false);
  const queuedRef = useRef(false);
  const [queueToken, setQueueToken] = useState(0);
  const inFlightRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRenameRef = useRef<string | null>(null);

  /** 連續自動恢復的次數。存檔成功就歸零。 */
  const recoveriesRef = useRef(0);

  const runSave = useCallback(async (payload: string, confirmRename = false) => {
    savingRef.current = true;
    setState({ status: "saving", hasUnsavedChanges: true });

    try {
      const result = await saveNote(
        noteIdRef.current,
        payload,
        updatedAtRef.current,
        confirmRename,
      );

      if (result.status === "saved") {
        updatedAtRef.current = result.updatedAt;
        savedContentRef.current = payload;
        recoveriesRef.current = 0;
        setState({ status: "saved", hasUnsavedChanges: false });
        return;
      }

      if (result.status === "rename-required") {
        pendingRenameRef.current = payload;
        setState({
          status: "rename",
          hasUnsavedChanges: true,
          message: "改名會更新所有確定指向這篇筆記的 Wiki Link。",
          rename: {
            oldTitle: result.oldTitle,
            newTitle: result.newTitle,
            sourceCount: result.sourceCount,
          },
        });
        return;
      }

      if (result.status === "conflict") {
        const revision = await noteRevision(noteIdRef.current);
        const verdict = classifyConflict({
          current: revision?.content ?? null,
          lastSaved: savedContentRef.current,
          recoveries: recoveriesRef.current,
        });

        if (verdict === "adopt" && revision) {
          // 沒有第二個作者，只是我們手上的 token 過期了：換上新的再存一次。
          recoveriesRef.current += 1;
          updatedAtRef.current = revision.updatedAt;
          flushRef.current = true; // 不用再等一秒防抖
          queuedRef.current = true;
          return;
        }

        setState({
          status: "conflict",
          hasUnsavedChanges: true,
          message: CONFLICT_MESSAGE,
        });
        return;
      }

      setState({ status: "error", hasUnsavedChanges: true, message: result.message });
      setTimeout(() => setRetryCount((count) => count + 1), RETRY_DELAY_MS);
    } finally {
      savingRef.current = false;

      if (queuedRef.current) {
        queuedRef.current = false;
        setQueueToken((token) => token + 1);
      }
    }
  }, []);

  useEffect(() => {
    if (content === savedContentRef.current) {
      return;
    }

    const delay = flushRef.current ? 0 : AUTOSAVE_DELAY_MS;
    flushRef.current = false;
    pendingRenameRef.current = null;

    setState({ status: "dirty", hasUnsavedChanges: true });

    const timer = setTimeout(() => {
      if (savingRef.current) {
        // 上一次還沒回來。等它結束再排一次 —— 那時才拿得到新的 updated_at。
        queuedRef.current = true;
        return;
      }
      inFlightRef.current = runSave(content);
    }, delay);

    return () => clearTimeout(timer);
  }, [content, noteId, retryCount, flushToken, queueToken, runSave]);

  /*
   * 卸載時補存。
   *
   * 打完字後一秒內切到別篇筆記，元件就卸載了，上面那個計時器會被清掉，
   * 那次修改永遠不會寫進資料庫。beforeunload 只擋得住關分頁，擋不住站內切換。
   *
   * 接在 inFlightRef 後面而不是直接送：如果那時候還有一次存檔在飛，直接送會用到
   * 過期的 updated_at 而被樂觀鎖擋下來，最後幾個字就這樣沒了。ref 在卸載後仍然活著，
   * 所以在飛的那一次回來時會把新的 token 寫進去，接著跑的補存就拿得到。
   *
   * 依賴陣列刻意留空：這個 effect 只該在真正卸載時跑一次。
   */
  useEffect(() => {
    return () => {
      void inFlightRef.current.then(() => {
        /*
         * lint 會警告「ref 的值到 cleanup 執行時可能已經變了」——
         * 這裡要的正是卸載當下的值，不是 effect 建立時的值，所以刻意這樣讀。
         */
        // eslint-disable-next-line react-hooks/exhaustive-deps
        const pending = latestContent?.current ?? contentRef.current;

        if (pending !== savedContentRef.current) {
          // 不 await：元件都要消失了，等不到結果，也沒有地方顯示錯誤。
          return saveNote(noteIdRef.current, pending, updatedAtRef.current);
        }
      });
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

  const confirmRename = useCallback(() => {
    const pending = pendingRenameRef.current;
    if (!pending || savingRef.current) {
      return;
    }
    inFlightRef.current = runSave(pending, true);
  }, [runSave]);

  const cancelRename = useCallback(() => {
    pendingRenameRef.current = null;
    setState({
      status: "dirty",
      hasUnsavedChanges: true,
      message: "改名尚未儲存。",
    });
  }, []);

  /** 立刻存檔，不等防抖。內容沒有改動時什麼都不做。 */
  const saveNow = useCallback(() => {
    flushRef.current = true;
    setFlushToken((token) => token + 1);
  }, []);

  return { ...state, retryNow, saveNow, confirmRename, cancelRename };
}
