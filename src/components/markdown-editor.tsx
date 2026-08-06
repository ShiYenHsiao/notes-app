"use client";

import { useEffect, useRef } from "react";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { indentLess, indentMore } from "@codemirror/commands";
import { autocompletion } from "@codemirror/autocomplete";
import { indentUnit } from "@codemirror/language";
import { EditorState, Prec } from "@codemirror/state";
import { basicSetup, EditorView } from "codemirror";
import { keymap } from "@codemirror/view";

import { nextChineseListMarker, parseChineseListMarker } from "@/lib/chinese-list";
import {
  classifyIndent,
  INDENT_UNIT,
  isListPrefix,
  needsBlankLineBeforeList,
} from "@/lib/indent-rules";
import { slashCommands } from "@/lib/slash-commands";

/** 螢光筆的顏色代號。省略代表黃色，寫進 Markdown 時不加後綴。 */
export type HighlightColor = "g" | "p" | "b";

/** 讓外層（工具列、上傳流程、快捷鍵）能操作編輯器內容。 */
export type EditorApi = {
  insertAtCursor(text: string): void;
  /** 找到第一個 needle 換成 replacement。找不到就什麼都不做。 */
  replaceFirst(needle: string, replacement: string): void;
  /** 把選取範圍包起來；沒選東西就插入標記並把游標放中間。 */
  wrapSelection(before: string, after?: string): void;
  /** 插入連結語法，游標落在網址的括號裡。 */
  insertLink(): void;
  /** 套用螢光筆。不給顏色就是預設的黃色。 */
  applyHighlight(color?: HighlightColor): void;
  /** 在選取範圍涵蓋的每一行前面加上前綴，已經有的話則移除（切換）。 */
  toggleLinePrefix(prefix: string): void;
  /** 在游標所在行的下方插入一個區塊。 */
  insertBlock(text: string): void;
  focus(): void;
};

export function MarkdownEditor({
  initialValue,
  onChange,
  onFiles,
  onSaveRequest,
  onIndentBlocked,
  apiRef,
}: {
  initialValue: string;
  onChange: (value: string) => void;
  /** 使用者貼上或拖進來的檔案。 */
  onFiles?: (files: File[]) => void;
  /** 按下 Cmd+S。平常已自動存檔，這是求心安用的。 */
  onSaveRequest?: () => void;
  /** 一般段落的 Tab 被擋下來時通知外層顯示提示。 */
  onIndentBlocked?: () => void;
  apiRef?: React.RefObject<EditorApi | null>;
}) {
  const host = useRef<HTMLDivElement>(null);

  // 用 ref 存最新的 callback，這樣它們換了也不用重建整個 editor。
  const onChangeRef = useRef(onChange);
  const onFilesRef = useRef(onFiles);
  const onSaveRef = useRef(onSaveRequest);
  const onIndentBlockedRef = useRef(onIndentBlocked);
  useEffect(() => {
    onChangeRef.current = onChange;
    onFilesRef.current = onFiles;
    onSaveRef.current = onSaveRequest;
    onIndentBlockedRef.current = onIndentBlocked;
  }, [onChange, onFiles, onSaveRequest, onIndentBlocked]);

  useEffect(() => {
    const element = host.current;
    if (!element) {
      return;
    }

    const view = new EditorView({
      parent: element,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          basicSetup,
          // markdown() 預設就會掛上 markdownKeymap，Enter 會自動延續清單與編號，
          // 在空的清單項目上再按一次 Enter 則跳出清單。
          markdown({ codeLanguages: languages }),
          EditorView.lineWrapping,

          // 巢狀清單一層兩格。四格在中文行裡縮得太兇，一層就吃掉半行。
          indentUnit.of(INDENT_UNIT),

          /*
           * 斜線命令。
           *
           * 用 override 明確指定唯一的來源。原本想改用 EditorState.languageData
           * 加一個來源（理論上比較不侵入），但實測完全不觸發，連 Ctrl-Space 也叫不出來。
           * Markdown 本身沒有其他自動完成來源，override 掉沒有任何損失。
           */
          autocompletion({ override: [slashCommands] }),

          /*
           * 中文條列的 Enter。
           *
           * 必須是 Prec.highest 才排在 markdown() 的 markdownKeymap（Prec.high）前面，
           * 否則官方那支會先把 Enter 吃掉。不是中文條列時回傳 false 交還給它，
           * 所以 Markdown 清單的行為完全不受影響。
           *
           * 這個 keymap 排在 autocompletion() 後面，選單開著時 acceptCompletion
           * 仍然先接到 Enter。
           */
          Prec.highest(keymap.of([{ key: "Enter", run: continueChineseList }])),

          // Prec.high 才蓋得過 basicSetup 自己的綁定（例如 Mod-i）。
          Prec.high(
            keymap.of([
              /*
               * Tab 縮排、Shift-Tab 反縮排。
               *
               * 綁走 Tab 會擋掉「用 Tab 跳出編輯器」這個無障礙出口，但 CodeMirror
               * 內建了替代路徑：按 Escape 之後兩秒內按 Tab 會移出焦點而不是縮排。
               * 所以這裡不需要自己處理。
               */
              {
                key: "Tab",
                run: (view) => smartIndent(view, () => onIndentBlockedRef.current?.()),
                shift: indentLess,
              },

              { key: "Mod-b", run: (view) => wrapSelection(view, "**") },
              { key: "Mod-i", run: (view) => wrapSelection(view, "*") },
              { key: "Mod-k", run: (view) => insertLink(view) },
              { key: "Mod-Shift-c", run: (view) => insertBlock(view, "```\n\n```") },
              { key: "Mod-Shift-h", run: (view) => applyHighlight(view) },
              {
                key: "Mod-s",
                run: () => {
                  onSaveRef.current?.();
                  return true; // 攔下瀏覽器的「儲存網頁」
                },
              },
            ]),
          ),

          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),

          /*
           * 手動打出清單標記時，如果上一行是普通段落就順手補一行空行。
           *
           * 補插與空白鍵本身放在同一個 transaction，Undo 才會一次退回去。
           */
          EditorView.inputHandler.of((view, from, to, text) => {
            if (text !== " ") {
              return false;
            }

            const line = view.state.doc.lineAt(from);
            const typed = line.text.slice(0, from - line.from);

            // 剛打完的正好是清單標記本身
            if (!/^[ \t]*(?:[-*+]|\d+[.)])$/.test(typed)) {
              return false;
            }

            const previous = line.number > 1 ? view.state.doc.line(line.number - 1).text : null;
            if (!needsBlankLineBeforeList(previous)) {
              return false;
            }

            view.dispatch({
              changes: [
                { from: line.from, insert: "\n" },
                { from, to, insert: " " },
              ],
              // 新文件裡游標往後挪兩格：一個換行、一個空白
              selection: { anchor: to + 2 },
              userEvent: "input.type",
            });
            return true;
          }),

          EditorView.domEventHandlers({
            paste(event) {
              const files = Array.from(event.clipboardData?.files ?? []);
              if (files.length === 0) {
                return false; // 一般文字貼上交還給 CodeMirror 預設處理
              }
              event.preventDefault();
              onFilesRef.current?.(files);
              return true;
            },
            drop(event, view) {
              const files = Array.from(event.dataTransfer?.files ?? []);
              if (files.length === 0) {
                return false;
              }
              event.preventDefault();
              // 先把游標移到放下的位置，圖片才會插在使用者指的地方。
              const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
              if (position != null) {
                view.dispatch({ selection: { anchor: position } });
              }
              onFilesRef.current?.(files);
              return true;
            },
          }),

          theme,
        ],
      }),
    });

    view.focus();

    if (apiRef) {
      apiRef.current = {
        insertAtCursor(text) {
          const { from, to } = view.state.selection.main;
          view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length },
          });
          view.focus();
        },
        replaceFirst(needle, replacement) {
          const index = view.state.doc.toString().indexOf(needle);
          if (index === -1) {
            return;
          }
          view.dispatch({
            changes: { from: index, to: index + needle.length, insert: replacement },
          });
        },
        wrapSelection(before, after) {
          wrapSelection(view, before, after);
        },
        insertLink() {
          insertLink(view);
        },
        applyHighlight(color) {
          applyHighlight(view, color);
        },
        toggleLinePrefix(prefix) {
          toggleLinePrefix(view, prefix);
        },
        insertBlock(text) {
          insertBlock(view, text);
        },
        focus() {
          view.focus();
        },
      };
    }

    return () => {
      if (apiRef) {
        apiRef.current = null;
      }
      view.destroy();
    };
    // 只在掛載時建一次。切換筆記時外層會用 key 強制重新掛載，所以不需要同步 initialValue。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="h-full overflow-auto" />;
}

// ---------------------------------------------------------------- 編輯操作
// 這些是給 keymap 和 EditorApi 共用的，所以放在元件外面，統一收 view 當參數。

/**
 * 中文條列的 Enter：`一、` → `二、`，`（一）` → `（二）`。
 *
 * 空項目上按 Enter 就把標記清掉並跳出，跟 Markdown 清單的直覺一致。
 * 不是中文條列、游標不在行尾、或有選取範圍時一律回傳 false，交還給官方的
 * markdownKeymap 處理，避免干擾原本的清單行為。
 */
function continueChineseList(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;

  if (!range.empty) {
    return false;
  }

  const line = state.doc.lineAt(range.head);

  // 只在行尾接手。游標在中間時使用者要的是斷行，不是新增下一項。
  if (range.head !== line.to) {
    return false;
  }

  const marker = parseChineseListMarker(line.text);
  if (marker === null) {
    return false;
  }

  // 空項目：把整行的標記清掉，等於跳出條列
  if (marker.content.trim() === "") {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: marker.indent },
      selection: { anchor: line.from + marker.indent.length },
      userEvent: "input",
    });
    return true;
  }

  const next = nextChineseListMarker(marker);
  if (next === null) {
    return false; // 超出支援範圍就當作一般換行
  }

  const insert = `\n${next}`;
  view.dispatch({
    changes: { from: range.head, insert },
    selection: { anchor: range.head + insert.length },
    userEvent: "input",
  });
  return true;
}

/**
 * Tab 的行為。判斷規則在 lib/indent-rules.ts，這裡只負責接上 CodeMirror。
 * 真的要寫程式碼請用 ``` 圍欄式區塊，那個完全不受影響。
 */
function smartIndent(view: EditorView, onBlocked: () => void): boolean {
  const { state } = view;
  const range = state.selection.main;

  const decision = classifyIndent({
    lineText: state.doc.lineAt(range.head).text,
    multiLine:
      !range.empty &&
      state.doc.lineAt(range.from).number !== state.doc.lineAt(range.to).number,
  });

  if (decision === "blocked") {
    onBlocked();
    return true; // 攔下來，不要讓它靜默變成程式碼區塊
  }

  return indentMore(view);
}

function wrapSelection(view: EditorView, before: string, after = before): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);

  view.dispatch({
    changes: { from, to, insert: `${before}${selected}${after}` },
    // 沒選東西就把游標放在中間，讓人直接往下打。
    selection: selected
      ? { anchor: from, head: from + before.length + selected.length + after.length }
      : { anchor: from + before.length },
  });
  view.focus();
  return true;
}

/**
 * 螢光筆。
 *
 * 已經被標起來的再按一次會取消 —— 跟粗體斜體那些的直覺一致，
 * 不然想改顏色還得先手動刪掉 `==`。
 */
function applyHighlight(view: EditorView, color?: HighlightColor): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);

  // 往外多看幾個字，判斷選取範圍是不是正好被 == == 包著
  const before = view.state.sliceDoc(Math.max(0, from - 2), from);
  const after = view.state.sliceDoc(to, Math.min(view.state.doc.length, to + 5));
  const closing = after.match(/^==(?:\{[gpb]\})?/);

  if (before === "==" && closing) {
    view.dispatch({
      changes: [
        { from: from - 2, to: from, insert: "" },
        { from: to, to: to + closing[0].length, insert: "" },
      ],
      selection: { anchor: from - 2, head: to - 2 },
    });
    view.focus();
    return true;
  }

  const suffix = color ? `{${color}}` : "";
  const text = `==${selected}==${suffix}`;

  view.dispatch({
    changes: { from, to, insert: text },
    // 沒選東西就把游標放中間等著打字
    selection: selected
      ? { anchor: from, head: from + text.length }
      : { anchor: from + 2 },
  });
  view.focus();
  return true;
}

function insertLink(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);

  // 有選字就當成連結文字，游標跳到括號裡等著貼網址。
  const text = `[${selected}]()`;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length - 1 },
  });
  view.focus();
  return true;
}

/**
 * 行首那些互斥的區塊標記。
 *
 * 有這張表，套用新前綴時才能先把舊的拿掉 —— 少了它，在項目清單上按編號清單
 * 會得到 `1. - 內容` 這種疊加結果。
 */
const LINE_PREFIX_PATTERN = /^(#{1,6} |> |- \[[ xX]\] |[-*+] |\d+\. )/;

function toggleLinePrefix(view: EditorView, prefix: string): boolean {
  const { from, to } = view.state.selection.main;
  const firstLine = view.state.doc.lineAt(from);
  const lastLine = view.state.doc.lineAt(to);

  // 整段都已經是這個前綴時才是「移除」，否則一律套用 ——
  // 混合狀態下統一成同一種比較符合預期。
  let allPrefixed = true;
  for (let n = firstLine.number; n <= lastLine.number; n += 1) {
    if (!view.state.doc.line(n).text.startsWith(prefix)) {
      allPrefixed = false;
      break;
    }
  }

  const changes: { from: number; to?: number; insert: string }[] = [];

  /*
   * 把普通段落變成清單時補一行空行。
   * 跟前綴的改動放在同一個 transaction，Undo 才會一次退回去。
   * 插入點與下面第一筆改動相鄰而不重疊，所以必須排在前面。
   */
  if (!allPrefixed && isListPrefix(prefix)) {
    const previous =
      firstLine.number > 1 ? view.state.doc.line(firstLine.number - 1).text : null;
    if (needsBlankLineBeforeList(previous)) {
      changes.push({ from: firstLine.from, insert: "\n" });
    }
  }

  for (let n = firstLine.number; n <= lastLine.number; n += 1) {
    const line = view.state.doc.line(n);
    const existing = line.text.match(LINE_PREFIX_PATTERN)?.[0] ?? "";
    const replacement = allPrefixed ? "" : prefix;

    if (existing !== replacement) {
      changes.push({
        from: line.from,
        to: line.from + existing.length,
        insert: replacement,
      });
    }
  }

  if (changes.length > 0) {
    view.dispatch({ changes });
  }
  view.focus();
  return true;
}

function insertBlock(view: EditorView, text: string): boolean {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);

  // 空行就地插入，否則另起一行，避免把現有內容切成兩半。
  const insertAt = line.text.trim() ? line.to : line.from;
  const payload = line.text.trim() ? `\n${text}` : text;

  view.dispatch({
    changes: { from: insertAt, to: insertAt, insert: payload },
    // 游標落在區塊中間那一行
    selection: { anchor: insertAt + payload.indexOf("\n\n") + 2 },
  });
  view.focus();
  return true;
}

/** 讓 CodeMirror 用主題的 CSS 變數，深淺色才會跟著換。 */
const theme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
    fontSize: "14px",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-content": {
    fontFamily: "var(--font-mono, ui-monospace), monospace",
    padding: "1.5rem 0",
    lineHeight: "1.7",
  },
  ".cm-line": {
    padding: "0 1.5rem",
  },
  ".cm-gutters": {
    backgroundColor: "var(--surface)",
    color: "var(--ink-muted)",
    border: "none",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--accent) 6%, transparent)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--accent)",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--accent)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--accent-soft)",
  },

  // 斜線命令的選單。預設是系統灰底，跟整體不搭。
  ".cm-tooltip.cm-tooltip-autocomplete": {
    border: "1px solid var(--line)",
    borderRadius: "3px",
    backgroundColor: "var(--surface)",
    boxShadow: "0 12px 32px rgba(55, 53, 47, 0.14)",
  },
  ".cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--font-sans)",
    fontSize: "12px",
    maxHeight: "18em",
  },
  ".cm-tooltip-autocomplete > ul > li": {
    display: "flex",
    alignItems: "center",
    gap: "0.5em",
    padding: "5px 10px",
    color: "var(--ink)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--accent-soft)",
    color: "var(--accent)",
  },
  ".cm-completionDetail": {
    marginLeft: "auto",
    color: "var(--ink-muted)",
    fontFamily: "var(--font-mono)",
    fontSize: "10px",
    fontStyle: "normal",
  },
  // 選單左側的類型圖示對這個情境沒有意義，全部同一類
  ".cm-completionIcon": {
    display: "none",
  },
});
