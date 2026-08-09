import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatPrintDate,
  normalizePrintStyle,
  printBodyContent,
  printDisplayTitle,
  printDocumentTitle,
  printPath,
  printTags,
} from "../src/lib/print-export.ts";

test("PDF 樣式只接受 Study 與 Clean", () => {
  assert.equal(normalizePrintStyle("clean"), "clean");
  assert.equal(normalizePrintStyle("study"), "study");
  assert.equal(normalizePrintStyle("dark"), "study");
  assert.equal(normalizePrintStyle(null), "study");
});

test("空白筆記使用安全的顯示標題", () => {
  assert.equal(printDisplayTitle("  刑法總論  "), "刑法總論");
  assert.equal(printDisplayTitle("  "), "未命名筆記");
  assert.equal(printDocumentTitle(null), "未命名筆記 — NEXUM NOTE");
});

test("匯出日期固定用台北日曆日", () => {
  assert.equal(formatPrintDate("2026-08-08T16:30:00.000Z"), "2026 年 8 月 9 日");
});

test("PDF metadata 標籤會清理空白並去重", () => {
  assert.deepEqual(printTags(["刑法", " 重要 ", "刑法", " "]), ["刑法", "重要"]);
});

test("文件 header 已顯示的 Markdown 首行標題不會重複列印", () => {
  assert.equal(printBodyContent("# 刑法總論\n\n第一段"), "第一段");
  assert.equal(printBodyContent("### 爭點\n內容"), "內容");
});

test("純文字首行與中文條列不會被當成重複標題吃掉", () => {
  assert.equal(printBodyContent("刑法總論\n第一段"), "刑法總論\n第一段");
  assert.equal(printBodyContent("一、意義\n（一）要件"), "一、意義\n（一）要件");
  assert.equal(printBodyContent("#沒有空白不是標題\n內容"), "#沒有空白不是標題\n內容");
});

test("Print route 會安全編碼 note id", () => {
  assert.equal(printPath("abc/測試"), "/n/abc%2F%E6%B8%AC%E8%A9%A6/print");
});

test("PDF 正文保留 Wiki Link 的可讀 title syntax", () => {
  assert.equal(
    printBodyContent("# 搜索票\n依 [[令狀原則]]，另參 `[[literal]]`。"),
    "依 [[令狀原則]]，另參 `[[literal]]`。",
  );
});
