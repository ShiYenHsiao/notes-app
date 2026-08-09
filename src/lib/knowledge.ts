import "server-only";

import { createHash } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import {
  buildWikiLinkIndex,
  normalizeWikiTitle,
  parseWikiLinks,
  replaceWikiLinkTitle,
  resolveWikiTitlesFromCandidates,
  wikiLinkContext,
  type WikiLinkResolution,
  type WikiNoteCandidate,
} from "@/lib/wiki-links";

const BACKLINK_SOURCE_LIMIT = 20;
const BACKLINK_OCCURRENCE_LIMIT = 160;
const REBUILD_BATCH_LIMIT = 30;

type KnowledgeNoteRow = {
  id: string;
  title: string | null;
  content: string;
  updated_at: string;
};

export type BacklinkItem = {
  sourceId: string;
  sourceTitle: string;
  contexts: string[];
};

export type RenameSourceUpdate = {
  noteId: string;
  expectedUpdatedAt: string;
  content: string;
};

export type RenamePlan = {
  content: string;
  sources: RenameSourceUpdate[];
  /** 舊標題本身同名時，來源語意不確定，所以不改任何別篇正文。 */
  ambiguousOldTitle: boolean;
  /** 有來源要跟著改時，新標題若已存在，改完只會得到 ambiguous syntax。 */
  ambiguousNewTitle: boolean;
};

export function knowledgeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** 以可讀、未刪除的 notes 為準解析；note_links 的舊 target id 不參與這一步。 */
export async function resolveWikiTitles(
  titles: readonly string[],
): Promise<WikiLinkResolution[]> {
  const unique = [...new Set(titles.map(normalizeWikiTitle).filter(Boolean))];
  if (unique.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_note_titles", { p_titles: unique });

  if (error) {
    throw new Error(`解析知識連結失敗：${error.message}`);
  }

  return resolveWikiTitlesFromCandidates(unique, data ?? []);
}

export async function knowledgeForContent(content: string): Promise<WikiLinkResolution[]> {
  return resolveWikiTitles(parseWikiLinks(content).map((link) => link.title));
}

/**
 * 一篇正文成功寫入後重建索引。RPC 會再次比對 updated_at，因此較舊的請求晚到也只會
 * 回傳 false，不可能刪掉較新版本已建立的 index。
 */
export async function rebuildNoteLinks(note: KnowledgeNoteRow): Promise<boolean> {
  const resolutions = await knowledgeForContent(note.content);
  const entries = buildWikiLinkIndex(note.content, resolutions);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("replace_note_links", {
    p_source_note_id: note.id,
    p_expected_updated_at: note.updated_at,
    p_content_hash: knowledgeContentHash(note.content),
    p_links: entries.map((entry) => ({
      target_note_id: entry.targetNoteId,
      target_title: entry.targetTitle,
      occurrence_index: entry.occurrenceIndex,
      source_from: entry.from,
      source_to: entry.to,
    })),
  });

  if (error) {
    throw new Error(`重建知識連結索引失敗：${error.message}`);
  }
  return data;
}

/** 儲存後的 index 失敗不能把正文當成失敗；只記錄不含私人正文的診斷資訊。 */
export async function rebuildNoteLinksSafely(note: KnowledgeNoteRow): Promise<boolean> {
  try {
    return await rebuildNoteLinks(note);
  } catch (error) {
    console.error("知識連結索引待重試", {
      noteId: note.id,
      message: error instanceof Error ? error.message : "unknown error",
    });
    return false;
  }
}

/** migration 後由前端低優先、分批呼叫；cursor 可安全重試，正常保存不依賴它。 */
export async function rebuildKnowledgeBatch(cursor?: string, requestedLimit?: number) {
  const limit = Math.min(Math.max(requestedLimit ?? REBUILD_BATCH_LIMIT, 1), 50);
  const supabase = await createClient();
  let query = supabase
    .from("notes")
    .select("id, title, content, updated_at")
    .is("deleted_at", null)
    .order("id")
    .limit(limit + 1);
  if (cursor) {
    query = query.gt("id", cursor);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`讀取待重建筆記失敗：${error.message}`);
  }

  const rows = data ?? [];
  const batch = rows.slice(0, limit);
  for (const note of batch) {
    await rebuildNoteLinks(note);
  }

  return {
    processed: batch.length,
    nextCursor: rows.length > limit ? batch.at(-1)?.id ?? null : null,
    done: rows.length <= limit,
  };
}

/**
 * 刪除、還原或 Quick Create 會改變某個 title 的唯一解析結果；只重建索引裡已知引用
 * 這個 title 的來源。缺漏的舊索引由 background batch 補，不在互動路徑掃全庫。
 */
export async function rebuildSourcesForTitle(title: string | null): Promise<void> {
  const normalized = title ? normalizeWikiTitle(title) : "";
  if (!normalized) {
    return;
  }

  const supabase = await createClient();
  const { data: links, error } = await supabase
    .from("note_links")
    .select("source_note_id")
    .eq("target_title", normalized)
    .limit(500);
  if (error || !links?.length) {
    if (error) {
      console.error("讀取待修復知識連結失敗", { message: error.message });
    }
    return;
  }

  const sourceIds = [...new Set(links.map((link) => link.source_note_id))];
  const { data: notes, error: noteError } = await supabase
    .from("notes")
    .select("id, title, content, updated_at")
    .in("id", sourceIds)
    .is("deleted_at", null);
  if (noteError) {
    console.error("讀取待修復來源筆記失敗", { message: noteError.message });
    return;
  }

  for (const note of notes ?? []) {
    await rebuildNoteLinksSafely(note);
  }
}

export async function getBacklinks(targetNoteId: string): Promise<BacklinkItem[]> {
  const supabase = await createClient();
  const { data: links, error } = await supabase
    .from("note_links")
    .select("source_note_id, target_title, source_updated_at, content_hash")
    .eq("target_note_id", targetNoteId)
    .order("source_updated_at", { ascending: false })
    .limit(BACKLINK_OCCURRENCE_LIMIT);

  if (error) {
    throw new Error(`讀取反向連結失敗：${error.message}`);
  }
  if (!links?.length) {
    return [];
  }

  const sourceIds = [...new Set(links.map((link) => link.source_note_id))].slice(
    0,
    BACKLINK_SOURCE_LIMIT,
  );
  const { data: notes, error: noteError } = await supabase
    .from("notes")
    .select("id, title, content, updated_at")
    .in("id", sourceIds)
    .is("deleted_at", null);
  if (noteError) {
    throw new Error(`讀取反向連結來源失敗：${noteError.message}`);
  }

  const linkRowsBySource = new Map<string, typeof links>();
  for (const link of links) {
    linkRowsBySource.set(link.source_note_id, [
      ...(linkRowsBySource.get(link.source_note_id) ?? []),
      link,
    ]);
  }

  const byId = new Map((notes ?? []).map((note) => [note.id, note]));
  const output: BacklinkItem[] = [];
  for (const sourceId of sourceIds) {
    const note = byId.get(sourceId);
    const rows = linkRowsBySource.get(sourceId) ?? [];
    if (!note || rows.length === 0) {
      continue;
    }

    // 舊 index 不得掩蓋新 Markdown；不一致時寧可暫時不顯示，交給 batch 修復。
    if (rows[0].content_hash !== knowledgeContentHash(note.content)) {
      continue;
    }

    const acceptedTitles = new Set(rows.map((row) => row.target_title));
    const contexts = parseWikiLinks(note.content)
      .filter((link) => acceptedTitles.has(link.title))
      .slice(0, 3)
      .map((link) => wikiLinkContext(note.content, link));
    if (contexts.length === 0) {
      continue;
    }

    output.push({
      sourceId,
      sourceTitle: note.title ?? "無標題",
      contexts: [...new Set(contexts)],
    });
  }
  return output;
}

/**
 * 改名時不信任 note_links：直接以所有可寫 Markdown 重算，避免 stale index 漏改。
 * 只有舊標題在 scope 內唯一時，精確 `[[old]]` 才能確定指向這篇筆記。
 */
export async function planWikiLinkRename(input: {
  noteId: string;
  oldTitle: string;
  newTitle: string;
  targetContent: string;
}): Promise<RenamePlan> {
  const oldTitle = normalizeWikiTitle(input.oldTitle);
  const newTitle = normalizeWikiTitle(input.newTitle);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notes")
    .select("id, title, content, updated_at")
    .is("deleted_at", null)
    .order("id");
  if (error) {
    throw new Error(`準備改名失敗：${error.message}`);
  }

  const rows = (data ?? []) as KnowledgeNoteRow[];
  const sameTitle = rows.filter(
    (note) => note.title && normalizeWikiTitle(note.title) === oldTitle,
  );
  const uniqueTarget = sameTitle.length === 1 && sameTitle[0].id === input.noteId;
  if (!uniqueTarget) {
    return {
      content: input.targetContent,
      sources: [],
      ambiguousOldTitle: true,
      ambiguousNewTitle: false,
    };
  }

  const ambiguousNewTitle = Boolean(
    newTitle &&
      rows.some(
        (note) =>
          note.id !== input.noteId &&
          note.title &&
          normalizeWikiTitle(note.title) === newTitle,
      ),
  );

  const targetContent = newTitle
    ? replaceWikiLinkTitle(input.targetContent, oldTitle, newTitle)
    : input.targetContent;
  const sources: RenameSourceUpdate[] = [];
  for (const note of rows) {
    if (note.id === input.noteId) {
      continue;
    }
    const hasExactLink = parseWikiLinks(note.content).some((link) => link.title === oldTitle);
    const content = newTitle
      ? replaceWikiLinkTitle(note.content, oldTitle, newTitle)
      : note.content;
    if (hasExactLink) {
      sources.push({
        noteId: note.id,
        expectedUpdatedAt: note.updated_at,
        content,
      });
    }
  }

  return {
    content: targetContent,
    sources,
    ambiguousOldTitle: false,
    ambiguousNewTitle,
  };
}

export async function applyWikiLinkRename(input: {
  noteId: string;
  expectedUpdatedAt: string;
  plan: RenamePlan;
}): Promise<{ updatedAt: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rename_note_with_links", {
    p_note_id: input.noteId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_content: input.plan.content,
    p_source_updates: input.plan.sources.map((source) => ({
      note_id: source.noteId,
      expected_updated_at: source.expectedUpdatedAt,
      content: source.content,
    })),
  });

  if (error) {
    if (error.code === "40001") {
      throw new RenameConflictError();
    }
    if (error.code === "23505") {
      throw new Error("改名期間出現同名筆記，所有變更已回滾；請換一個唯一標題後重試。");
    }
    throw new Error(`更新 Wiki Link 失敗：${error.message}`);
  }
  return { updatedAt: data };
}

export class RenameConflictError extends Error {
  constructor() {
    super("rename conflict");
    this.name = "RenameConflictError";
  }
}

export async function searchWikiNoteCandidates(
  query: string,
  limit = 20,
): Promise<WikiNoteCandidate[]> {
  const normalized = normalizeWikiTitle(query).slice(0, 200);
  const supabase = await createClient();
  const escaped = normalized.replace(/[\\%_]/g, (character) => `\\${character}`);
  let request = supabase
    .from("notes")
    .select("id, title, updated_at")
    .is("deleted_at", null)
    .not("title", "is", null)
    .order("updated_at", { ascending: false })
    .order("id")
    .limit(Math.min(Math.max(limit * 3, 20), 80));
  if (normalized) {
    request = request.ilike("title", `%${escaped}%`);
  }

  const { data, error } = await request;
  if (error) {
    throw new Error(`搜尋筆記失敗：${error.message}`);
  }

  const candidateTitles = [
    ...new Set((data ?? []).flatMap((note) => (note.title ? [normalizeWikiTitle(note.title)] : []))),
  ];
  const { data: identities, error: identityError } = candidateTitles.length
    ? await supabase.rpc("resolve_note_titles", { p_titles: candidateTitles })
    : { data: [], error: null };
  if (identityError) {
    throw new Error(`確認同名筆記失敗：${identityError.message}`);
  }
  const counts = new Map<string, number>();
  for (const note of identities ?? []) {
    counts.set(note.title, (counts.get(note.title) ?? 0) + 1);
  }

  return (data ?? [])
    .filter((note): note is typeof note & { title: string } => Boolean(note.title))
    .map((note) => ({
      id: note.id,
      title: note.title,
      updatedAt: note.updated_at,
      updatedLabel: formatUpdatedAt(note.updated_at),
      ambiguous: (counts.get(normalizeWikiTitle(note.title)) ?? 0) > 1,
    }));
}

function formatUpdatedAt(iso: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
