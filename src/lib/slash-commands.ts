import {
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";

/**
 * 斜線命令。
 *
 * 借用 CodeMirror 內建的自動完成機制而不是自己刻彈出選單 —— 鍵盤上下選、
 * 即時過濾、視窗邊界的定位全部是現成的。
 *
 * label 用英數當作輸入的關鍵字、displayLabel 顯示中文：中文要切輸入法，
 * 打 `/` 之後還要切一次太痛苦，所以用英數當快捷鍵、中文只負責看。
 */

type Item = {
  /** 用來輸入與過濾的關鍵字。 */
  key: string;
  /** 選單上顯示的中文。 */
  label: string;
  /** 右側的補充說明，通常放對應的 Markdown 語法。 */
  detail?: string;
  /** 要插入的內容。`${}` 是插入後游標停留的位置。 */
  snippet: string;
};

const ITEMS: Item[] = [
  { key: "h1", label: "標題 1", detail: "#", snippet: "# ${}" },
  { key: "h2", label: "標題 2", detail: "##", snippet: "## ${}" },
  { key: "h3", label: "標題 3", detail: "###", snippet: "### ${}" },

  { key: "list", label: "項目清單", detail: "-", snippet: "- ${}" },
  { key: "ol", label: "編號清單", detail: "1.", snippet: "1. ${}" },
  { key: "todo", label: "待辦清單", detail: "- [ ]", snippet: "- [ ] ${}" },
  { key: "quote", label: "引用", detail: ">", snippet: "> ${}" },

  { key: "hl", label: "螢光筆　黃", detail: "==", snippet: "==${}==" },
  { key: "hlg", label: "螢光筆　綠", detail: "=={g}", snippet: "==${}=={g}" },
  { key: "hlp", label: "螢光筆　粉", detail: "=={p}", snippet: "==${}=={p}" },
  { key: "hlb", label: "螢光筆　藍", detail: "=={b}", snippet: "==${}=={b}" },

  { key: "note", label: "重點區塊　提示", detail: "[!NOTE]", snippet: "> [!NOTE]\n> ${}" },
  { key: "tip", label: "重點區塊　訣竅", detail: "[!TIP]", snippet: "> [!TIP]\n> ${}" },
  {
    key: "important",
    label: "重點區塊　重要",
    detail: "[!IMPORTANT]",
    snippet: "> [!IMPORTANT]\n> ${}",
  },
  {
    key: "warning",
    label: "重點區塊　注意",
    detail: "[!WARNING]",
    snippet: "> [!WARNING]\n> ${}",
  },
  {
    key: "caution",
    label: "重點區塊　警告",
    detail: "[!CAUTION]",
    snippet: "> [!CAUTION]\n> ${}",
  },

  { key: "code", label: "程式碼區塊", detail: "```", snippet: "```${}\n\n```" },
  {
    key: "table",
    label: "表格",
    detail: "| |",
    snippet: "| ${欄位} | ${欄位} |\n| --- | --- |\n| ${} |  |",
  },
  { key: "hr", label: "分隔線", detail: "---", snippet: "---\n${}" },
  { key: "link", label: "連結", detail: "[]()", snippet: "[${文字}](${網址})" },
];

/*
 * label 必須連斜線一起帶。
 *
 * 結果的 from 指在斜線的位置，CodeMirror 會拿「從 from 到游標」的文字（也就是
 * `/h` 這種帶斜線的字串）去比對每個選項的 label。label 只寫 `h1` 的話一個都對不上，
 * 選單會整個空掉 —— 這個踩過。
 */
const OPTIONS: Completion[] = ITEMS.map((item) =>
  snippetCompletion(item.snippet, {
    label: `/${item.key}`,
    displayLabel: item.label,
    detail: item.detail,
    type: "text",
  }),
);

/** `/` 後面允許的字元。只收英數，中文交給 displayLabel 顯示。 */
const TRIGGER = /\/[a-z0-9]*/i;

export function slashCommands(context: CompletionContext): CompletionResult | null {
  const before = context.matchBefore(TRIGGER);
  if (!before) {
    return null;
  }

  /*
   * 只在行首或空白之後觸發。
   * 少了這個判斷，打網址時的 `https://` 也會彈出選單，非常煩。
   */
  const charBefore =
    before.from > 0 ? context.state.sliceDoc(before.from - 1, before.from) : "\n";
  if (before.from > 0 && !/\s/.test(charBefore)) {
    return null;
  }

  return {
    from: before.from,
    options: OPTIONS,
    // 繼續打英數就沿用這份結果，不必每次重算
    validFor: /^\/[a-z0-9]*$/i,
  };
}
