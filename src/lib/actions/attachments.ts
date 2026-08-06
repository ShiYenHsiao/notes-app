"use server";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 把已經上傳到 Storage 的檔案登記到 attachments 表。
 *
 * 檔案本身是瀏覽器直接傳給 Storage 的（不經過我們的伺服器，省頻寬也快得多），
 * 這個 action 只負責記帳，之後刪筆記時才知道有哪些檔案要一起回收。
 */
export async function recordAttachment(input: {
  noteId: string;
  storagePath: string;
  filename: string;
  size: number;
  mimeType: string;
}): Promise<void> {
  const user = await requireUser();

  // Storage 的 RLS policy 認的是路徑第一層資料夾，這裡再確認一次，
  // 避免有人用別人的路徑來登記。
  if (!input.storagePath.startsWith(`${user.id}/`)) {
    throw new Error("附件路徑不正確。");
  }

  const supabase = await createClient();

  const { error } = await supabase.from("attachments").insert({
    note_id: input.noteId,
    storage_path: input.storagePath,
    filename: input.filename,
    size: input.size,
    mime_type: input.mimeType,
  });

  if (error) {
    throw new Error(`登記附件失敗：${error.message}`);
  }
}
