import type { Element, ElementContent, Root } from "hast";

/**
 * 把 GitHub 形式的提示區塊轉成重點區塊。
 *
 *   > [!NOTE]
 *   > 內容
 *
 * 底層仍是 blockquote，所以不支援的編輯器至少會顯示成引用而不是亂碼，
 * GitHub 與 Obsidian 則原生就會渲染成提示框。
 *
 * 不支援 HackMD 的 `:::info` —— 那個語法不會產生 blockquote，只是一般段落，
 * 要接就得走完全不同的處理路徑。目前沒有這個需求。
 */

type CalloutKind = "note" | "tip" | "important" | "warning" | "caution";

const LABELS: Record<CalloutKind, string> = {
  note: "提示",
  tip: "訣竅",
  important: "重要",
  warning: "注意",
  caution: "警告",
};

const GITHUB_MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/;

export function rehypeCallout() {
  return (tree: Root) => {
    walk(tree);
  };
}

function walk(node: Root | Element) {
  for (let i = 0; i < node.children.length; i += 1) {
    const child = node.children[i];
    if (child.type !== "element") {
      continue;
    }

    if (child.tagName === "blockquote") {
      const converted = convertBlockquote(child);
      if (converted) {
        node.children[i] = converted;
        continue;
      }
    }

    walk(child);
  }
}

/** 不是 callout 就回傳 null，讓呼叫端保留原本的 blockquote。 */
function convertBlockquote(quote: Element): Element | null {
  const firstParagraph = quote.children.find(
    (child): child is Element => child.type === "element" && child.tagName === "p",
  );
  if (!firstParagraph) {
    return null;
  }

  const firstText = firstParagraph.children[0];
  if (!firstText || firstText.type !== "text") {
    return null;
  }

  const marker = firstText.value.match(GITHUB_MARKER);
  if (!marker) {
    return null;
  }

  const kind = marker[1].toLowerCase() as CalloutKind;
  // 標記本身不該出現在內容裡
  firstText.value = firstText.value.slice(marker[0].length);

  // 標記自成一行時，去掉標記後會留下一個空段落
  const body = quote.children.filter((child) => {
    if (child === firstParagraph && isEmptyParagraph(firstParagraph)) {
      return false;
    }
    return true;
  });

  const label: ElementContent = {
    type: "element",
    tagName: "div",
    properties: { className: ["callout-label"] },
    children: [{ type: "text", value: LABELS[kind] }],
  };

  return {
    type: "element",
    tagName: "div",
    properties: { className: ["callout", `callout-${kind}`] },
    children: [label, ...body],
  };
}

function isEmptyParagraph(paragraph: Element): boolean {
  return paragraph.children.every(
    (child) => child.type === "text" && child.value.trim() === "",
  );
}
