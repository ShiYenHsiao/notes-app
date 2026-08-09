import {
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";

/**
 * 斜線命令。
 *
 * 借用 CodeMirror 內建的自動完成機制而不是自己刻彈出選單 —— 鍵盤上下選、
 * 即時過濾、視窗邊界的定位全部是現成的。
 *
 * displayLabel 維持短的中文名稱，真正參與搜尋的 label 則帶上中英文同義詞；
 * 因此不論習慣 `/h2`、`/heading` 或 `/標題` 都找得到同一個命令。
 */

type Item = {
  /** 用來輸入與過濾的關鍵字。 */
  key: string;
  /** displayLabel 以外也能拿來搜尋的中英文同義詞。 */
  aliases: string[];
  /** 選單上顯示的中文。 */
  label: string;
  /** 右側的補充說明，通常放對應的 Markdown 語法。 */
  detail?: string;
  /** 要插入的內容。`${}` 是插入後游標停留的位置。 */
  snippet: string;
};

export const SLASH_COMMANDS: readonly Item[] = [
  { key: "h1", aliases: ["heading", "標題"], label: "標題 1", detail: "#", snippet: "# ${}" },
  { key: "h2", aliases: ["heading", "標題"], label: "標題 2", detail: "##", snippet: "## ${}" },
  { key: "h3", aliases: ["heading", "標題"], label: "標題 3", detail: "###", snippet: "### ${}" },

  {
    key: "list",
    aliases: ["bullet", "unordered", "項目清單", "無序清單"],
    label: "無序清單",
    detail: "-",
    snippet: "- ${}",
  },
  {
    key: "ol",
    aliases: ["ordered", "編號清單", "有序清單"],
    label: "有序清單",
    detail: "1.",
    snippet: "1. ${}",
  },
  { key: "todo", aliases: ["task", "待辦"], label: "待辦清單", detail: "- [ ]", snippet: "- [ ] ${}" },
  { key: "quote", aliases: ["blockquote", "引用"], label: "引用", detail: ">", snippet: "> ${}" },

  { key: "hl", aliases: ["highlight", "螢光筆"], label: "螢光筆　黃", detail: "==", snippet: "==${}==" },
  { key: "hlg", aliases: ["highlight", "螢光筆", "綠"], label: "螢光筆　綠", detail: "=={g}", snippet: "==${}=={g}" },
  { key: "hlp", aliases: ["highlight", "螢光筆", "粉"], label: "螢光筆　粉", detail: "=={p}", snippet: "==${}=={p}" },
  { key: "hlb", aliases: ["highlight", "螢光筆", "藍"], label: "螢光筆　藍", detail: "=={b}", snippet: "==${}=={b}" },

  {
    key: "key",
    aliases: ["callout", "重點"],
    label: "重點 Callout",
    detail: "考點與結論",
    snippet: "> [!KEY]\n> ${}",
  },
  {
    key: "practice",
    aliases: ["callout", "實務", "實務見解"],
    label: "實務見解 Callout",
    detail: "判決、函釋、通說",
    snippet: "> [!PRACTICE]\n> ${}",
  },
  {
    key: "pitfall",
    aliases: ["callout", "易錯", "易錯提醒"],
    label: "易錯提醒 Callout",
    detail: "會扣分的地方",
    snippet: "> [!PITFALL]\n> ${}",
  },
  {
    key: "insight",
    aliases: ["callout", "理解", "自我理解"],
    label: "自我理解 Callout",
    detail: "自己的話，不是權威來源",
    snippet: "> [!INSIGHT]\n> ${}",
  },

  { key: "code", aliases: ["fence", "程式碼"], label: "程式碼區塊", detail: "```", snippet: "```${}\n\n```" },
  {
    key: "table",
    aliases: ["表格"],
    label: "表格",
    detail: "| |",
    snippet: "| ${欄位} | ${欄位} |\n| --- | --- |\n| ${} |  |",
  },
  { key: "hr", aliases: ["divider", "分隔線"], label: "分隔線", detail: "---", snippet: "---\n${}" },
  { key: "link", aliases: ["url", "連結"], label: "連結", detail: "[]()", snippet: "[${文字}](${網址})" },
  {
    key: "image",
    aliases: ["img", "圖片"],
    label: "圖片",
    detail: "![]()",
    snippet: "![${說明}](${網址})",
  },
];

/*
 * label 必須連斜線一起帶。
 *
 * 結果的 from 指在斜線的位置，CodeMirror 會拿「從 from 到游標」的文字（也就是
 * `/h` 這種帶斜線的字串）去比對每個選項的 label。label 只寫 `h1` 的話一個都對不上，
 * 選單會整個空掉 —— 這個踩過。
 */
const OPTIONS: Completion[] = SLASH_COMMANDS.map((item) =>
  snippetCompletion(item.snippet, {
    // displayLabel 只負責畫面；真正的 label 帶同義詞，CodeMirror 內建 fuzzy filter
    // 才能同時接受 `/h2`、`/heading` 與 `/標題`，不需要另裝搜尋套件。
    label: `/${item.key} ${item.aliases.join(" ")}`,
    displayLabel: item.label,
    detail: item.detail,
    type: "text",
  }),
);

/** `/` 後面只收 Unicode 字母與數字；空白與標點一律結束 command query。 */
const TRIGGER = /\/[\p{L}\p{N}]*/u;
const VALID_QUERY = /^\/[\p{L}\p{N}]*$/u;
const CODE_NODES = new Set(["InlineCode", "FencedCode", "CodeBlock", "CodeText"]);

function isInsideCode(context: CompletionContext): boolean {
  let node: SyntaxNode | null = syntaxTree(context.state).resolveInner(context.pos, -1);
  while (node) {
    if (CODE_NODES.has(node.name)) {
      return true;
    }
    node = node.parent;
  }
  return false;
}

export function slashCommands(context: CompletionContext): CompletionResult | null {
  const selection = context.state.selection.main;
  if (!selection.empty || selection.head !== context.pos || isInsideCode(context)) {
    return null;
  }

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
    // 繼續打中英文字母與數字就沿用這份結果，不必每次重算
    validFor: VALID_QUERY,
  };
}
