/**
 * 縮排的規則：Tab 該怎麼縮，以及參考線該畫在哪。
 *
 * 抽出來成純函式，測試才不用把整個 CodeMirror 拉起來。
 */

/** 清單的一層縮排。兩格 —— 四格在中文行裡一層就吃掉半行。 */
export const INDENT_UNIT = "  ";

/**
 * 純文字行的一層縮排：一個全形空格 U+3000。
 *
 * 半形空白在 Markdown 裡是排版指令而不是內容，行首的半形空白會被吃掉 ——
 * 編輯區看得到層次，預覽卻是平的。全形空格對 Markdown 與 CSS 都是普通字元，
 * 所以兩邊會長得一樣，匯出到別的編輯器也一樣。
 *
 * 附帶的好處是它**不可能觸發 indented code block**（那條規則只認半形空白與 tab），
 * 所以中文段落的 Tab 不再需要「縮到四格就擋下來」那套防線。
 */
export const TEXT_INDENT_UNIT = "　";

/** 行首累積到這麼多半形空白，CommonMark 就會把整行當成 indented code block。 */
export const CODE_BLOCK_INDENT = 4;

/** 是不是清單項目（含待辦與有序清單）。 */
const LIST_LINE = /^[ \t]*(?:[-*+]|\d+[.)])\s/;

/** 這個前綴是不是清單類（項目、有序、待辦）。標題與引用不算。 */
export function isListPrefix(prefix: string): boolean {
  return /^(?:[-*+] (?:\[[ xX]\] )?|\d+[.)] )$/.test(prefix);
}

/**
 * 這一行是不是「普通段落」。
 *
 * 空行、清單、引用、標題、圍欄、表格都算獨立的區塊，後面直接接清單沒有問題。
 * 只有普通段落後面緊接清單才需要補空行 —— 原因見 needsBlankLineBeforeList。
 */
export function isPlainParagraphLine(text: string): boolean {
  if (text.trim() === "") return false;
  return !/^[ \t]*(?:[-*+][ \t]|\d+[.)][ \t]|>|#{1,6}[ \t]|```|~~~|\|)/.test(text);
}

/**
 * 在 `previousLine` 之後起一個清單，需不需要先補一行空行。
 *
 * CommonMark 對「清單能不能打斷段落」有兩條限制，兩條都很容易踩到：
 *
 * 1. 第一個項目不能是空的。所以剛打完 `1. ` 還沒輸入內容時，那一行仍然是段落文字，
 *    預覽看起來像是「清單語法沒有生效」。
 * 2. 有序清單只有從 1 開始才能打斷段落。`2. 甲` 接在段落後面不會變成清單。
 *
 * 兩條都是標準行為。與其要求使用者背規則，不如在建立清單時補一行空行 ——
 * 那本來就是人手寫 Markdown 時會做的事，而且補完之後兩條限制都不再適用。
 */
export function needsBlankLineBeforeList(previousLineText: string | null): boolean {
  if (previousLineText === null) return false;
  return isPlainParagraphLine(previousLineText);
}

/**
 * 這一行按 Tab 要插什麼。
 *
 * **清單與空行用半形兩格**：清單的縮排是 Markdown 語法的一部分，換成全形空格就
 * 不再是巢狀清單了。空行歸在這一類是因為接下來最常打的就是清單標記 ——
 * `　- 項目` 開頭是全形空格，CommonMark 不當它是清單。
 *
 * **其他行用全形空格**：那些是純文字，半形空白會被 Markdown 吃掉，預覽看不到層次。
 * 理由見 TEXT_INDENT_UNIT。
 */
export function indentUnitFor(lineText: string): string {
  return LIST_LINE.test(lineText) || lineText.trim() === "" ? INDENT_UNIT : TEXT_INDENT_UNIT;
}

/**
 * Shift-Tab 要從行首拿掉幾個字元。
 *
 * 一次只退一層：一個全形空格，或一層半形縮排。行首沒有縮排就回傳 0。
 * 不能直接用 CodeMirror 的 indentLess —— 它把全形空格當成一般空白算欄數，
 * 連續兩個會被一次清光。
 */
export function outdentLength(lineText: string): number {
  if (lineText.startsWith(TEXT_INDENT_UNIT)) {
    return TEXT_INDENT_UNIT.length;
  }
  if (lineText.startsWith(INDENT_UNIT)) {
    return INDENT_UNIT.length;
  }
  // 落單的一格或一個 tab（多半是手打或貼進來的）也要退得掉
  return /^[ \t]/.test(lineText) ? 1 : 0;
}

// ---------------------------------------------------------------- 縮排參考線
/*
 * 中文行沒有空格，光看縮排量很難數出「這是第幾層」，尤其條列與清單混排的時候。
 * 參考線在每一層縮排的起點畫一條淡線，比尺標好用 —— 尺標只告訴你第幾欄，
 * 參考線直接把子項目跟它的上一層對齊起來。
 */

/** 每隔幾欄畫一條，跟 Tab 的縮排單位同一個值。 */
export const GUIDE_STEP = INDENT_UNIT.length;

/** tab 照 CommonMark 當四欄算；全形空格在等寬字體裡佔兩欄。 */
const COLUMN_WIDTH: Record<string, number> = { " ": 1, "\t": CODE_BLOCK_INDENT, "　": 2 };

/**
 * 行首空白換算成欄數。
 *
 * 整行都是空白時回傳 null —— 那種行自己沒有縮排可言，要跟鄰行借，
 * 否則清單項目之間空一行，參考線就斷掉了。
 */
export function leadingColumns(lineText: string): number | null {
  let columns = 0;

  for (const char of lineText) {
    const width = COLUMN_WIDTH[char];
    if (width === undefined) {
      return columns;
    }
    columns += width;
  }

  return null;
}

/** 這樣的縮排要畫幾條參考線。 */
export function guideCount(columns: number): number {
  return Math.floor(columns / GUIDE_STEP);
}

/**
 * 空行的縮排跟前後最近的非空行借，取比較淺的那一邊。
 *
 * 取小的才不會在清單結束後多畫一段：最後一項與下一段之間的空行，
 * 下一行已經回到最左邊，線就該在那裡停住。
 */
export function blankLineColumns(before: number | null, after: number | null): number {
  if (before === null) return after ?? 0;
  if (after === null) return before;
  return Math.min(before, after);
}
