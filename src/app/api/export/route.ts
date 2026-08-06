import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { buildExportZip } from "@/lib/export";

/**
 * 匯出全部筆記。
 *
 * 用 Route Handler 而不是 Server Action —— 這裡要回傳的是一個檔案下載，
 * Server Action 沒辦法直接觸發瀏覽器的下載行為。
 */
export async function GET() {
  await requireUser();

  const { blob, filename } = await buildExportZip();

  return new NextResponse(blob, {
    headers: {
      "Content-Type": "application/zip",
      // filename* 用 UTF-8 編碼，中文檔名才不會變成亂碼
      "Content-Disposition": `attachment; filename="notes-export.zip"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
