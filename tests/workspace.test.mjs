/**
 * 工作區的規則：分頁與列表顯示。
 *
 *   node --test "tests/*.test.mjs"
 *
 * 這裡驗的是純函式。分頁列的實際點擊、右鍵選單的開關與焦點行為需要真的 DOM，
 * 那些在瀏覽器裡實際操作驗證（見 README 的狀態一節），不為此拉進 jsdom。
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { displayTitle, titleFromContent } from "../src/lib/note-display.ts";
import { batchPaths, expiryCutoff } from "../src/lib/retention.ts";
import {
  HELP_TAB_ID,
  nextActiveAfterClose,
  parseStoredTabs,
  pathForTab,
  tabIdForPath,
} from "../src/lib/tabs.ts";

// ---------------------------------------------------------------- 網址對應

test("筆記網址對應到分頁", () => {
  assert.equal(tabIdForPath("/n/abc-123"), "abc-123");
  // 標籤篩選會掛在 query 上，不影響分頁身分
  assert.equal(tabIdForPath("/n/abc-123?tag=t1"), "abc-123");
});

test("說明頁也是一個分頁", () => {
  assert.equal(tabIdForPath("/help"), HELP_TAB_ID);
  assert.equal(pathForTab(HELP_TAB_ID), "/help");
});

test("其他頁面不算分頁", () => {
  assert.equal(tabIdForPath("/"), null);
  assert.equal(tabIdForPath("/trash"), null);
  assert.equal(tabIdForPath("/login"), null);
});

test("分頁對應回網址", () => {
  assert.equal(pathForTab("abc-123"), "/n/abc-123");
});

// ---------------------------------------------------------------- 關閉分頁

test("關掉分頁後跳到左邊那個", () => {
  assert.equal(nextActiveAfterClose(["a", "b", "c"], "c"), "b");
  assert.equal(nextActiveAfterClose(["a", "b", "c"], "b"), "a");
});

test("最左邊的關掉就往右找", () => {
  assert.equal(nextActiveAfterClose(["a", "b", "c"], "a"), "b");
});

test("關掉最後一個就回到列表", () => {
  assert.equal(nextActiveAfterClose(["a"], "a"), null);
});

test("不在清單裡的分頁不影響目前這個", () => {
  assert.equal(nextActiveAfterClose(["a", "b"], "z"), null);
});

// ---------------------------------------------------------------- 儲存內容

test("讀得回存進去的分頁", () => {
  assert.deepEqual(parseStoredTabs('["a","b"]'), ["a", "b"]);
});

test("沒存過、存壞了、型別不對都當作沒有", () => {
  assert.deepEqual(parseStoredTabs(null), []);
  assert.deepEqual(parseStoredTabs("{壞掉的 JSON"), []);
  assert.deepEqual(parseStoredTabs('{"a":1}'), []);
  // 陣列裡混進非字串時只留字串
  assert.deepEqual(parseStoredTabs('["a",3,null,"b"]'), ["a", "b"]);
});

// ---------------------------------------------------------------- 標題

test("標題取內文第一行，去掉開頭的 #", () => {
  assert.equal(titleFromContent("# 刑法總論\n內容"), "刑法總論");
  assert.equal(titleFromContent("### 第三層標題"), "第三層標題");
  // 沒有 # 也算標題，跟資料庫的 generated column 一致
  assert.equal(titleFromContent("沒有井字號的第一行\n第二行"), "沒有井字號的第一行");
});

test("第一行是空的就沒有標題", () => {
  assert.equal(titleFromContent(""), null);
  assert.equal(titleFromContent("\n# 第二行才是標題"), null);
  assert.equal(titleFromContent("#   "), null);
});

test("沒有標題就退回摘要，再沒有就顯示無標題", () => {
  assert.equal(displayTitle({ title: "刑法總論", excerpt: "構成要件" }), "刑法總論");
  assert.equal(displayTitle({ title: null, excerpt: "構成要件" }), "構成要件");
  assert.equal(displayTitle({ title: null, excerpt: "" }), "無標題");
});

// ---------------------------------------------------------------- 垃圾桶保留期

test("過期界線是 30 天前", () => {
  const now = new Date("2026-08-07T00:00:00.000Z");
  assert.equal(expiryCutoff(now), "2026-07-08T00:00:00.000Z");
});

test("剛好 30 天的那一刻還沒過期", () => {
  // lt(cutoff) 是嚴格小於，所以界線上的那一筆會留到下一次
  const now = new Date("2026-08-07T00:00:00.000Z");
  const cutoff = new Date(expiryCutoff(now));
  const trashedExactly30DaysAgo = new Date("2026-07-08T00:00:00.000Z");
  assert.equal(trashedExactly30DaysAgo < cutoff, false);
});

test("刪檔案切成批次", () => {
  assert.deepEqual(batchPaths(["a", "b", "c"], 2), [["a", "b"], ["c"]]);
  assert.deepEqual(batchPaths([], 2), []);
  // 正好整除時不會多出一個空批次
  assert.deepEqual(batchPaths(["a", "b"], 2), [["a", "b"]]);
});
