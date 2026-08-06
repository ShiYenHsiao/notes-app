"use client";

import { useEffect, useRef } from "react";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorState, Prec } from "@codemirror/state";
import { basicSetup, EditorView } from "codemirror";
import { keymap } from "@codemirror/view";

/** 讓外層（工具列、上傳流程、快捷鍵）能操作編輯器內容。 */
export type EditorApi = {
  insertAtCursor(text: string): void;
  /** 找到第一個 needle 換成 replacement。找不到就什麼都不做。 */
  replaceFirst(needle: string, replacement: string): void;
  /** 把選取範圍包起來；沒選東西就插入標記並把游標放中間。 */
  wrapSelection(before: string, after?: string): void;
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
  apiRef,
}: {
  initialValue: string;
  onChange: (value: string) => void;
  /** 使用者貼上或拖進來的檔案。 */
  onFiles?: (files: File[]) => void;
  /** 按下 Cmd+S。平常已自動存檔，這是求心安用的。 */
  onSaveRequest?: () => void;
  apiRef?: React.RefObject<EditorApi | null>;
}) {
  const host = useRef<HTMLDivElement>(null);

  // 用 ref 存最新的 callback，這樣它們換了也不用重建整個 editor。
  const onChangeRef = useRef(onChange);
  const onFilesRef = useRef(onFiles);
  const onSaveRef = useRef(onSaveRequest);
  useEffect(() => {
    onChangeRef.current = onChange;
    onFilesRef.current = onFiles;
    onSaveRef.current = onSaveRequest;
  }, [onChange, onFiles, onSaveRequest]);

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
          markdown({ codeLanguages: languages }),
          EditorView.lineWrapping,

          // Prec.high 才蓋得過 basicSetup 自己的綁定（例如 Mod-i）。
          Prec.high(
            keymap.of([
              { key: "Mod-b", run: (view) => wrapSelection(view, "**") },
              { key: "Mod-i", run: (view) => wrapSelection(view, "*") },
              { key: "Mod-k", run: (view) => insertLink(view) },
              { key: "Mod-Shift-c", run: (view) => insertBlock(view, "```\n\n```") },
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

function toggleLinePrefix(view: EditorView, prefix: string): boolean {
  const { from, to } = view.state.selection.main;
  const firstLine = view.state.doc.lineAt(from);
  const lastLine = view.state.doc.lineAt(to);

  const changes = [];
  // 整段都已經有前綴時才是「移除」，否則一律補上 —— 混合狀態下補齊比較符合預期。
  let allPrefixed = true;
  for (let n = firstLine.number; n <= lastLine.number; n += 1) {
    if (!view.state.doc.line(n).text.startsWith(prefix)) {
      allPrefixed = false;
      break;
    }
  }

  for (let n = firstLine.number; n <= lastLine.number; n += 1) {
    const line = view.state.doc.line(n);
    if (allPrefixed) {
      changes.push({ from: line.from, to: line.from + prefix.length, insert: "" });
    } else if (!line.text.startsWith(prefix)) {
      changes.push({ from: line.from, to: line.from, insert: prefix });
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
});
