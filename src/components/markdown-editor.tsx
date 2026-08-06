"use client";

import { useEffect, useRef } from "react";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorState } from "@codemirror/state";
import { basicSetup, EditorView } from "codemirror";

/**
 * 左欄的 Markdown 原始語法編輯器。
 *
 * 這個元件只在桌機動態載入 —— 手機與 iPad 是唯讀的，不該為了不會用到的功能
 * 下載整包 CodeMirror。
 */
export function MarkdownEditor({
  initialValue,
  onChange,
}: {
  initialValue: string;
  onChange: (value: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  // 用 ref 存最新的 onChange，這樣 callback 換了也不用重建整個 editor。
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

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
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          theme,
        ],
      }),
    });

    view.focus();

    return () => view.destroy();
    // 只在掛載時建一次。切換筆記時外層會用 key 強制重新掛載，所以不需要同步 initialValue。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="h-full overflow-auto" />;
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
