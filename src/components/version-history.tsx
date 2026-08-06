"use client";

import { useState, useTransition } from "react";

import { fetchVersions, restoreVersion } from "@/lib/actions/versions";
import type { VersionSummary } from "@/lib/note-display";

export function VersionHistory({ noteId }: { noteId: string }) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }

    setOpen(true);
    setError(undefined);
    startTransition(async () => {
      try {
        setVersions(await fetchVersions(noteId));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "讀取版本紀錄失敗。");
      }
    });
  }

  function restore(versionId: string) {
    startTransition(async () => {
      const result = await restoreVersion(noteId, versionId);

      if (result.status === "error") {
        setError(result.message);
        return;
      }

      // 整頁重載，讓編輯器內容與自動存檔的樂觀鎖狀態一起重新同步。
      // 還原是低頻的明確操作，用重載換掉一整串狀態同步的邏輯很划算。
      window.location.reload();
    });
  }

  return (
    <div className="relative">
      <button type="button" onClick={toggle} className="text-ink-muted hover:text-accent">
        歷史
      </button>

      {open ? (
        <div className="absolute right-0 z-10 mt-2 w-72 rounded-lg border border-line bg-surface shadow-lg">
          <div className="border-b border-line px-3 py-2 text-xs text-ink-muted">
            每 10 分鐘留一份，最多 30 份
          </div>

          {error ? (
            <p role="alert" className="px-3 py-3 text-xs text-accent">
              {error}
            </p>
          ) : pending && !versions ? (
            <p className="px-3 py-3 text-xs text-ink-muted">讀取中…</p>
          ) : !versions || versions.length === 0 ? (
            <p className="px-3 py-3 text-xs text-ink-muted">
              還沒有快照。第一次存檔後才會開始累積。
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {versions.map((version) => (
                <li
                  key={version.id}
                  className="flex items-center justify-between gap-3 border-b border-line/60 px-3 py-2 text-xs last:border-b-0"
                >
                  <span className="font-mono">{version.created_label}</span>
                  <span className="text-ink-muted">{version.length} 字</span>
                  <button
                    type="button"
                    onClick={() => restore(version.id)}
                    disabled={pending}
                    className="text-accent hover:underline disabled:opacity-40"
                  >
                    還原
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-line px-3 py-2 text-xs text-ink-muted">
            還原前會先把現在的內容也存成一份，按錯了回得去。
          </div>
        </div>
      ) : null}
    </div>
  );
}
