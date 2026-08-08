import { NextResponse, type NextRequest } from "next/server";

import { cronSecret, hasServiceRoleKey } from "@/lib/env";
import { purgeExpiredNotes } from "@/lib/purge";
import { TRASH_RETENTION_DAYS } from "@/lib/retention";

/**
 * 垃圾桶的定期清理。
 *
 * 由 Vercel Cron 每天呼叫一次（設定在 `vercel.json`），它會自動帶上
 * `Authorization: Bearer $CRON_SECRET`。
 *
 * **為什麼放在應用層而不是資料庫排程**：Postgres 刪得掉資料列，刪不掉 Storage 上的
 * 檔案。真正會吃掉免費額度的是那些圖片，所以清理必須在看得到 Storage 的地方做。
 * 而且放在 repo 裡表示這段邏輯跟著版本走，不必記得去 Dashboard 開東西。
 */
export async function GET(request: NextRequest) {
  const secret = cronSecret();

  /*
   * 沒設定通行碼就一律拒絕。
   * 一個誰都能呼叫的刪除端點比沒有排程還糟 —— 寧可清理沒跑，也不要開一個洞。
   */
  if (!secret) {
    return NextResponse.json(
      { error: "尚未設定 CRON_SECRET，清理端點停用中。" },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!hasServiceRoleKey()) {
    return NextResponse.json(
      { error: "尚未設定 SUPABASE_SERVICE_ROLE_KEY，清理無法略過 RLS。" },
      { status: 503 },
    );
  }

  const result = await purgeExpiredNotes();

  return NextResponse.json({
    ok: true,
    retentionDays: TRASH_RETENTION_DAYS,
    ...result,
  });
}
