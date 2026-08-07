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

import {
  blankLineColumns,
  guideCount,
  indentUnitFor,
  INDENT_UNIT,
  isListPrefix,
  leadingColumns,
  needsBlankLineBeforeList,
  outdentLength,
  TEXT_INDENT_UNIT,
} from "../src/lib/indent-rules.ts";
import { calloutBlock } from "../src/lib/callouts.ts";
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

test("法律筆記的四種備註框都有中文標籤", async () => {
  assert.match(outline(await render("> [!KEY]\n> 內容")), /<div>重點<\/div>/);
  assert.match(outline(await render("> [!PRACTICE]\n> 內容")), /<div>實務見解<\/div>/);
  assert.match(outline(await render("> [!PITFALL]\n> 內容")), /<div>易錯提醒<\/div>/);
  assert.match(outline(await render("> [!INSIGHT]\n> 內容")), /<div>自我理解<\/div>/);
});

test("既有筆記用的 GitHub 類型照樣認得", async () => {
  // 不能為了新類型把舊筆記弄壞
  assert.match(outline(await render("> [!NOTE]\n> 內容")), /<div>提示<\/div>/);
  assert.match(outline(await render("> [!CAUTION]\n> 內容")), /<div>警告<\/div>/);
});

test("不認得的類型維持成引用，標記文字留著", async () => {
  const html = outline(await render("> [!UNKNOWN]\n> 內容"));
  assert.match(html, /<blockquote>/);
  assert.match(html, /\[!UNKNOWN\]/);
});

test("工具列插入的備註框渲染得出來", async () => {
  // calloutBlock 產生的形狀：標記一行、內容一行
  const html = outline(await render(`${calloutBlock("KEY")}構成要件`));
  assert.match(html, /<div>重點<\/div>/);
  assert.match(html, /構成要件/);
});

// ---------------------------------------------------------------- 縮排規則

test("清單與空行用半形兩格 —— 那是 Markdown 語法的一部分", () => {
  assert.equal(indentUnitFor("- 甲"), INDENT_UNIT);
  assert.equal(indentUnitFor("  - 已經縮過一層"), INDENT_UNIT);
  assert.equal(indentUnitFor("1. 有序清單"), INDENT_UNIT);
  assert.equal(indentUnitFor("- [ ] 待辦"), INDENT_UNIT);
  // 空行接下來最常打的就是清單標記，全形空格開頭的話 CommonMark 不當它是清單
  assert.equal(indentUnitFor(""), INDENT_UNIT);
  assert.equal(indentUnitFor("    "), INDENT_UNIT);
});

test("其他行用全形空格 —— 半形的在預覽會被吃掉", () => {
  assert.equal(indentUnitFor("一般段落"), TEXT_INDENT_UNIT);
  assert.equal(indentUnitFor("一、意義"), TEXT_INDENT_UNIT);
  assert.equal(indentUnitFor("　（一）主觀"), TEXT_INDENT_UNIT);
  assert.equal(indentUnitFor("> 引用"), TEXT_INDENT_UNIT);
});

test("Shift-Tab 一次退一層", () => {
  assert.equal(outdentLength("　一、意義"), 1);
  // 連續兩個全形空格只退一個
  assert.equal(outdentLength("　　（一）主觀"), 1);
  assert.equal(outdentLength("  - 甲"), 2);
  // 落單的一格或 tab 也要退得掉
  assert.equal(outdentLength(" 甲"), 1);
  assert.equal(outdentLength("\t甲"), 1);
});

test("行首沒有縮排就不動", () => {
  assert.equal(outdentLength("一般段落"), 0);
  assert.equal(outdentLength(""), 0);
});

// ---------------------------------------------------------------- 清單與段落的銜接

test("空的清單項目無法打斷段落（這就是預覽看起來沒生效的原因）", async () => {
  const tree = await render("一般段落\n1.");
  assert.doesNotMatch(outline(tree), /<ol>/);
});

test("有內容的 1. 可以打斷段落", async () => {
  const tree = await render("一般段落\n1. 甲");
  assert.match(outline(tree), /<ol>/);
});

test("有序清單非 1 開頭時無法打斷段落", async () => {
  const tree = await render("一般段落\n2. 甲");
  assert.doesNotMatch(outline(tree), /<ol>/);
});

test("補上空行之後兩種限制都不再適用", async () => {
  assert.match(outline(await render("一般段落\n\n1. 甲")), /<ol>/);
  assert.match(outline(await render("一般段落\n\n2. 甲")), /<ol>/);
  assert.match(outline(await render("一般段落\n\n1.")), /<ol>/);
});

test("項目清單與待辦清單本來就能打斷段落", async () => {
  assert.match(outline(await render("一般段落\n- 甲")), /<ul>/);
  assert.match(outline(await render("一般段落\n- [ ] 甲")), /<ul>/);
});

test("巢狀清單正確渲染", async () => {
  const html = outline(await render("- 甲\n  - 乙"));
  assert.match(html, /<ul>.*<ul>/s);
});

test("待辦清單渲染成 checkbox", async () => {
  assert.match(outline(await render("- [ ] 甲\n- [x] 乙")), /<input>/);
});

// ---------------------------------------------------------------- 補空行的判斷

test("普通段落後面起清單需要補空行", () => {
  assert.equal(needsBlankLineBeforeList("一般段落"), true);
});

test("空行、清單、引用、標題後面不需要補", () => {
  assert.equal(needsBlankLineBeforeList(""), false);
  assert.equal(needsBlankLineBeforeList("   "), false);
  assert.equal(needsBlankLineBeforeList("- 甲"), false);
  assert.equal(needsBlankLineBeforeList("1. 甲"), false);
  assert.equal(needsBlankLineBeforeList("- [ ] 甲"), false);
  assert.equal(needsBlankLineBeforeList("> 引用"), false);
  assert.equal(needsBlankLineBeforeList("## 標題"), false);
  assert.equal(needsBlankLineBeforeList("```"), false);
  assert.equal(needsBlankLineBeforeList("| 欄 | 位 |"), false);
});

test("文件第一行不需要補", () => {
  assert.equal(needsBlankLineBeforeList(null), false);
});

// ---------------------------------------------------------------- 中文條列的分行

test("中文條列不補硬換行的話會被接成同一段", async () => {
  const html = outline(await render("一、意義\n二、要件"));
  assert.doesNotMatch(html, /<br>/);
});

test("行尾兩個空白會渲染成硬換行", async () => {
  const html = outline(await render("一、意義  \n二、要件"));
  assert.match(html, /<br>/);
});

// ---------------------------------------------------------------- 縮排與預覽

test("半形空白的縮排在預覽會被吃掉", async () => {
  // 這就是 Tab 不能用半形空白縮中文條列的原因
  const html = outline(await render("一、意義  \n  （一）主觀"));
  assert.match(html, /（一）主觀/);
  assert.doesNotMatch(html, / {2}（一）主觀/);
});

test("tab 縮排同樣會被吃掉", async () => {
  const html = outline(await render("一、意義  \n\t（一）主觀"));
  assert.doesNotMatch(html, /\t（一）主觀/);
});

test("全形空格的縮排會原封不動留到預覽", async () => {
  // U+3000 對 Markdown 與 CSS 都是普通字元，所以編輯區與預覽長得一樣
  const html = outline(await render("一、意義  \n　　（一）主觀"));
  assert.match(html, /　　（一）主觀/);
});

test("全形空格不會變成程式碼區塊", async () => {
  // 半形四格會，全形四個不會 —— indented code block 只認半形空白與 tab
  assert.match(outline(await render("　　　　一般段落")), /<p>/);
  assert.doesNotMatch(outline(await render("　　　　一般段落")), /<pre>/);
});

test("清單的縮排照樣是巢狀語法", async () => {
  assert.match(outline(await render("- 項目\n  - 子項目")), /<ul>.*<ul>/s);
});

// ---------------------------------------------------------------- 縮排參考線

test("行首空白換算成欄數", () => {
  assert.equal(leadingColumns("沒有縮排"), 0);
  assert.equal(leadingColumns("  縮一層"), 2);
  assert.equal(leadingColumns("    縮兩層"), 4);
  // tab 照 CommonMark 當四欄，全形空格在等寬字體裡佔兩欄
  assert.equal(leadingColumns("\t一層"), 4);
  assert.equal(leadingColumns("　全形"), 2);
});

test("整行都是空白的話沒有自己的縮排", () => {
  assert.equal(leadingColumns(""), null);
  assert.equal(leadingColumns("    "), null);
});

test("每兩欄一條線", () => {
  assert.equal(guideCount(0), 0);
  assert.equal(guideCount(1), 0);
  assert.equal(guideCount(2), 1);
  assert.equal(guideCount(5), 2);
});

test("空行跟前後最近的非空行借縮排，取比較淺的", () => {
  assert.equal(blankLineColumns(4, 2), 2);
  assert.equal(blankLineColumns(2, 4), 2);
  // 清單後面接回最左邊的段落時，線要停住
  assert.equal(blankLineColumns(4, 0), 0);
  // 只有一邊有得借
  assert.equal(blankLineColumns(null, 4), 4);
  assert.equal(blankLineColumns(4, null), 4);
  assert.equal(blankLineColumns(null, null), 0);
});

// ---------------------------------------------------------------- 工具列前綴

test("清單前綴互斥，不會疊成 1. - 內容", () => {
  assert.equal(isListPrefix("- "), true);
  assert.equal(isListPrefix("1. "), true);
  assert.equal(isListPrefix("- [ ] "), true);
  // 標題與引用不是清單，不該觸發補空行
  assert.equal(isListPrefix("# "), false);
  assert.equal(isListPrefix("> "), false);
});
