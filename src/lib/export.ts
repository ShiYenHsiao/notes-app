import "server-only";

import JSZip from "jszip";

import { supabaseUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "attachments";

/**
 * 匯出全部筆記成一包 zip。
 *
 * 目標是「Supabase 消失了也還救得回來」，所以內文裡的圖片網址會改寫成 zip 內的
 * 相對路徑，附件也一併打包進去。匯出檔在 Obsidian、Typora 這些編輯器裡直接打得開。
 */
export async function buildExportZip(): Promise<{ blob: Blob; filename: string }> {
  const supabase = await createClient();

  const [notesResult, tagsResult, linksResult] = await Promise.all([
    supabase
      .from("notes")
      .select("id, title, content, created_at, updated_at, deleted_at")
      .order("created_at"),
    supabase.from("tags").select("id, name"),
    supabase.from("note_tags").select("note_id, tag_id"),
  ]);

  if (notesResult.error) {
    throw new Error(`讀取筆記失敗：${notesResult.error.message}`);
  }

  const notes = notesResult.data ?? [];
  const tagNames = new Map((tagsResult.data ?? []).map((tag) => [tag.id, tag.name]));

  const tagsByNote = new Map<string, string[]>();
  for (const link of linksResult.data ?? []) {
    const name = tagNames.get(link.tag_id);
    if (!name) {
      continue;
    }
    const list = tagsByNote.get(link.note_id) ?? [];
    list.push(name);
    tagsByNote.set(link.note_id, list);
  }

  const zip = new JSZip();
  const usedFilenames = new Set<string>();
  const attachmentPaths = new Set<string>();

  for (const note of notes) {
    const { content, paths } = rewriteAttachmentUrls(note.content);
    for (const path of paths) {
      attachmentPaths.add(path);
    }

    const filename = uniqueFilename(note.title, note.id, usedFilenames);
    const frontmatter = buildFrontmatter({
      title: note.title,
      tags: tagsByNote.get(note.id) ?? [],
      created: note.created_at,
      updated: note.updated_at,
      trashed: Boolean(note.deleted_at),
    });

    // 垃圾桶裡的筆記也匯出，但放在另一個資料夾，還原與否由使用者自己決定。
    const folder = note.deleted_at ? "trash" : "notes";
    zip.file(`${folder}/${filename}`, `${frontmatter}\n${content}`);
  }

  // 附件逐一下載塞進去。個人筆記的量不大，就不做並行控制了。
  for (const path of attachmentPaths) {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !data) {
      console.error("匯出時下載附件失敗", { path, error });
      continue;
    }
    zip.file(`attachments/${basename(path)}`, await data.arrayBuffer());
  }

  zip.file("README.txt", buildReadme(notes.length, attachmentPaths.size));

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const stamp = new Date().toISOString().slice(0, 10);
  return { blob, filename: `notes-export-${stamp}.zip` };
}

/**
 * 把內文裡指向 Supabase Storage 的圖片網址換成 zip 內的相對路徑。
 *
 * 沒有這一步的話，匯出檔還是得靠 Supabase 活著才看得到圖，等於沒有真的備份。
 */
function rewriteAttachmentUrls(content: string): { content: string; paths: string[] } {
  const prefix = `${supabaseUrl().replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/`;
  const paths: string[] = [];

  let index = content.indexOf(prefix);
  let result = content;

  while (index !== -1) {
    // 網址結束在空白、括號或引號
    const rest = result.slice(index + prefix.length);
    const match = rest.match(/^[^\s)"'<>]+/);
    if (!match) {
      break;
    }

    const path = decodeURIComponent(match[0]);
    paths.push(path);

    const replacement = `../attachments/${basename(path)}`;
    result = result.slice(0, index) + replacement + rest.slice(match[0].length);
    index = result.indexOf(prefix, index + replacement.length);
  }

  return { content: result, paths };
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

function buildFrontmatter(input: {
  title: string | null;
  tags: string[];
  created: string;
  updated: string;
  trashed: boolean;
}): string {
  const lines = ["---"];
  lines.push(`title: ${yamlString(input.title ?? "無標題")}`);

  if (input.tags.length > 0) {
    lines.push(`tags: [${input.tags.map(yamlString).join(", ")}]`);
  }

  lines.push(`created: ${input.created}`);
  lines.push(`updated: ${input.updated}`);

  if (input.trashed) {
    lines.push("trashed: true");
  }

  lines.push("---");
  return lines.join("\n");
}

/** YAML 字串一律加引號，標題裡的冒號、井字號才不會把格式弄壞。 */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * 檔名用標題，但要能安全落地到各種檔案系統。
 * 中文保留 —— macOS 與 Linux 都處理得好，強行轉拼音反而看不懂。
 */
function uniqueFilename(title: string | null, id: string, used: Set<string>): string {
  const base =
    (title ?? "")
      .replace(/[/\\?%*:|"<>.]/g, "") // 檔案系統的保留字元
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || "無標題";

  let candidate = `${base}.md`;
  if (used.has(candidate)) {
    // 同名時補上 id 前 8 碼，比流水號好認
    candidate = `${base}-${id.slice(0, 8)}.md`;
  }

  used.add(candidate);
  return candidate;
}

function buildReadme(noteCount: number, attachmentCount: number): string {
  return [
    "這是筆記工具的匯出檔。",
    "",
    `筆記 ${noteCount} 篇、附件 ${attachmentCount} 個。`,
    "",
    "notes/       目前的筆記",
    "trash/       在垃圾桶裡、還沒被清除的筆記",
    "attachments/ 內文引用到的圖片與檔案",
    "",
    "每個 .md 檔開頭的 --- 區塊是 YAML frontmatter，記錄標題、標籤與時間。",
    "Obsidian、Typora 等編輯器讀得懂，不需要的話刪掉不影響內文。",
    "",
    "內文的圖片路徑是相對路徑（../attachments/），只要保持這個資料夾結構，",
    "不需要網路也不需要原本的服務就看得到圖。",
  ].join("\n");
}
