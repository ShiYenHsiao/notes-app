import type { Element, Root, RootContent, Text } from "hast";

/** v1 只接受 title syntax；過長的 Quick Create 會拒絕，但解析仍保留原文。 */
export const WIKI_TITLE_CREATE_LIMIT = 200;

export type WikiLinkOccurrence = {
  /** 包含 `[[` 與 `]]` 的原文範圍。 */
  from: number;
  to: number;
  /** 去掉外圍空白、做 NFC 後的 lookup value。 */
  title: string;
  /** Markdown 裡括號之間的原始文字。 */
  rawTitle: string;
  occurrenceIndex: number;
};

export type WikiNoteCandidate = {
  id: string;
  title: string;
  updatedAt: string;
  updatedLabel: string;
  ambiguous?: boolean;
};

export type WikiLinkResolution = {
  title: string;
  status: "resolved" | "unresolved" | "ambiguous";
  targetId: string | null;
};

export type WikiTitleIdentity = { id: string; title: string | null };

export type WikiLinkIndexEntry = {
  targetTitle: string;
  targetNoteId: string | null;
  occurrenceIndex: number;
  from: number;
  to: number;
};

/**
 * Wiki Link lookup 刻意不做大小寫折疊或內部空白合併。
 *
 * 標題是 Markdown 第一行的可見文字；偷偷把「A  B」當成「A B」或把英文大小寫抹掉，
 * 會讓匯出的 title syntax 在別的工具裡無法重現同一個解析結果。NFC 只把視覺相同的
 * Unicode 組合形式收斂，trim 則對齊 `[[ 標題 ]]` 的直覺。
 */
export function normalizeWikiTitle(input: string): string {
  return input.normalize("NFC").trim();
}

/**
 * 掃描 Markdown 中可解讀的 `[[Title]]`。
 *
 * 不用全文件 regex：fenced code、indented code 與 inline code 都必須維持 literal text。
 * 這支 state machine 只辨識 v1 的單行 title，巢狀 bracket、空 link 與 escaped trigger
 * 一律忽略，讓 Markdown 原文保持普通文字。
 */
export function parseWikiLinks(markdown: string): WikiLinkOccurrence[] {
  const occurrences: WikiLinkOccurrence[] = [];
  let offset = 0;
  let fence: { marker: "`" | "~"; length: number } | null = null;
  let inlineTicks = 0;

  for (const lineWithBreak of markdown.match(/.*(?:\n|$)/g) ?? []) {
    if (lineWithBreak === "") {
      continue;
    }

    const hasBreak = lineWithBreak.endsWith("\n");
    const line = hasBreak ? lineWithBreak.slice(0, -1) : lineWithBreak;
    const fenceMark = line.match(/^ {0,3}(`{3,}|~{3,})/);

    if (fence) {
      if (
        fenceMark &&
        fenceMark[1][0] === fence.marker &&
        fenceMark[1].length >= fence.length &&
        line.slice(fenceMark[0].length).trim() === ""
      ) {
        fence = null;
      }
      offset += lineWithBreak.length;
      continue;
    }

    if (fenceMark) {
      fence = { marker: fenceMark[1][0] as "`" | "~", length: fenceMark[1].length };
      inlineTicks = 0;
      offset += lineWithBreak.length;
      continue;
    }

    // CommonMark 的四格縮排行是 literal code。空行不會開啟區塊，所以只略過這一行。
    if (/^(?: {4}|\t)/.test(line)) {
      offset += lineWithBreak.length;
      continue;
    }

    let index = 0;
    while (index < line.length) {
      if (line[index] === "`") {
        let run = 1;
        while (line[index + run] === "`") {
          run += 1;
        }
        if (inlineTicks === 0) {
          inlineTicks = run;
        } else if (run === inlineTicks) {
          inlineTicks = 0;
        }
        index += run;
        continue;
      }

      if (
        inlineTicks === 0 &&
        line[index] === "[" &&
        line[index + 1] === "[" &&
        !isEscaped(line, index)
      ) {
        const close = line.indexOf("]]", index + 2);
        if (close === -1) {
          break;
        }

        const rawTitle = line.slice(index + 2, close);
        const title = normalizeWikiTitle(rawTitle);
        // v1 不支援 nested bracket；保留成普通 Markdown，避免猜錯範圍。
        if (title && !/[\[\]\n]/.test(rawTitle)) {
          occurrences.push({
            from: offset + index,
            to: offset + close + 2,
            title,
            rawTitle,
            occurrenceIndex: occurrences.length,
          });
        }
        index = close + 2;
        continue;
      }

      index += 1;
    }

    offset += lineWithBreak.length;
  }

  return occurrences;
}

function isEscaped(line: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}

export function uniqueWikiTitles(markdown: string): string[] {
  return [...new Set(parseWikiLinks(markdown).map((link) => link.title))];
}

/** 唯一標題才可解析；同名時保留 ambiguous，絕不依排序任選第一篇。 */
export function resolveWikiTitlesFromCandidates(
  titles: readonly string[],
  candidates: readonly WikiTitleIdentity[],
): WikiLinkResolution[] {
  const unique = [...new Set(titles.map(normalizeWikiTitle).filter(Boolean))];
  const byTitle = new Map<string, string[]>();
  for (const candidate of candidates) {
    if (!candidate.title) {
      continue;
    }
    const title = normalizeWikiTitle(candidate.title);
    byTitle.set(title, [...(byTitle.get(title) ?? []), candidate.id]);
  }

  return unique.map((title) => {
    const ids = byTitle.get(title) ?? [];
    return ids.length === 1
      ? { title, status: "resolved" as const, targetId: ids[0] }
      : ids.length > 1
        ? { title, status: "ambiguous" as const, targetId: null }
        : { title, status: "unresolved" as const, targetId: null };
  });
}

/** 由 Markdown occurrence 與當下解析結果產生可重建的 relational index。 */
export function buildWikiLinkIndex(
  markdown: string,
  resolutions: readonly WikiLinkResolution[],
): WikiLinkIndexEntry[] {
  const byTitle = new Map(resolutions.map((item) => [item.title, item]));
  return parseWikiLinks(markdown).map((link) => {
    const resolution = byTitle.get(link.title);
    return {
      targetTitle: link.title,
      targetNoteId: resolution?.status === "resolved" ? resolution.targetId : null,
      occurrenceIndex: link.occurrenceIndex,
      from: link.from,
      to: link.to,
    };
  });
}

/** 比對內容而不是資料列 id，讓重建可測試地保持冪等。 */
export function wikiLinkIndexesEqual(
  left: readonly WikiLinkIndexEntry[],
  right: readonly WikiLinkIndexEntry[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => {
    const other = right[index];
    return (
      item.targetTitle === other.targetTitle &&
      item.targetNoteId === other.targetNoteId &&
      item.occurrenceIndex === other.occurrenceIndex &&
      item.from === other.from &&
      item.to === other.to
    );
  });
}

/** 只改語意上精確命中的 Wiki Link；code 與普通文字不會被碰到。 */
export function replaceWikiLinkTitle(markdown: string, fromTitle: string, toTitle: string): string {
  const normalizedFrom = normalizeWikiTitle(fromTitle);
  const matches = parseWikiLinks(markdown).filter((link) => link.title === normalizedFrom);
  let next = markdown;

  for (const match of matches.reverse()) {
    next = `${next.slice(0, match.from)}[[${toTitle}]]${next.slice(match.to)}`;
  }
  return next;
}

/** 取消知識連結改名時只還原第一行標題；同一批正文修改不能一起被丟掉。 */
export function replaceMarkdownTitle(markdown: string, title: string): string {
  const lineEnd = markdown.indexOf("\n");
  const firstLine = lineEnd === -1 ? markdown : markdown.slice(0, lineEnd);
  const rest = lineEnd === -1 ? "" : markdown.slice(lineEnd);
  const headingPrefix = /^#{1,6}[ \t]*/.exec(firstLine)?.[0] ?? "";
  return `${headingPrefix}${title}${rest}`;
}

/** Backlink context 以 Unicode code point 切割，不會把 emoji 或代理對切成半個字。 */
export function wikiLinkContext(
  markdown: string,
  occurrence: WikiLinkOccurrence,
  radius = 42,
): string {
  const before = Array.from(markdown.slice(0, occurrence.from));
  const hit = `[[${occurrence.title}]]`;
  const after = Array.from(markdown.slice(occurrence.to));
  const left = before.slice(Math.max(0, before.length - radius)).join("");
  const right = after.slice(0, radius).join("");
  const clean = (value: string) =>
    value
      .replace(/```[\s\S]*$/g, "")
      .replace(/^#{1,6}[ \t]*/gm, "")
      .replace(/^\s*(?:[-*+]|\d+[.)]|>)\s+/gm, "")
      .replace(/[\n\r\t]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return `${before.length > radius ? "…" : ""}${clean(left)} ${hit} ${clean(right)}${
    after.length > radius ? "…" : ""
  }`.replace(/\s+/g, " ").trim();
}

/** Autocomplete 與 Quick Open 共用：prefix 優先，其次 contains，再以時間與 id 穩定排序。 */
export function rankWikiCandidates(
  candidates: readonly WikiNoteCandidate[],
  query: string,
  limit = 20,
): WikiNoteCandidate[] {
  const normalizedQuery = normalizeWikiTitle(query).toLocaleLowerCase("zh-TW");
  return candidates
    .filter((candidate) =>
      candidate.title.toLocaleLowerCase("zh-TW").includes(normalizedQuery),
    )
    .sort((a, b) => {
      const left = a.title.toLocaleLowerCase("zh-TW");
      const right = b.title.toLocaleLowerCase("zh-TW");
      const leftPrefix = normalizedQuery ? left.startsWith(normalizedQuery) : true;
      const rightPrefix = normalizedQuery ? right.startsWith(normalizedQuery) : true;
      if (leftPrefix !== rightPrefix) {
        return leftPrefix ? -1 : 1;
      }
      const time = b.updatedAt.localeCompare(a.updatedAt);
      if (time !== 0) {
        return time;
      }
      const title = a.title.localeCompare(b.title, "zh-TW");
      return title || a.id.localeCompare(b.id);
    })
    .slice(0, limit);
}

export type WikiCompletionQuery = { from: number; query: string };

/** 找出游標前尚未關閉的 `[[query`；URL、普通 bracket 與已關閉 link 不觸發。 */
export function wikiCompletionQuery(textBeforeCursor: string): WikiCompletionQuery | null {
  const open = textBeforeCursor.lastIndexOf("[[");
  if (open === -1 || textBeforeCursor.lastIndexOf("]]", textBeforeCursor.length - 1) > open) {
    return null;
  }
  if (isEscaped(textBeforeCursor, open)) {
    return null;
  }
  const query = textBeforeCursor.slice(open + 2);
  if (/[\[\]\n]/.test(query)) {
    return null;
  }
  return { from: open, query };
}

export function wikiCompletionInsertion(title: string): string {
  return `[[${title}]]`;
}

// ---------------------------------------------------------------- Preview transformer

type WikiPreviewOptions = {
  resolutions?: readonly WikiLinkResolution[];
  interactive?: boolean;
};

/**
 * react-markdown 的 Markdown 階段不認得 Wiki Link；在 hast text node 上轉換能自然排除
 * `<code>`／`<pre>`，也不需要開放 raw HTML。輸出仍是可讀的 anchor/span 文字。
 */
export function rehypeWikiLinks(options: WikiPreviewOptions = {}) {
  const byTitle = new Map((options.resolutions ?? []).map((item) => [item.title, item]));
  const interactive = options.interactive !== false;

  return (tree: Root) => {
    transformWikiText(tree, byTitle, interactive);
  };
}

function transformWikiText(
  node: Root | Element,
  resolutions: ReadonlyMap<string, WikiLinkResolution>,
  interactive: boolean,
) {
  if (node.type === "element" && (node.tagName === "code" || node.tagName === "pre")) {
    return;
  }

  const children: RootContent[] = [];
  for (const child of node.children) {
    if (child.type === "text") {
      children.push(...splitWikiText(child, resolutions, interactive));
    } else {
      if (child.type === "element") {
        transformWikiText(child, resolutions, interactive);
      }
      children.push(child);
    }
  }
  node.children = children;
}

function splitWikiText(
  node: Text,
  resolutions: ReadonlyMap<string, WikiLinkResolution>,
  interactive: boolean,
): RootContent[] {
  const links = parseWikiLinks(node.value);
  if (links.length === 0) {
    return [node];
  }

  const output: RootContent[] = [];
  let cursor = 0;
  for (const link of links) {
    if (link.from > cursor) {
      output.push({ type: "text", value: node.value.slice(cursor, link.from) });
    }
    const resolution = resolutions.get(link.title);
    const resolved = resolution?.status === "resolved" && resolution.targetId;
    const ambiguous = resolution?.status === "ambiguous";
    const tagName = interactive ? "a" : "span";
    output.push({
      type: "element",
      tagName,
      properties: {
        className: ["wiki-link", resolved ? "wiki-link-resolved" : "wiki-link-unresolved"],
        dataWikiTitle: link.title,
        dataWikiTarget: resolved || undefined,
        dataWikiStatus: ambiguous ? "ambiguous" : resolved ? "resolved" : "unresolved",
        ...(interactive
          ? {
              href: resolved ? `/n/${encodeURIComponent(resolved)}` : "#",
              ariaLabel: resolved
                ? `開啟筆記：${link.title}`
                : ambiguous
                  ? `同名筆記不只一篇：${link.title}`
                  : `建立筆記：${link.title}`,
            }
          : {}),
      },
      children: [{ type: "text", value: `[[${link.title}]]` }],
    });
    cursor = link.to;
  }

  if (cursor < node.value.length) {
    output.push({ type: "text", value: node.value.slice(cursor) });
  }
  return output;
}
