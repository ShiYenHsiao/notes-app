"use client";

import { useEffect } from "react";

const STORAGE_KEY = "nexum.knowledge-index.v1";
const MAX_BATCHES_PER_MOUNT = 5;

/**
 * migration 不用 regex 猜 Markdown context；登入後以同一支正式 parser 小批重建。
 * cursor 存在本機，失敗或關頁都能重試，而且不會阻塞筆記正文的正常保存。
 */
export function KnowledgeIndexRepair() {
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "done") {
        return;
      }

      let cursor = stored || undefined;
      try {
        for (let batch = 0; batch < MAX_BATCHES_PER_MOUNT && !cancelled; batch += 1) {
          const response = await fetch("/api/knowledge/rebuild", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cursor }),
          });
          if (!response.ok) {
            throw new Error("knowledge rebuild failed");
          }
          const result = (await response.json()) as {
            done: boolean;
            nextCursor: string | null;
          };
          if (result.done) {
            window.localStorage.setItem(STORAGE_KEY, "done");
            return;
          }
          cursor = result.nextCursor ?? undefined;
          if (cursor) {
            window.localStorage.setItem(STORAGE_KEY, cursor);
          }
        }
      } catch {
        // 正文保存不依賴 backfill；保留 cursor，下一次進站會從同一批重試。
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
