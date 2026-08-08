/**
 * 左右兩欄的捲動對應。
 *
 * **不用等比例對應**：左邊是原始語法、右邊是渲染結果，同樣一段內容在兩邊的高度差很多 ——
 * 一張圖在左邊只有一行 `![](...)`，在右邊佔半個螢幕；一個表格在左邊三行，在右邊可能十行。
 * 等比例捲到後面會差到整段。
 *
 * 改成用**標題當錨點**：兩邊的每個標題各自知道自己在哪個高度，中間的部分線性內插。
 * 這對法律筆記特別有效，因為那種筆記本來就每隔幾段就一個標題。沒有標題的筆記會退回
 * 等比例（只剩頭尾兩個錨點），跟原本一樣。
 */

export type ScrollAnchor = {
  /** 在來源那一欄的捲動位置。 */
  source: number;
  /** 在目標那一欄的對應位置。 */
  target: number;
};

export function mapScroll(input: {
  /** 錨點，必須照 source 由小到大排好。 */
  anchors: ScrollAnchor[];
  /** 來源目前捲到哪。 */
  sourceTop: number;
  /** 來源捲得到的最大值（scrollHeight - clientHeight）。 */
  sourceMax: number;
  targetMax: number;
}): number {
  const { sourceTop, sourceMax, targetMax } = input;

  if (sourceMax <= 0 || targetMax <= 0) {
    return 0;
  }

  /*
   * 補上頭尾兩個錨點，內插才是完整的：
   * 最上面一定對最上面，捲到底一定對到底 —— 否則最後一個標題之後的內容會對不齊，
   * 而那通常是整篇最長的一段。
   */
  const points: ScrollAnchor[] = [
    { source: 0, target: 0 },
    ...input.anchors.filter((anchor) => anchor.source > 0 && anchor.source < sourceMax),
    { source: sourceMax, target: targetMax },
  ];

  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i];
    const to = points[i + 1];

    if (sourceTop > to.source) {
      continue;
    }

    const span = to.source - from.source;
    // 兩個錨點重疊（例如連續兩個標題）就直接用後面那個，不要除以零
    const ratio = span > 0 ? (sourceTop - from.source) / span : 1;

    return clamp(from.target + ratio * (to.target - from.target), 0, targetMax);
  }

  return targetMax;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
