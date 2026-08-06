/**
 * Markdown 解析與縮排規則的測試。
 *
 * 用 node:test，不另外裝測試框架 —— 這個專案要驗的東西就是幾條純函式與
 * remark 的解析結果，為此拉進 Jest 或 Vitest 不划算。
 *
 *   node --test tests/
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";

import { classifyIndent } from "../src/lib/indent-rules.ts";
import { rehypeHighlight } from "../src/lib/rehype-highlight.ts";
import { rehypeCallout } from "../src/lib/rehype-callout.ts";

/** 跑一次跟 markdown-preview.tsx 相同順序的管線，回傳 hast。 */
async function render(markdown) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeCallout)
    .use(rehypeHighlight);

  return processor.run(processor.parse(markdown));
}

/** 把 hast 攤平成 `tagName[data-hl]:文字` 的字串，方便斷言。 */
function outline(node) {
  if (node.type === "text") return node.value;
  const inner = (node.children ?? []).map(outline).join("");
  if (node.type !== "element") return inner;
  // 顏色後綴只掛在開始標籤上，結束標籤維持原樣，斷言時要留意
  const hl = node.properties?.dataHl ? `:${node.properties.dataHl}` : "";
  return `<${node.tagName}${hl}>${inner}</${node.tagName}>`;
}

// ---------------------------------------------------------------- 螢光標記

test("一般段落裡的 ==重點== 會渲染成 mark", async () => {
  const tree = await render("構成要件有 ==故意==。");
  assert.match(outline(tree), /<mark>故意<\/mark>/);
});

test("顏色後綴會變成 data-hl", async () => {
  const tree = await render("==但書=={g}");
  assert.match(outline(tree), /<mark:g>但書<\/mark>/);
});

test("比較式不會被誤判成螢光標記", async () => {
  const tree = await render("if a == b then");
  assert.doesNotMatch(outline(tree), /<mark/);
});

// ---------------------------------------------------------------- 程式碼區塊

test("行首四個空白會依 Markdown 標準變成程式碼區塊", async () => {
  const tree = await render("    一般段落被縮排四格");
  assert.match(outline(tree), /<pre><code>/);
});

test("行首兩個空白仍然是一般段落", async () => {
  const tree = await render("  只縮一層");
  assert.match(outline(tree), /<p>/);
  assert.doesNotMatch(outline(tree), /<pre>/);
});

test("程式碼區塊裡的 ==重點== 不會渲染成螢光標記", async () => {
  const tree = await render("    ==這在程式碼區塊裡==");
  const html = outline(tree);
  assert.match(html, /<pre><code>/);
  assert.doesNotMatch(html, /<mark/);
  assert.match(html, /==這在程式碼區塊裡==/);
});

test("圍欄式程式碼區塊裡的 ==重點== 同樣不解析", async () => {
  const tree = await render("```\n==不該變色==\n```");
  assert.doesNotMatch(outline(tree), /<mark/);
});

test("行內程式碼裡的 ==重點== 不解析", async () => {
  const tree = await render("`==不該變色==`");
  assert.doesNotMatch(outline(tree), /<mark/);
});

// ---------------------------------------------------------------- 重點區塊

test("GitHub 式 callout 會渲染成重點區塊", async () => {
  const tree = await render("> [!NOTE]\n> 內容");
  const html = outline(tree);
  assert.match(html, /<div>提示<\/div>/);
  assert.doesNotMatch(html, /\[!NOTE\]/);
});

test("普通引用不會被誤判成重點區塊", async () => {
  const tree = await render("> 只是引用");
  assert.match(outline(tree), /<blockquote>/);
});

// ---------------------------------------------------------------- 縮排規則

test("清單項目按 Tab 會照標準縮排", () => {
  assert.equal(classifyIndent({ lineText: "- 甲", multiLine: false }), "indent");
  assert.equal(classifyIndent({ lineText: "  - 已經縮過一層", multiLine: false }), "indent");
  assert.equal(classifyIndent({ lineText: "1. 有序清單", multiLine: false }), "indent");
  assert.equal(classifyIndent({ lineText: "- [ ] 待辦", multiLine: false }), "indent");
});

test("跨行選取一律正常縮排", () => {
  assert.equal(classifyIndent({ lineText: "    已經很深的一般段落", multiLine: true }), "indent");
});

test("一般段落第一次 Tab 可以縮", () => {
  assert.equal(classifyIndent({ lineText: "一般段落", multiLine: false }), "indent");
});

test("一般段落縮到要滿四格時會被擋下來", () => {
  // 已經兩格，再縮一層就是四格 → 會變成程式碼區塊
  assert.equal(classifyIndent({ lineText: "  一般段落", multiLine: false }), "blocked");
});

test("tab 字元照 CommonMark 當四格算", () => {
  assert.equal(classifyIndent({ lineText: "\t一般段落", multiLine: false }), "blocked");
});

test("空行可以自由縮排", () => {
  assert.equal(classifyIndent({ lineText: "    ", multiLine: false }), "indent");
});
