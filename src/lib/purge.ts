import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { batchPaths, expiryCutoff } from "./retention";

/** 附件實際存放的 bucket，跟上傳與匯出用的是同一個。 */
const BUCKET = "attachments";

export type PurgeResult = {
  notes: number;
  files: number;
  /** 檔案刪不掉時記下來，但不中斷 —— 資料列還是該清。 */
  fileErrors: string[];
};

/**
 * 清掉丟進垃圾桶超過保留期限的筆記，連同它們在 Storage 的檔案。
 *
 * **順序很重要**：先把檔案路徑抓出來、刪檔案，最後才刪筆記。
 * 反過來的話 attachments 那幾列會被 `on delete cascade` 帶走，
 * 檔案就變成沒有人記得的孤兒，佔著 1 GB 的額度卻沒有任何介面看得到它們。
 *
 * migration 裡那支 `purge_deleted_notes()` 只刪資料列，不碰 Storage
 * （它自己的註解就寫了這件事），所以真正的清理放在應用層，那支留著當手動的備援。
 */
export async function purgeExpiredNotes(now = new Date()): Promise<PurgeResult> {
  const supabase = createAdminClient();
  const cutoff = expiryCutoff(now);

  const { data: expired, error: notesError } = await supabase
    .from("notes")
    .select("id")
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff);

  if (notesError) {
    throw new Error(`讀取過期筆記失敗：${notesError.message}`);
  }

  const noteIds = (expired ?? []).map((note) => note.id);
  if (noteIds.length === 0) {
    return { notes: 0, files: 0, fileErrors: [] };
  }

  const { data: attachments, error: attachmentsError } = await supabase
    .from("attachments")
    .select("storage_path")
    .in("note_id", noteIds);

  if (attachmentsError) {
    throw new Error(`讀取附件失敗：${attachmentsError.message}`);
  }

  const paths = (attachments ?? []).map((attachment) => attachment.storage_path);
  const fileErrors: string[] = [];
  let files = 0;

  for (const batch of batchPaths(paths)) {
    const { data, error } = await supabase.storage.from(BUCKET).remove(batch);

    if (error) {
      // 檔案刪不掉不該擋住資料列的清理，記下來讓呼叫端看得到就好
      fileErrors.push(error.message);
      continue;
    }

    files += data?.length ?? 0;
  }

  const { error: deleteError } = await supabase.from("notes").delete().in("id", noteIds);

  if (deleteError) {
    throw new Error(`刪除過期筆記失敗：${deleteError.message}`);
  }

  return { notes: noteIds.length, files, fileErrors };
}
