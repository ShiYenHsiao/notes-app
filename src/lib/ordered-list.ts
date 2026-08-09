import type { StateCommand } from "@codemirror/state";

/**
 * 中文輸入時常見、但 CommonMark 不認得的阿拉伯數字清單標記。
 *
 * 標準的 `1. 內容` 仍交給 @codemirror/lang-markdown；這裡只補 IME 容易產生的
 * 全形字元，以及中文使用者常省略句點後空白的情況。範圍刻意限在行首、最多三格縮排、
 * 1–99，而且內容必須以中文或中文開頭標點開始，避免把版本號與小數誤認成清單。
 */

const LOOSE_ORDERED_ITEM = /^( {0,3})([0-9０-９]{1,2})([.．])([ \t　]?)(.*)$/u;
const CHINESE_CONTENT_START = /^[\p{Script=Han}「『（【〈《〔［｛]/u;

export type LooseOrderedListItem = {
  indent: string;
  number: number;
  content: string;
  empty: boolean;
};

function asciiDigits(value: string): string {
  return [...value]
    .map((char) => {
      const code = char.charCodeAt(0);
      return code >= 0xff10 && code <= 0xff19 ? String(code - 0xff10) : char;
    })
    .join("");
}

/**
 * 解析官方 Markdown keymap 不會接手的中文有序清單。
 *
 * 標準 CommonMark 形式回傳 null，確保它繼續走官方 syntax-tree 行為。
 */
export function parseLooseOrderedListItem(line: string): LooseOrderedListItem | null {
  const match = LOOSE_ORDERED_ITEM.exec(line);
  if (!match) {
    return null;
  }

  const [, indent, digits, punctuation, separator, content] = match;
  const number = Number(asciiDigits(digits));
  if (!Number.isInteger(number) || number < 1 || number > 99) {
    return null;
  }

  // 這是標準 CommonMark，保留給官方 keymap；它還會處理 list renumbering 等完整語意。
  const standard = /^[0-9]+$/.test(digits) && punctuation === "." && /^[ \t]$/.test(separator);
  if (standard) {
    return null;
  }

  const trimmed = content.trim();
  if (trimmed && !CHINESE_CONTENT_START.test(trimmed)) {
    return null;
  }

  return {
    indent,
    number,
    content,
    empty: trimmed === "",
  };
}

/**
 * CodeMirror Enter fallback。
 *
 * 這支排在官方 markdownKeymap 前面，但標準語法一定回傳 false，因此不會取代官方行為。
 */
export const continueLooseOrderedList: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main;
  if (!range.empty) {
    return false;
  }

  const line = state.doc.lineAt(range.head);
  if (range.head !== line.to) {
    return false;
  }

  const item = parseLooseOrderedListItem(line.text);
  if (!item) {
    return false;
  }

  if (item.empty) {
    dispatch(
      state.update({
        changes: { from: line.from, to: line.to, insert: item.indent },
        selection: { anchor: line.from + item.indent.length },
        userEvent: "input",
      }),
    );
    return true;
  }

  /*
   * 不能只延續全形標記：`１．第一點` 即使下一行出現 `２．`，整段仍不是 Markdown list，
   * Preview 也不會渲染成清單。Enter 時在同一個 transaction 正規化目前這行，再插入
   * 下一個標準 marker；Undo 仍會一次回到使用者原始輸入。
   */
  const insert = `${item.indent}${item.number}. ${item.content}${state.lineBreak}${item.indent}${item.number + 1}. `;
  dispatch(
    state.update({
      changes: { from: line.from, to: line.to, insert },
      selection: { anchor: line.from + insert.length },
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
};
