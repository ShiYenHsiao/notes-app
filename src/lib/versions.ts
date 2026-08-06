import "server-only";

import type { VersionSummary } from "@/lib/note-display";
import { createClient } from "@/lib/supabase/server";

export type { VersionSummary };

/**
 * 每隔多久才留一份快照。
 *
 * 自動存檔是每停一秒就寫一次，每次都留快照的話幾分鐘就會累積上百筆垃圾。
 * 十分鐘一份的粒度足以救回「剛剛不小心刪掉一整段」這種最常見的意外。
 */
const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;

/** 每篇筆記最多留幾份，超過的從最舊的砍。 */
const MAX_VERSIONS_PER_NOTE = 30;

function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/**
 * 這篇筆記現在該不該留一份快照。
 *
 * 判斷依據是「距離上一份快照過了多久」，不是「改了多少」—— 改動量難以定義，
 * 時間間隔簡單而且行為可預期。
 */
export async function isSnapshotDue(noteId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("versions")
    .select("created_at")
    .eq("note_id", noteId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // 快照是保險機制，壞掉不該擋住存檔本身。
    console.error("查詢快照時間失敗", error);
    return false;
  }

  if (!data) {
    return true;
  }

  return Date.now() - new Date(data.created_at).getTime() > SNAPSHOT_INTERVAL_MS;
}

/**
 * 寫入一份快照，並砍掉超出上限的舊快照。
 *
 * `content` 是「存檔前」的內容，不是剛存進去的那份 —— 快照要記錄的是可以回去的狀態。
 * 存後才留的話，第一次把整篇刪光再存，快照裡就只剩空字串了。
 */
export async function writeSnapshot(noteId: string, content: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.from("versions").insert({ note_id: noteId, content });
  if (error) {
    console.error("寫入快照失敗", error);
    return;
  }

  const { data: stale } = await supabase
    .from("versions")
    .select("id")
    .eq("note_id", noteId)
    .order("created_at", { ascending: false })
    .range(MAX_VERSIONS_PER_NOTE, MAX_VERSIONS_PER_NOTE + 200);

  if (stale && stale.length > 0) {
    await supabase
      .from("versions")
      .delete()
      .in(
        "id",
        stale.map((row) => row.id),
      );
  }
}

/** 這篇筆記的快照清單，新的在前。 */
export async function listVersions(noteId: string): Promise<VersionSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("versions")
    .select("id, created_at, content")
    .eq("note_id", noteId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`讀取版本紀錄失敗：${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    created_label: formatTimestamp(row.created_at),
    length: row.content.length,
  }));
}

/** 取一份快照的完整內容。 */
export async function getVersionContent(versionId: string): Promise<string | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("versions")
    .select("content")
    .eq("id", versionId)
    .maybeSingle();

  if (error) {
    throw new Error(`讀取版本內容失敗：${error.message}`);
  }

  return data?.content ?? null;
}
