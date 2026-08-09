import assert from "node:assert/strict";
import test from "node:test";

import { CompletionContext } from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";

import { SLASH_COMMANDS, slashCommands } from "../src/lib/slash-commands.ts";

function complete(doc, options = {}) {
  const pos = options.pos ?? doc.length;
  const state = EditorState.create({
    doc,
    selection: options.selection ?? { anchor: pos },
    extensions: [markdown()],
  });
  return slashCommands(new CompletionContext(state, pos, options.explicit ?? false));
}

test("/ 在行首會觸發 Slash Command，from 包含 trigger", () => {
  const result = complete("/");
  assert.ok(result);
  assert.equal(result.from, 0);
  assert.equal(result.options.length, SLASH_COMMANDS.length);
});

test("英文 command 與 heading 別名都存在於 completion label", () => {
  const result = complete("/heading");
  assert.ok(result);
  assert.equal(result.from, 0);
  assert.deepEqual(
    result.options
      .filter((option) => option.label.includes("heading"))
      .map((option) => option.displayLabel),
    ["標題 1", "標題 2", "標題 3"],
  );
});

test("中文 query 有對應的搜尋別名", () => {
  const result = complete("/重點");
  assert.ok(result);
  assert.deepEqual(
    result.options
      .filter((option) => option.label.includes("重點"))
      .map((option) => option.displayLabel),
    ["重點 Callout"],
  );

  assert.ok(result.validFor instanceof RegExp);
  assert.equal(result.validFor.test("/實務"), true);
  assert.equal(result.validFor.test("/易錯"), true);
  assert.equal(result.validFor.test("/理解"), true);
});

test("H2 command 的 snippet 會取代 trigger text", () => {
  const item = SLASH_COMMANDS.find((command) => command.key === "h2");
  assert.ok(item);
  assert.equal(item.snippet, "## ${}");
  assert.equal(complete("/h2")?.from, 0);
});

test("正式四種法律筆記 Callout 與圖片命令都存在", () => {
  const snippets = new Map(SLASH_COMMANDS.map((command) => [command.key, command.snippet]));
  assert.equal(snippets.get("key"), "> [!KEY]\n> ${}");
  assert.equal(snippets.get("practice"), "> [!PRACTICE]\n> ${}");
  assert.equal(snippets.get("pitfall"), "> [!PITFALL]\n> ${}");
  assert.equal(snippets.get("insight"), "> [!INSIGHT]\n> ${}");
  assert.equal(snippets.get("image"), "![${說明}](${網址})");
});

test("只在行首或空白後觸發，URL 中不觸發", () => {
  assert.ok(complete("一般文字 /"));
  assert.equal(complete("一般文字/"), null);
  assert.equal(complete("https://"), null);
  assert.equal(complete("https://example.com/"), null);
});

test("inline code、fenced code 與 indented code 不觸發", () => {
  assert.equal(complete("`/`", { pos: 2 }), null);
  assert.equal(complete("```md\n/\n```", { pos: 7 }), null);
  assert.equal(complete("    /"), null);
});

test("非空選取範圍不觸發", () => {
  assert.equal(complete("/", { selection: { anchor: 0, head: 1 } }), null);
});
