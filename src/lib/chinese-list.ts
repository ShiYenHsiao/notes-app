/**
 * 中文條列的辨識與遞增。
 *
 * 法律筆記沿用公文的層級慣例：「一、」「（一）」「（1）」「甲、」「A、」。Markdown
 * 只有 `1.` 一種有序清單，其餘層級沒有對應語法，所以這一層完全由編輯器處理 ——
 * 它產生的是純文字，匯出到任何編輯器都跟原本一樣，不影響 Markdown 可攜性。
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

// ---------------------------------------------------------------- 其他序列

/** 天干。十個就沒了，第十一項無法遞增。 */
const STEMS = "甲乙丙丁戊己庚辛壬癸";

const FULL_WIDTH_DIGITS = "０１２３４５６７８９";

function fromStem(text: string): number | null {
  const index = STEMS.indexOf(text);
  return index === -1 ? null : index + 1;
}

function toStem(value: number): string | null {
  return value >= 1 && value <= STEMS.length ? STEMS[value - 1] : null;
}

function fromLatinLetter(text: string): number | null {
  const value = text.toUpperCase().charCodeAt(0) - 64; // "A" 是 65
  return value >= 1 && value <= 26 ? value : null;
}

/** 大小寫沿用上一項：`a、` 接 `b、`，`A、` 接 `B、`。 */
function toLatinLetter(value: number, previous: string): string | null {
  if (value < 1 || value > 26) return null;
  const letter = String.fromCharCode(64 + value);
  return /[a-z]/.test(previous) ? letter.toLowerCase() : letter;
}

function fromArabicNumeral(text: string): number | null {
  const halfWidth = text.replace(/[０-９]/g, (char) => String(FULL_WIDTH_DIGITS.indexOf(char)));
  const value = Number(halfWidth);
  return Number.isInteger(value) && value >= 1 && value <= MAX_VALUE ? value : null;
}

/** 全形數字也沿用：`（１）` 接 `（２）`，中文輸入法常打出這種。 */
function toArabicNumeral(value: number, previous: string): string | null {
  if (value < 1 || value > MAX_VALUE) return null;
  const halfWidth = String(value);
  return /[０-９]/.test(previous)
    ? halfWidth.replace(/[0-9]/g, (char) => FULL_WIDTH_DIGITS[Number(char)])
    : halfWidth;
}

// ---------------------------------------------------------------- 標記

/** 兩種標記形式：`一、` 與 `（一）`。 */
export type ChineseListKind = "dun" | "paren";

/** 標記裡用的序列。 */
export type ChineseListAlphabet = "cjk" | "stem" | "latin" | "arabic";

type Alphabet = {
  /** 數字部分的字元類別，組標記的 regex 時塞進去。 */
  chars: string;
  parse: (text: string) => number | null;
  /** `previous` 是上一項的數字原文，用來沿用全形／半形與大小寫。 */
  render: (value: number, previous: string) => string | null;
  /** 這套序列能配哪些標記形式。 */
  kinds: readonly ChineseListKind[];
};

/*
 * 阿拉伯數字只認全形括號的 `（1）`。
 *
 * `1、` 沒有納入是因為中文本來就會這樣寫年月與並列（「3、4 月間」），接手的話
 * 誤判太多；而 `1.` 那一層是 Markdown 自己的有序清單，本來就會延續。
 */
const ALPHABETS: Record<ChineseListAlphabet, Alphabet> = {
  cjk: {
    chars: "[一二三四五六七八九十]+",
    parse: fromChineseNumeral,
    render: (value) => toChineseNumeral(value),
    kinds: ["dun", "paren"],
  },
  stem: {
    chars: `[${STEMS}]`,
    parse: fromStem,
    render: (value) => toStem(value),
    kinds: ["dun", "paren"],
  },
  latin: {
    chars: "[A-Za-z]",
    parse: fromLatinLetter,
    render: toLatinLetter,
    kinds: ["dun", "paren"],
  },
  arabic: {
    chars: "[0-9０-９]{1,2}",
    parse: fromArabicNumeral,
    render: toArabicNumeral,
    kinds: ["paren"],
  },
};

/*
 * 空白要連全形空格（U+3000）一起收。中文法律筆記很常用它做層次縮排，
 * 只認半形的話「　　（一）」這種寫法會辨識不出來。
 */
const SPACE = "[ \\t　]*";

function markerPattern(kind: ChineseListKind, chars: string): RegExp {
  const body = kind === "dun" ? `(${chars})、` : `（(${chars})）`;
  return new RegExp(`^(${SPACE})${body}(${SPACE})(.*)$`);
}

/** 所有「序列 × 形式」的組合。各序列的字元集互斥，所以比對順序無所謂。 */
const MARKERS = (Object.entries(ALPHABETS) as [ChineseListAlphabet, Alphabet][]).flatMap(
  ([alphabet, spec]) =>
    spec.kinds.map((kind) => ({ alphabet, kind, pattern: markerPattern(kind, spec.chars) })),
);

export type ChineseListMarker = {
  /** 行首的空白，延續下一項時要保留。 */
  indent: string;
  kind: ChineseListKind;
  alphabet: ChineseListAlphabet;
  /** 標記裡的數字原文。遞增時用來沿用全形／半形與大小寫。 */
  numeral: string;
  /** 目前是第幾項。 */
  value: number;
  /** 標記與內容之間的空白，延續時一併沿用。 */
  spacing: string;
  /** 標記後面的文字。空的代表這是個空項目。 */
  content: string;
};

/** 辨識一行是不是中文條列。不是就回傳 null。 */
export function parseChineseListMarker(lineText: string): ChineseListMarker | null {
  for (const { alphabet, kind, pattern } of MARKERS) {
    const match = pattern.exec(lineText);
    if (!match) continue;

    const value = ALPHABETS[alphabet].parse(match[2]);
    if (value === null) continue;

    return {
      indent: match[1],
      kind,
      alphabet,
      numeral: match[2],
      value,
      spacing: match[3],
      content: match[4],
    };
  }

  return null;
}

/** 組出下一項的標記（含行首空白與後方空白），無法遞增時回傳 null。 */
export function nextChineseListMarker(marker: ChineseListMarker): string | null {
  const numeral = ALPHABETS[marker.alphabet].render(marker.value + 1, marker.numeral);
  if (numeral === null) return null;

  const body = marker.kind === "dun" ? `${numeral}、` : `（${numeral}）`;
  return `${marker.indent}${body}${marker.spacing}`;
}

// ---------------------------------------------------------------- 硬換行

/** Markdown 的硬換行：行尾兩個空白。 */
const HARD_BREAK = "  ";

/**
 * 要在這一行尾巴補幾個空白，預覽才會換行。
 *
 * 中文條列產生的是純文字，連續兩行在 Markdown 眼裡就是同一段，預覽會接成一行 ——
 * `一、意義` 跟 `二、要件` 擠在一起。行尾兩個空白是標準的硬換行寫法，`<br>` 之外
 * 唯一不引進自訂語法的做法。已經有空白就不重複補。
 */
export function hardBreakSuffix(lineText: string): string {
  const existing = /[ ]*$/.exec(lineText)?.[0].length ?? 0;
  return " ".repeat(Math.max(0, HARD_BREAK.length - existing));
}
