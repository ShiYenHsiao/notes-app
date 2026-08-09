export type PrintStyle = "study" | "clean";

/** URL 或未來儲存的值不可信；未知樣式一律退回主要的 Study。 */
export function normalizePrintStyle(value: string | null | undefined): PrintStyle {
  return value === "clean" ? "clean" : "study";
}

/** Print View 與瀏覽器另存 PDF 共用的文件標題。 */
export function printDocumentTitle(title: string | null): string {
  return `${printDisplayTitle(title)} — NEXUM NOTE`;
}

export function printDisplayTitle(title: string | null): string {
  return title?.trim() || "未命名筆記";
}

/** 固定台北日期，避免 Vercel（UTC）與使用者瀏覽器顯示不同的匯出日。 */
export function formatPrintDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";

  return `${part("year")} 年 ${part("month")} 月 ${part("day")} 日`;
}

/** metadata 不沿用 UI chip；只留下乾淨、去重的標籤文字。 */
export function printTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

/**
 * 筆記資料模型把第一行當標題；當第一行本身也是 Markdown heading，Print Header 已經顯示過，
 * 內文再印一次只會重複。純文字首行與中文條列不能移除，否則會真的吃掉內容。
 */
export function printBodyContent(content: string): string {
  const newline = content.indexOf("\n");
  const firstLine = newline === -1 ? content : content.slice(0, newline);

  if (!/^#{1,6}[ \t]+\S/.test(firstLine)) {
    return content;
  }

  return newline === -1 ? "" : content.slice(newline + 1).replace(/^\n/, "");
}

/** UUID 本來就安全；encodeURIComponent 也讓這支 helper 對未來的 id 格式保持正確。 */
export function printPath(noteId: string): string {
  return `/n/${encodeURIComponent(noteId)}/print`;
}
