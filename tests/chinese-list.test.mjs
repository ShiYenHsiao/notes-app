/**
 * 中文條列的辨識與遞增。
 *
 *   node --test "tests/*.test.mjs"
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fromChineseNumeral,
  nextChineseListMarker,
  parseChineseListMarker,
  toChineseNumeral,
} from "../src/lib/chinese-list.ts";

// ---------------------------------------------------------------- 數字轉換

test("中文數字轉阿拉伯數字", () => {
  assert.equal(fromChineseNumeral("一"), 1);
  assert.equal(fromChineseNumeral("九"), 9);
  assert.equal(fromChineseNumeral("十"), 10);
  assert.equal(fromChineseNumeral("十一"), 11);
  assert.equal(fromChineseNumeral("十九"), 19);
  assert.equal(fromChineseNumeral("二十"), 20);
  assert.equal(fromChineseNumeral("二十一"), 21);
  assert.equal(fromChineseNumeral("九十九"), 99);
});

test("無法辨識的中文數字回傳 null", () => {
  assert.equal(fromChineseNumeral(""), null);
  assert.equal(fromChineseNumeral("零"), null);
  assert.equal(fromChineseNumeral("十十"), null);
  assert.equal(fromChineseNumeral("一二"), null);
  assert.equal(fromChineseNumeral("二十十"), null);
});

test("阿拉伯數字轉中文數字", () => {
  assert.equal(toChineseNumeral(1), "一");
  assert.equal(toChineseNumeral(10), "十");
  assert.equal(toChineseNumeral(11), "十一");
  assert.equal(toChineseNumeral(20), "二十");
  assert.equal(toChineseNumeral(21), "二十一");
  assert.equal(toChineseNumeral(99), "九十九");
});

test("超出支援範圍回傳 null", () => {
  assert.equal(toChineseNumeral(0), null);
  assert.equal(toChineseNumeral(100), null);
  assert.equal(toChineseNumeral(1.5), null);
});

test("轉換可以來回對應", () => {
  for (let n = 1; n <= 99; n += 1) {
    assert.equal(fromChineseNumeral(toChineseNumeral(n)), n, `第 ${n} 項`);
  }
});

// ---------------------------------------------------------------- 標記辨識

test("辨識頓號形式", () => {
  const marker = parseChineseListMarker("一、意義");
  assert.deepEqual(marker, {
    indent: "",
    kind: "dun",
    value: 1,
    spacing: "",
    content: "意義",
  });
});

test("辨識括號形式", () => {
  const marker = parseChineseListMarker("（一）構成要件");
  assert.equal(marker?.kind, "paren");
  assert.equal(marker?.value, 1);
  assert.equal(marker?.content, "構成要件");
});

test("保留行首縮排與標記後的空白", () => {
  const marker = parseChineseListMarker("  （二） 主觀要件");
  assert.equal(marker?.indent, "  ");
  assert.equal(marker?.spacing, " ");
  assert.equal(marker?.content, "主觀要件");
});

test("空項目也辨識得出來，content 為空", () => {
  assert.equal(parseChineseListMarker("三、")?.content, "");
  assert.equal(parseChineseListMarker("（三）")?.content, "");
});

test("不是中文條列的行回傳 null", () => {
  assert.equal(parseChineseListMarker("一般段落"), null);
  assert.equal(parseChineseListMarker("- 項目清單"), null);
  assert.equal(parseChineseListMarker("1. 有序清單"), null);
  assert.equal(parseChineseListMarker("（甲）非數字"), null);
  assert.equal(parseChineseListMarker("一二、壞掉的數字"), null);
  // 半形括號不算，避免誤判程式碼或英文內容
  assert.equal(parseChineseListMarker("(一) 半形"), null);
});

// ---------------------------------------------------------------- 遞增

test("頓號形式遞增", () => {
  const marker = parseChineseListMarker("一、意義");
  assert.equal(nextChineseListMarker(marker), "二、");
});

test("括號形式遞增", () => {
  const marker = parseChineseListMarker("（九）第九點");
  assert.equal(nextChineseListMarker(marker), "（十）");
});

test("跨十位遞增", () => {
  assert.equal(nextChineseListMarker(parseChineseListMarker("十、甲")), "十一、");
  assert.equal(nextChineseListMarker(parseChineseListMarker("十九、甲")), "二十、");
});

test("遞增時保留縮排與空白", () => {
  const marker = parseChineseListMarker("　　（一） 內容");
  assert.equal(nextChineseListMarker(marker), "　　（二） ");
});

test("超出支援範圍就不接手", () => {
  assert.equal(nextChineseListMarker(parseChineseListMarker("九十九、甲")), null);
});
