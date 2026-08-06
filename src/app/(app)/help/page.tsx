import { readFile } from "node:fs/promises";
import path from "node:path";

import { MarkdownPreview } from "@/components/markdown-preview";
import { requireUser } from "@/lib/auth";

/**
 * 內建的使用說明。
 *
 * 內容是專案裡的靜態檔案，**不進 Supabase**：
 * 它是程式的一部分而不是使用者的資料，跟著版本走才對。存進資料表的話會多出
 * 一筆能被刪除、釘選、改名、被搜尋結果混進來的假筆記，而且每次改文案都要寫一次
 * migration。放在 repo 裡則是改完 deploy 就更新，也不佔資料庫額度。
 *
 * 讀檔在 Server Component 裡做，內容不會經過資料庫也不會出現在 client bundle。
 */
export default async function HelpPage() {
  await requireUser();

  const file = path.join(process.cwd(), "src", "content", "help.md");
  const content = await readFile(file, "utf8");

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-5 py-2.5">
        <span className="eyebrow">內建頁面</span>
        <span className="text-[11px] text-ink-muted">不會存進資料庫，也不會出現在筆記列表</span>
      </header>

      <div className="min-w-0 flex-1 overflow-y-auto bg-paper px-7 py-7">
        <div className="mx-auto max-w-[46rem]">
          <MarkdownPreview content={content} />
        </div>
      </div>
    </div>
  );
}
