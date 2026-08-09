import assert from "node:assert/strict";
import { test } from "node:test";

import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";

import { isWikiCompletionInsideCode } from "../src/lib/wiki-completion.ts";
import {
  buildWikiLinkIndex,
  normalizeWikiTitle,
  parseWikiLinks,
  rankWikiCandidates,
  rehypeWikiLinks,
  replaceMarkdownTitle,
  replaceWikiLinkTitle,
  resolveWikiTitlesFromCandidates,
  uniqueWikiTitles,
  wikiCompletionInsertion,
  wikiCompletionQuery,
  wikiLinkContext,
  wikiLinkIndexesEqual,
} from "../src/lib/wiki-links.ts";

function flat(node) {
  if (node.type === "text") return node.value;
  const body = (node.children ?? []).map(flat).join("");
  if (node.type !== "element") return body;
  const status = node.properties?.dataWikiStatus ? `:${node.properties.dataWikiStatus}` : "";
  return `<${node.tagName}${status}>${body}</${node.tagName}>`;
}

async function render(markdown, resolutions = [], interactive = true) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeWikiLinks, { resolutions, interactive });
  return processor.run(processor.parse(markdown));
}

test("解析一般中文、標點與 emoji Wiki Link", () => {
  const links = parseWikiLinks("依 [[令狀原則]]，另參 [[撤銷（例外）⚖️]]。 ");
  assert.deepEqual(links.map((link) => link.title), ["令狀原則", "撤銷（例外）⚖️"]);
  assert.deepEqual(links.map((link) => link.occurrenceIndex), [0, 1]);
});

test("title trim 外圍空白並收斂 Unicode NFC，但保留大小寫與內部空白", () => {
  assert.equal(normalizeWikiTitle("  Cafe\u0301  "), "Café");
  assert.notEqual(normalizeWikiTitle("ABC"), normalizeWikiTitle("abc"));
  assert.notEqual(normalizeWikiTitle("A  B"), normalizeWikiTitle("A B"));
});

test("inline code、fenced code 與 indented code 不建立連結", () => {
  const content = [
    "`[[行內]]` 與 [[正文]]",
    "```md",
    "[[圍欄]]",
    "```",
    "    [[縮排]]",
    "~~~",
    "[[波浪圍欄]]",
    "~~~",
  ].join("\n");
  assert.deepEqual(parseWikiLinks(content).map((link) => link.title), ["正文"]);
});

test("跨行 inline code span 內維持 literal", () => {
  assert.deepEqual(parseWikiLinks("``前段\n[[不解析]]\n後段`` [[解析]]").map((link) => link.title), ["解析"]);
});

test("空、未閉合、巢狀 bracket 與 escaped trigger 都不解析", () => {
  const content = String.raw`[[ ]] [[未閉合 \[[跳脫]] [[外[[內]]]]`;
  assert.deepEqual(parseWikiLinks(content), []);
});

test("重複連結保留每一次 occurrence 與精確 offset", () => {
  const content = "[[甲]]、[[甲]]";
  const links = parseWikiLinks(content);
  assert.equal(links.length, 2);
  assert.equal(content.slice(links[1].from, links[1].to), "[[甲]]");
});

test("unique title 按第一次出現順序去重", () => {
  assert.deepEqual(uniqueWikiTitles("[[乙]] [[甲]] [[乙]]"), ["乙", "甲"]);
});

test("唯一標題 resolved、缺漏 unresolved、同名 ambiguous", () => {
  const result = resolveWikiTitlesFromCandidates(
    ["甲", "乙", "丙"],
    [
      { id: "a", title: "甲" },
      { id: "b1", title: "乙" },
      { id: "b2", title: "乙" },
    ],
  );
  assert.deepEqual(result, [
    { title: "甲", status: "resolved", targetId: "a" },
    { title: "乙", status: "ambiguous", targetId: null },
    { title: "丙", status: "unresolved", targetId: null },
  ]);
});

test("soft delete 等同候選消失，restore 後同 identity 自然恢復", () => {
  assert.equal(resolveWikiTitlesFromCandidates(["甲"], [])[0].status, "unresolved");
  assert.deepEqual(resolveWikiTitlesFromCandidates(["甲"], [{ id: "same-id", title: "甲" }])[0], {
    title: "甲",
    status: "resolved",
    targetId: "same-id",
  });
});

test("self-link 與循環引用只建立普通 index，不遞迴展開", () => {
  const resolutions = [
    { title: "A", status: "resolved", targetId: "a" },
    { title: "B", status: "resolved", targetId: "b" },
  ];
  assert.equal(buildWikiLinkIndex("# A\n[[A]] [[B]]", resolutions)[0].targetNoteId, "a");
  assert.equal(buildWikiLinkIndex("# B\n[[A]]", resolutions).length, 1);
});

test("index rebuild 相同輸入保持冪等", () => {
  const resolution = [{ title: "甲", status: "resolved", targetId: "id-1" }];
  const first = buildWikiLinkIndex("[[甲]]", resolution);
  const second = buildWikiLinkIndex("[[甲]]", resolution);
  assert.equal(wikiLinkIndexesEqual(first, second), true);
});

test("解析結果改變會被判定需要 repair", () => {
  const oldIndex = buildWikiLinkIndex("[[甲]]", [
    { title: "甲", status: "resolved", targetId: "old" },
  ]);
  const rebuilt = buildWikiLinkIndex("[[甲]]", [
    { title: "甲", status: "unresolved", targetId: null },
  ]);
  assert.equal(wikiLinkIndexesEqual(oldIndex, rebuilt), false);
});

test("rename 只替換精確 Wiki Link，不碰相似標題與 code", () => {
  const source = "[[舊名]] [[舊名稱]] `[[舊名]]`\n```\n[[舊名]]\n```";
  assert.equal(
    replaceWikiLinkTitle(source, "舊名", "新名"),
    "[[新名]] [[舊名稱]] `[[舊名]]`\n```\n[[舊名]]\n```",
  );
});

test("取消改名只還原第一行標題，保留標題層級與正文修改", () => {
  assert.equal(
    replaceMarkdownTitle("## 新標題\n剛補的正文\n", "舊標題"),
    "## 舊標題\n剛補的正文\n",
  );
  assert.equal(replaceMarkdownTitle("新標題", "舊標題"), "舊標題");
});

test("Backlink context 不切斷 emoji，且限制左右長度", () => {
  const content = `${"法⚖️".repeat(50)} [[目標]] ${"理📚".repeat(50)}`;
  const context = wikiLinkContext(content, parseWikiLinks(content)[0], 12);
  assert.match(context, /\[\[目標\]\]/);
  assert.doesNotMatch(context, /�/);
  assert.ok(context.startsWith("…") && context.endsWith("…"));
});

test("autocomplete 找出空 query 與中文 query 的 replacement range", () => {
  assert.deepEqual(wikiCompletionQuery("前文 [["), { from: 3, query: "" });
  assert.deepEqual(wikiCompletionQuery("前文 [[令狀"), { from: 3, query: "令狀" });
  assert.equal(wikiCompletionInsertion("令狀原則"), "[[令狀原則]]");
});

test("已關閉、換行、巢狀與 escaped completion 不觸發", () => {
  assert.equal(wikiCompletionQuery("[[甲]]"), null);
  assert.equal(wikiCompletionQuery("[[甲\n"), null);
  assert.equal(wikiCompletionQuery("[[甲["), null);
  assert.equal(wikiCompletionQuery(String.raw`\[[甲`), null);
});

test("CodeMirror completion 在 inline／fenced code 內不觸發", () => {
  for (const doc of ["`[[`", "```md\n[[\n```", "    [["] ) {
    const state = EditorState.create({ doc, extensions: [markdown()] });
    const position = doc.indexOf("[[") + 2;
    assert.equal(isWikiCompletionInsideCode(state, position), true, doc);
  }
  const normal = EditorState.create({ doc: "正文 [[", extensions: [markdown()] });
  assert.equal(isWikiCompletionInsideCode(normal, normal.doc.length), false);
});

test("autocomplete ranking 以 prefix 優先、contains 次之且穩定", () => {
  const candidates = [
    { id: "2", title: "刑法令狀", updatedAt: "2026-01-03", updatedLabel: "" },
    { id: "3", title: "令狀例外", updatedAt: "2026-01-01", updatedLabel: "" },
    { id: "1", title: "令狀原則", updatedAt: "2026-01-02", updatedLabel: "" },
  ];
  assert.deepEqual(rankWikiCandidates(candidates, "令狀").map((item) => item.id), ["1", "3", "2"]);
});

test("Preview resolved link 產生 app route，unresolved 保留可讀 title", async () => {
  const tree = await render("[[甲]] [[乙]]", [
    { title: "甲", status: "resolved", targetId: "note-a" },
    { title: "乙", status: "unresolved", targetId: null },
  ]);
  const html = flat(tree);
  assert.match(html, /<a:resolved>\[\[甲\]\]<\/a>/);
  assert.match(html, /<a:unresolved>\[\[乙\]\]<\/a>/);
});

test("Preview 不在 code 內轉換 Wiki Link", async () => {
  const html = flat(await render("`[[甲]]`\n\n```\n[[乙]]\n```"));
  assert.doesNotMatch(html, /wiki|resolved|unresolved/);
  assert.match(html, /\[\[甲\]\]/);
  assert.match(html, /\[\[乙\]\]/);
});

test("PDF mode 輸出 span 而非互動 anchor", async () => {
  const html = flat(
    await render(
      "[[甲]]",
      [{ title: "甲", status: "resolved", targetId: "note-a" }],
      false,
    ),
  );
  assert.match(html, /<span:resolved>\[\[甲\]\]<\/span>/);
  assert.doesNotMatch(html, /<a/);
});

test("長 title 仍完整保存在 parse 與 index", () => {
  const title = "長".repeat(500);
  const link = parseWikiLinks(`[[${title}]]`)[0];
  assert.equal(link.title.length, 500);
  assert.equal(buildWikiLinkIndex(`[[${title}]]`, []).length, 1);
});
