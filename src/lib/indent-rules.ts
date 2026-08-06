/**
 * Tab 縮排的判斷規則。
 *
 * 抽出來成純函式，測試才不用把整個 CodeMirror 拉起來。
 */

/** 一層縮排。兩格 —— 四格在中文行裡一層就吃掉半行。 */
export const INDENT_UNIT = "  ";

/** 行首累積到這麼多空白，CommonMark 就會把整行當成 indented code block。 */
export const CODE_BLOCK_INDENT = 4;

/** 是不是清單項目（含待辦與有序清單）。 */
const LIST_LINE = /^[ \t]*(?:[-*+]|\d+[.)])\s/;

export type IndentDecision =
  /** 照 CodeMirror 標準縮排。 */
  | "indent"
  /** 擋下來並提示：再縮就會變成程式碼區塊。 */
  | "blocked";

/**
 * 這一次 Tab 該做什麼。
 *
 * 清單、空行、跨行選取一律正常縮排 —— 那些情境縮排就是使用者要的，
 * 而且清單的縮排不會觸發 indented code block。
 *
 * 一般段落不一樣：行首滿四個空白之後，CommonMark 會把整行解析成
 * indented code block，內容變 literal text，==螢光標記== 也跟著失效。
 * 這是標準行為，不該用 CSS 或改 renderer 掩蓋，所以擋下來讓使用者知道。
 */
export function classifyIndent(input: {
  /** 游標所在行的完整文字。 */
  lineText: string;
  /** 選取範圍是否跨越多行。 */
  multiLine: boolean;
}): IndentDecision {
  if (input.multiLine) {
    return "indent";
  }

  if (LIST_LINE.test(input.lineText) || input.lineText.trim() === "") {
    return "indent";
  }

  // tab 字元照 CommonMark 當四格算
  const leading = /^[ \t]*/.exec(input.lineText)?.[0] ?? "";
  const width = leading.replace(/\t/g, " ".repeat(CODE_BLOCK_INDENT)).length;

  return width + INDENT_UNIT.length >= CODE_BLOCK_INDENT ? "blocked" : "indent";
}
