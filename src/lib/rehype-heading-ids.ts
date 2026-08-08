import type { Element, Root } from "hast";

import { headingAnchorId } from "./outline";

/**
 * 給預覽區的每個標題掛一個 id，讓大綱面板點得到。
 *
 * **用出現順序當 id，不用標題文字做 slug**：法律筆記裡「意義」「要件」「實務見解」
 * 這種標題會重複出現十幾次，slug 一定撞號；而且中文 slug 不是被整串轉成拼音就是
 * 被清成空字串。順序在同一份內文裡永遠唯一，也正好對得上 `parseOutline` 的 index。
 */
const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

export function rehypeHeadingIds() {
  return (tree: Root) => {
    let index = 0;

    // 只走頂層：預覽區的標題不會長在 blockquote 或 list 裡面，
    // 而 parseOutline 也只認行首的 `#`，兩邊的計數才對得起來。
    for (const node of tree.children) {
      if (node.type !== "element" || !HEADINGS.has(node.tagName)) {
        continue;
      }

      const element = node as Element;
      element.properties = { ...element.properties, id: headingAnchorId(index) };
      index += 1;
    }
  };
}
