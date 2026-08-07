"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { SaveStatus } from "./use-autosave";

/**
 * 編輯區的存檔狀態，讓分頁列也看得到。
 *
 * 同一時間只有一個編輯器掛載（切分頁等於換頁），所以這裡只記一筆就夠 ——
 * 不需要每篇一個狀態機。編輯區回報、分頁列讀取，兩邊不用互相認識。
 */
type Reported = { noteId: string; status: SaveStatus } | null;

const WorkspaceStatusContext = createContext<{
  reported: Reported;
  report: (value: Reported) => void;
}>({ reported: null, report: () => {} });

export function WorkspaceStatusProvider({ children }: { children: React.ReactNode }) {
  const [reported, setReported] = useState<Reported>(null);
  const report = useCallback((value: Reported) => setReported(value), []);
  const value = useMemo(() => ({ reported, report }), [reported, report]);

  return (
    <WorkspaceStatusContext.Provider value={value}>{children}</WorkspaceStatusContext.Provider>
  );
}

/** 編輯區用：回報目前這篇的存檔狀態，卸載時收回。 */
export function useReportSaveStatus(noteId: string, status: SaveStatus) {
  const { report } = useContext(WorkspaceStatusContext);

  useEffect(() => {
    report({ noteId, status });
    return () => report(null);
  }, [noteId, status, report]);
}

/** 分頁列用：這篇有沒有還沒寫進資料庫的改動。 */
export function useIsUnsaved(noteId: string): boolean {
  const { reported } = useContext(WorkspaceStatusContext);
  return reported?.noteId === noteId && reported.status !== "saved";
}
