/**
 * 中文條列的辨識與遞增。
 *
 * 法律筆記的層級慣例是「一、二、三、」配「（一）（二）（三）」，Markdown 沒有
 * 對應語法，所以這一層完全由編輯器處理 —— 它產生的是純文字，匯出到任何編輯器
 * 都跟原本一樣，不影響 Markdown 可攜性。
 *
 * 抽成純函式，測試不必拉起 CodeMirror。
 */

const DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;

/** 支援到 99。法律筆記的條列很少超過這個範圍，超過就不接手。 */
const MAX_VALUE = 99;

/** 中文數字轉阿拉伯數字。看不懂就回傳 null。 */
export function fromChineseNumeral(text: string): number | null {
  if (!text) return null;

  const index = (char: string) => DIGITS.indexOf(char as (typeof DIGITS)[number]);

  // 十、十一 … 十九
  if (text[0] === "十") {
    if (text.length === 1) return 10;
    const ones = index(text[1]);
    return text.length === 2 && ones > 0 ? 10 + ones : null;
  }

  const tensPosition = text.indexOf("十");

  // 個位數
  if (tensPosition === -1) {
    if (text.length !== 1) return null;
    const value = index(text[0]);
    return value > 0 ? value : null;
  }

  // 二十、二十一 …
  const tens = index(text[0]);
  if (tens < 2 || tensPosition !== 1) return null;

  if (text.length === 2) return tens * 10;
  if (text.length !== 3) return null;

  const ones = index(text[2]);
  return ones > 0 ? tens * 10 + ones : null;
}

/** 阿拉伯數字轉中文數字。超出支援範圍回傳 null。 */
export function toChineseNumeral(value: number): string | null {
  if (!Number.isInteger(value) || value < 1 || value > MAX_VALUE) return null;

  if (value < 10) return DIGITS[value];
  if (value === 10) return "十";
  if (value < 20) return `十${DIGITS[value - 10]}`;

  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return ones === 0 ? `${DIGITS[tens]}十` : `${DIGITS[tens]}十${DIGITS[ones]}`;
}

/** 兩種標記形式：`一、` 與 `（一）`。 */
export type ChineseListKind = "dun" | "paren";

export type ChineseListMarker = {
  /** 行首的空白，延續下一項時要保留。 */
  indent: string;
  kind: ChineseListKind;
  /** 目前是第幾項。 */
  value: number;
  /** 標記與內容之間的空白，延續時一併沿用。 */
  spacing: string;
  /** 標記後面的文字。空的代表這是個空項目。 */
  content: string;
};

/*
 * 空白要連全形空格（U+3000）一起收。中文法律筆記很常用它做層次縮排，
 * 只認半形的話「　　（一）」這種寫法會辨識不出來。
 */
const DUN = /^([ \t　]*)([一二三四五六七八九十]+)、([ \t　]*)(.*)$/;
const PAREN = /^([ \t　]*)（([一二三四五六七八九十]+)）([ \t　]*)(.*)$/;

/** 辨識一行是不是中文條列。不是就回傳 null。 */
export function parseChineseListMarker(lineText: string): ChineseListMarker | null {
  for (const [kind, pattern] of [
    ["dun", DUN],
    ["paren", PAREN],
  ] as const) {
    const match = pattern.exec(lineText);
    if (!match) continue;

    const value = fromChineseNumeral(match[2]);
    if (value === null) continue;

    return { indent: match[1], kind, value, spacing: match[3], content: match[4] };
  }

  return null;
}

/** 組出下一項的標記（含行首空白與後方空白），無法遞增時回傳 null。 */
export function nextChineseListMarker(marker: ChineseListMarker): string | null {
  const numeral = toChineseNumeral(marker.value + 1);
  if (numeral === null) return null;

  const body = marker.kind === "dun" ? `${numeral}、` : `（${numeral}）`;
  return `${marker.indent}${body}${marker.spacing}`;
}
