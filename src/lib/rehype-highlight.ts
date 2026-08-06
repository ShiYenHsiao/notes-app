import type { Element, Root, RootContent, Text } from "hast";

/**
 * 把 `==文字==` 轉成螢光筆標記。
 *
 * 語法：
 *   ==文字==      黃色（預設）
 *   ==文字=={g}   綠、{p} 粉、{b} 藍
 *
 * 不帶顏色後綴的形式跟 HackMD、Obsidian 完全一樣，所以匯出的 .md 在那些
 * 編輯器裡照樣是螢光筆。帶後綴的會多顯示 `{g}` 幾個字，這是四色的代價。
 *
 * 做成 rehype（HTML 階段）而不是 remark（Markdown 階段），是因為這裡要產生的
 * 就是一個 <mark> 元素，在 hast 上直接組出來最短。
 */

/** `==` 之間不能再有 `=`，避免把 `a == b == c` 這種比較式吃掉。 */
const HIGHLIGHT_PATTERN = /==([^=\n]+)==(?:\{([gpb])\})?/g;

/** 這些標籤裡的文字是程式碼或原始內容，不該被當成語法解析。 */
const SKIP_TAGS = new Set(["code", "pre", "kbd", "samp"]);

export function rehypeHighlight() {
  return (tree: Root) => {
    transform(tree);
  };
}

function transform(node: Root | Element) {
  if (node.type === "element" && SKIP_TAGS.has(node.tagName)) {
    return;
  }

  const next: RootContent[] = [];
  let changed = false;

  for (const child of node.children) {
    if (child.type === "text") {
      const pieces = splitText(child);
      if (pieces) {
        next.push(...pieces);
        changed = true;
        continue;
      }
    } else if (child.type === "element") {
      transform(child);
    }

    next.push(child);
  }

  if (changed) {
    node.children = next;
  }
}

/** 沒有任何標記時回傳 null，讓呼叫端可以原樣保留節點。 */
function splitText(node: Text): RootContent[] | null {
  const value = node.value;
  HIGHLIGHT_PATTERN.lastIndex = 0;

  if (!HIGHLIGHT_PATTERN.test(value)) {
    return null;
  }

  HIGHLIGHT_PATTERN.lastIndex = 0;
  const out: RootContent[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = HIGHLIGHT_PATTERN.exec(value)) !== null) {
    if (match.index > cursor) {
      out.push({ type: "text", value: value.slice(cursor, match.index) });
    }

    const mark: Element = {
      type: "element",
      tagName: "mark",
      properties: match[2] ? { dataHl: match[2] } : {},
      children: [{ type: "text", value: match[1] }],
    };
    out.push(mark);

    cursor = match.index + match[0].length;
  }

  if (cursor < value.length) {
    out.push({ type: "text", value: value.slice(cursor) });
  }

  return out;
}
