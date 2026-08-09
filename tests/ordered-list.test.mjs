/**
 * 有序清單 Enter 的 runtime 測試。
 *
 * 直接建立 CodeMirror EditorState，先跑 NEXUM fallback，再跑官方
 * insertNewlineContinueMarkup，對齊實際編輯器的 keymap 執行順序。
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { insertNewlineContinueMarkup, markdown } from "@codemirror/lang-markdown";
import { history, undo } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";

import {
  continueLooseOrderedList,
  parseLooseOrderedListItem,
} from "../src/lib/ordered-list.ts";

function editor(doc) {
  let state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [history(), markdown()],
  });

  return {
    get state() {
      return state;
    },
    dispatch(transaction) {
      state = transaction.state;
    },
  };
}

function pressEnter(doc) {
  const target = editor(doc);
  const fallback = continueLooseOrderedList(target);
  const official = fallback ? false : insertNewlineContinueMarkup(target);
  return { target, fallback, official, doc: target.state.doc.toString() };
}

test("標準 1. 加半形空格仍由官方 Markdown keymap 延續", () => {
  const result = pressEnter("1. 第一點");
  assert.equal(result.fallback, false);
  assert.equal(result.official, true);
  assert.equal(result.doc, "1. 第一點\n2. ");
});

test("省略句點後空白的中文項目會正規化並延續", () => {
  const result = pressEnter("1.第一點");
  assert.equal(result.fallback, true);
  assert.equal(result.doc, "1. 第一點\n2. ");
});

test("全形句點會正規化成 CommonMark marker", () => {
  assert.equal(pressEnter("1．第一點").doc, "1. 第一點\n2. ");
});

test("全形數字會正規化成 CommonMark marker", () => {
  assert.equal(pressEnter("１. 第一點").doc, "1. 第一點\n2. ");
});

test("全形數字與全形句點會一起正規化", () => {
  const result = pressEnter("１．第一點");
  assert.equal(result.doc, "1. 第一點\n2. ");
  assert.match(syntaxTree(result.target.state).toString(), /OrderedList/);
});

test("全形空格會正規化成 CommonMark 所需的半形空格", () => {
  assert.equal(pressEnter("1.　第一點").doc, "1. 第一點\n2. ");
  assert.equal(pressEnter("１．　第一點").doc, "1. 第一點\n2. ");
});

test("一般中文段落、版本號與小數不會被 fallback 接手", () => {
  for (const input of ["一般中文段落", "版本 1.2 中文", "1.5公斤", "2026．法律"]) {
    assert.equal(parseLooseOrderedListItem(input), null, input);
    assert.equal(pressEnter(input).fallback, false, input);
  }
});

test("最多三格縮排的 nested list 會保留縮排", () => {
  assert.equal(pressEnter("  １．第一點").doc, "  1. 第一點\n  2. ");
  assert.equal(pressEnter("   1.第一點").doc, "   1. 第一點\n   2. ");
});

test("四格縮排維持 CommonMark indented code，不誤判成清單", () => {
  const result = pressEnter("    1.第一點");
  assert.equal(result.fallback, false);
  assert.equal(result.official, false);
});

test("空項目按 Enter 退出寬容清單", () => {
  assert.equal(pressEnter("1.").doc, "");
  assert.equal(pressEnter("  １．　").doc, "  ");
});

test("fallback 的一次 Enter 可以一次 undo", () => {
  const { target, doc } = pressEnter("１．第一點");
  assert.equal(doc, "1. 第一點\n2. ");
  assert.equal(undo(target), true);
  assert.equal(target.state.doc.toString(), "１．第一點");
});

test("游標不在行尾或有選取範圍時不接手", () => {
  let state = EditorState.create({ doc: "1.第一點", selection: { anchor: 2 } });
  assert.equal(continueLooseOrderedList({ state, dispatch: (tr) => (state = tr.state) }), false);

  state = EditorState.create({ doc: "1.第一點", selection: { anchor: 0, head: 2 } });
  assert.equal(continueLooseOrderedList({ state, dispatch: (tr) => (state = tr.state) }), false);
});
