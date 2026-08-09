"use client";

import { useEffect, useRef } from "react";
import { markdown } from "@codemirror/lang-markdown";
import { redo, undo } from "@codemirror/commands";
import { languages } from "@codemirror/language-data";
import {
  autocompletion,
  startCompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { HighlightStyle, indentUnit, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import {
  EditorState,
  Prec,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Range,
  type Text,
} from "@codemirror/state";
import { basicSetup, EditorView } from "codemirror";
import {
  Decoration,
  keymap,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

import { searchKnowledgeNotes } from "@/lib/knowledge-client";
import {
  hardBreakSuffix,
  nextChineseListMarker,
  parseChineseListMarker,
} from "@/lib/chinese-list";
import {
  blankLineColumns,
  GUIDE_STEP,
  guideCount,
  indentUnitFor,
  INDENT_UNIT,
  isListPrefix,
  leadingColumns,
  needsBlankLineBeforeList,
  outdentLength,
} from "@/lib/indent-rules";
import { calloutBlock, DEFAULT_CALLOUT } from "@/lib/callouts";
import { continueLooseOrderedList } from "@/lib/ordered-list";
import { slashCommands } from "@/lib/slash-commands";
import {
  parseWikiLinks,
  rankWikiCandidates,
  wikiCompletionInsertion,
  wikiCompletionQuery,
  type WikiLinkResolution,
  type WikiNoteCandidate,
} from "@/lib/wiki-links";
import { isWikiCompletionInsideCode } from "@/lib/wiki-completion";

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
  /** 復原／重做。工具列用，鍵盤的 ⌘Z 由 CodeMirror 自己處理。 */
  undo(): void;
  redo(): void;
  /** 捲到某一行並把游標放過去。大綱面板用，行號從 1 起算。 */
  revealLine(line: number): void;
  /** 捲動容器本身。兩欄捲動同步要掛事件、也要讀寫 scrollTop。 */
  scroller(): HTMLElement;
  /**
   * 某一行在捲動容器裡的高度位置。行號從 1 起算。
   *
   * 那一行還沒被渲染出來時回傳 null —— CodeMirror 只渲染視窗附近的行。
   */
  lineTop(line: number): number | null;
  focus(): void;
};

export function MarkdownEditor({
  initialValue,
  onChange,
  onFiles,
  onSaveRequest,
  onReady,
  apiRef,
  wikiLinks,
  searchWikiLinks = searchKnowledgeNotes,
}: {
  initialValue: string;
  onChange: (value: string) => void;
  /** 使用者貼上或拖進來的檔案。 */
  onFiles?: (files: File[]) => void;
  /** 按下 Cmd+S。平常已自動存檔，這是求心安用的。 */
  onSaveRequest?: () => void;
  /** 編輯器掛好了。apiRef 要到這時候才有東西，捲動同步靠它決定何時接事件。 */
  onReady?: () => void;
  apiRef?: React.RefObject<EditorApi | null>;
  wikiLinks: WikiLinkResolution[];
  searchWikiLinks?: (query: string, limit: number) => Promise<WikiNoteCandidate[]>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editorView = useRef<EditorView | null>(null);

  // 用 ref 存最新的 callback，這樣它們換了也不用重建整個 editor。
  const onChangeRef = useRef(onChange);
  const onFilesRef = useRef(onFiles);
  const onSaveRef = useRef(onSaveRequest);
  const onReadyRef = useRef(onReady);
  const searchWikiLinksRef = useRef(searchWikiLinks);
  const wikiSearchAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    onChangeRef.current = onChange;
    onFilesRef.current = onFiles;
    onSaveRef.current = onSaveRequest;
    onReadyRef.current = onReady;
    searchWikiLinksRef.current =
      searchWikiLinks === searchKnowledgeNotes
        ? (query, limit) => {
            wikiSearchAbort.current?.abort();
            const controller = new AbortController();
            wikiSearchAbort.current = controller;
            return searchKnowledgeNotes(query, limit, controller.signal);
          }
        : searchWikiLinks;

    return () => wikiSearchAbort.current?.abort();
  }, [onChange, onFiles, onSaveRequest, onReady, searchWikiLinks]);

  useEffect(() => {
    const element = host.current;
    if (!element) {
      return;
    }

    let wikiCompletionTimer: ReturnType<typeof setTimeout> | null = null;
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

          // Prec.high 才蓋得過 basicSetup 自己那份預設配色
          Prec.high(syntaxHighlighting(syntax)),

          indentGuides,
          academicDecorations,

          /*
           * 斜線命令。
           *
           * 用 override 明確指定這個編輯器的兩個來源。原本想改用 EditorState.languageData
           * 加一個來源（理論上比較不侵入），但實測完全不觸發，連 Ctrl-Space 也叫不出來。
           * Markdown 本身沒有其他自動完成來源，保留 Slash 與 Wiki Link 即可。
           */
          autocompletion({
            override: [
              slashCommands,
              (context) => wikiLinkCompletions(context, searchWikiLinksRef.current),
            ],
          }),

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
          Prec.highest(
            keymap.of([
              { key: "Enter", run: continueChineseList },
              /*
               * 官方 keymap 只接 syntax tree 已辨識的 CommonMark list。中文輸入法常留下
               * 全形數字／句點／空格，或省略句點後空白；這支只補那些變體，標準語法
               * 回傳 false，仍由官方處理完整的 list renumbering。
               */
              { key: "Enter", run: continueLooseOrderedList },
            ]),
          ),

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
              { key: "Tab", run: smartIndent, shift: smartOutdent },

              { key: "Mod-b", run: (view) => wrapSelection(view, "**") },
              { key: "Mod-i", run: (view) => wrapSelection(view, "*") },
              { key: "Mod-k", run: (view) => insertLink(view) },
              { key: "Mod-Shift-c", run: (view) => insertBlock(view, "```\n\n```") },
              // 備註／重點框。法律筆記標記考點的頻率遠高於寫程式碼，所以它有快捷鍵。
              { key: "Mod-Shift-m", run: (view) => insertBlock(view, calloutBlock(DEFAULT_CALLOUT)) },
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

              /*
               * activateOnTyping 只認 input.type；貼上、部分瀏覽器與輸入法走的 transaction
               * 不會自動查 completion source。只要這次真的插入過斜線，就在 transaction
               * 完成後用官方 command 查一次；位置是否合法仍由各 source 判斷。
               */
              let insertedSlash = false;
              let typedInput = false;
              for (const transaction of update.transactions) {
                if (!transaction.isUserEvent("input")) {
                  continue;
                }
                typedInput = true;
                transaction.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
                  if (inserted.toString().includes("/")) {
                    insertedSlash = true;
                  }
                });
              }
              if (insertedSlash) {
                queueMicrotask(() => startCompletion(update.view));
              }

              /*
               * async Wiki source 在 query 改變時要重新查；CodeMirror 會丟掉舊 Promise，
               * 這裡再做 180ms debounce，避免中文輸入每個組字 transaction 都打到 server。
               */
              if (typedInput && !update.view.composing) {
                const head = update.state.selection.main.head;
                const line = update.state.doc.lineAt(head);
                const query = wikiCompletionQuery(update.state.sliceDoc(line.from, head));
                if (query) {
                  if (wikiCompletionTimer !== null) {
                    clearTimeout(wikiCompletionTimer);
                  }
                  wikiCompletionTimer = setTimeout(() => {
                    wikiCompletionTimer = null;
                    startCompletion(update.view);
                  }, 180);
                }
              }
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
          wikiResolutionField,
        ],
      }),
    });
    editorView.current = view;

    const animationWindow = view.dom.ownerDocument.defaultView ?? window;
    let destroyed = false;
    let revealFrame: number | null = null;

    /*
     * EditorView 建構時會自己 requestMeasure，但那次可能早於外層 flex 尺寸與主題 CSS
     * 穩定。下一個 paint 再用官方 API 排一次，補上被 CodeMirror 的 ResizeObserver
     * 初始防抖略過的那次幾何變化。字體載入與之後的容器 resize 仍交給 CodeMirror。
     */
    const initialMeasureFrame = animationWindow.requestAnimationFrame(() => {
      view.requestMeasure();
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
        undo() {
          undo(view);
          view.focus();
        },
        redo() {
          redo(view);
          view.focus();
        },
        scroller() {
          return view.scrollDOM;
        },
        lineTop(number) {
          if (number < 1 || number > view.state.doc.lines) {
            return null;
          }

          /*
           * 用 coordsAtPos 量真正的 DOM，不用 lineBlockAt。
           *
           * lineBlockAt 讀的是 CodeMirror 自己維護的估算高度表。它曾在主題 CSS 穩定前
           * 完成初始量測，讓 documentPadding.top 停在 0（實際 28）、defaultLineHeight
           * 停在 14（實際約 24）。revealLine 會要求重新量測，但捲動同步需要的是當下
           * DOM 的精確位置，仍以 coordsAtPos 的 Range.getBoundingClientRect 為準。
           *
           * 代價是沒渲染到的行問不出位置（回傳 null）。對捲動同步來說夠用：需要的錨點
           * 都在視窗附近，而頭尾兩端由 mapScroll 自己補。
           */
          const line = view.state.doc.line(number);
          const coords = view.coordsAtPos(line.from);
          if (!coords) {
            return null;
          }

          const scroller = view.scrollDOM;
          return coords.top - scroller.getBoundingClientRect().top + scroller.scrollTop;
        },
        revealLine(number) {
          /*
           * 先讓 CodeMirror 在這個 frame 量完最新的 padding、行高、縮放與容器尺寸，
           * 下一個 frame 才送 scroll effect。兩者都走官方 API，不自行換算 scrollTop。
           * 連點大綱時只保留最後一次，避免舊目標晚一拍蓋掉新目標。
           */
          view.requestMeasure();
          if (revealFrame !== null) {
            animationWindow.cancelAnimationFrame(revealFrame);
          }
          revealFrame = animationWindow.requestAnimationFrame(() => {
            revealFrame = null;
            if (destroyed) {
              return;
            }

            // 行號可能來自還沒同步的內容（預覽有 120ms 的合併延遲），超出範圍就夾住
            const clamped = Math.min(Math.max(number, 1), view.state.doc.lines);
            const line = view.state.doc.line(clamped);

            view.dispatch({
              selection: { anchor: line.from },
              /*
               * 遠處的行尚未進 DOM 時，CodeMirror 看到的是整塊 gap；先用 start 讓
               * 官方虛擬視窗把目標行畫出來，再量一次後補上實際的一行閱讀脈絡。
               */
              effects: EditorView.scrollIntoView(line.from, { y: "start" }),
            });
            view.requestMeasure();
            revealFrame = animationWindow.requestAnimationFrame(() => {
              revealFrame = null;
              if (destroyed) {
                return;
              }

              const latestLine = view.state.doc.line(
                Math.min(Math.max(number, 1), view.state.doc.lines),
              );
              view.dispatch({
                effects: EditorView.scrollIntoView(latestLine.from, {
                  y: "start",
                  // 用量測後的一行高度留閱讀脈絡，不再猜一個固定 pixel offset。
                  yMargin: view.defaultLineHeight,
                }),
              });
              view.focus();
            });
          });
        },
        focus() {
          view.focus();
        },
      };
    }

    onReadyRef.current?.();

    return () => {
      destroyed = true;
      animationWindow.cancelAnimationFrame(initialMeasureFrame);
      if (revealFrame !== null) {
        animationWindow.cancelAnimationFrame(revealFrame);
      }
      if (wikiCompletionTimer !== null) {
        clearTimeout(wikiCompletionTimer);
      }
      if (apiRef) {
        apiRef.current = null;
      }
      editorView.current = null;
      view.destroy();
    };
    // 只在掛載時建一次。切換筆記時外層會用 key 強制重新掛載，所以不需要同步 initialValue。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    editorView.current?.dispatch({ effects: setWikiResolutions.of(wikiLinks) });
  }, [wikiLinks]);

  return <div ref={host} className="h-full overflow-auto" />;
}

async function wikiLinkCompletions(
  context: CompletionContext,
  search: (query: string, limit: number) => Promise<WikiNoteCandidate[]>,
): Promise<CompletionResult | null> {
  if (!context.state.selection.main.empty) {
    return null;
  }

  const line = context.state.doc.lineAt(context.pos);
  const before = context.state.sliceDoc(line.from, context.pos);
  const query = wikiCompletionQuery(before);
  if (!query) {
    return null;
  }

  const from = line.from + query.from;
  if (isWikiCompletionInsideCode(context.state, context.pos)) {
    return null;
  }

  const candidates = rankWikiCandidates(await search(query.query, 20), query.query);
  const seen = new Set<string>();
  const options = candidates.flatMap((candidate) => {
    if (seen.has(candidate.title)) {
      return [];
    }
    seen.add(candidate.title);
    return [
      {
        label: candidate.title,
        detail: candidate.ambiguous ? "同名，將保持未解析" : candidate.updatedLabel,
        apply(view: EditorView) {
          const insertion = wikiCompletionInsertion(candidate.title);
          view.dispatch({
            changes: { from, to: context.pos, insert: insertion },
            selection: { anchor: from + insertion.length },
            userEvent: "input.complete",
          });
        },
      },
    ];
  });

  return {
    from,
    options,
    filter: false,
  };
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

  // 補上硬換行，否則預覽會把這兩行接成同一段。理由見 hardBreakSuffix。
  const insert = `${hardBreakSuffix(line.text)}\n${next}`;
  view.dispatch({
    changes: { from: range.head, insert },
    selection: { anchor: range.head + insert.length },
    userEvent: "input",
  });
  return true;
}

/** 選取範圍（含多游標）碰到的每一行，由上往下、不重複。 */
function selectedLines(state: EditorState): number[] {
  const numbers = new Set<number>();

  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n += 1) {
      numbers.add(n);
    }
  }

  return [...numbers].sort((a, b) => a - b);
}

/**
 * Tab 與 Shift-Tab。
 *
 * 不用 CodeMirror 的 indentMore／indentLess，因為縮排單位要看行的種類 ——
 * 清單是半形兩格（語法），其他行是全形空格（內容，預覽才看得到）。
 * 判斷規則在 lib/indent-rules.ts，這裡只負責接上 CodeMirror。
 */
function smartIndent(view: EditorView): boolean {
  const { state } = view;

  const changes = state.changes(
    selectedLines(state).map((n) => {
      const line = state.doc.line(n);
      return { from: line.from, insert: indentUnitFor(line.text) };
    }),
  );

  view.dispatch({
    changes,
    // assoc 1：游標本來就在行首時，縮完要停在縮排的後面而不是前面
    selection: state.selection.map(changes, 1),
    userEvent: "input.indent",
  });
  return true;
}

function smartOutdent(view: EditorView): boolean {
  const { state } = view;
  const changes: { from: number; to: number }[] = [];

  for (const n of selectedLines(state)) {
    const line = state.doc.line(n);
    const length = outdentLength(line.text);
    if (length > 0) {
      changes.push({ from: line.from, to: line.from + length });
    }
  }

  if (changes.length === 0) {
    return false; // 沒有縮排可退，把 Tab 交還給其他 keymap
  }

  view.dispatch({ changes, userEvent: "delete.dedent" });
  return true;
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

  /*
   * 游標落在區塊中間那一行（程式碼區塊那種前後包夾的形狀），
   * 沒有中間空行的就落在最後 —— 備註框的 `> ` 後面正好是要打字的地方。
   */
  const gap = payload.indexOf("\n\n");
  const anchor = gap === -1 ? insertAt + payload.length : insertAt + gap + 2;

  view.dispatch({
    changes: { from: insertAt, to: insertAt, insert: payload },
    selection: { anchor },
  });
  view.focus();
  return true;
}

// ---------------------------------------------------------------- 縮排參考線
// 欄位的算法在 lib/indent-guides.ts，這裡只負責量出字寬並畫上去。

/** 視窗上緣的空行沒有「前一行」可看，往回找最多這麼多行就放棄。 */
const BORROW_SCAN_LIMIT = 100;

/**
 * 縮排參考線。
 *
 * 用 line decoration 加一層 repeating-linear-gradient 背景，而不是插入元素 ——
 * 背景不進入文件流，游標定位、選取範圍、複製出來的文字都不受影響。
 * 一格的寬度要靠 defaultCharacterWidth 量（等寬字體才量得準，編輯區正好是），
 * 所以字體或縮放變了（geometryChanged）就得重畫。
 */
const indentGuides = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildIndentGuides(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.geometryChanged) {
        this.decorations = buildIndentGuides(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

function buildIndentGuides(view: EditorView): DecorationSet {
  const { doc } = view.state;
  const step = GUIDE_STEP * view.defaultCharacterWidth;
  const builder = new RangeSetBuilder<Decoration>();

  const draw = (lineNumber: number, columns: number) => {
    const count = guideCount(columns);
    if (count === 0) {
      return;
    }
    const line = doc.line(lineNumber);
    builder.add(
      line.from,
      line.from,
      Decoration.line({
        class: "cm-indentGuides",
        attributes: { style: `--guides: ${count}; --guide-step: ${step}px` },
      }),
    );
  };

  for (const { from, to } of view.visibleRanges) {
    const first = doc.lineAt(from).number;
    const last = doc.lineAt(to).number;

    let previous = columnsBefore(doc, first);
    // 還沒決定縮排的空行，等下一個非空行出現才知道要借多少
    let pending: number[] = [];

    for (let n = first; n <= last; n += 1) {
      const columns = leadingColumns(doc.line(n).text);

      if (columns === null) {
        pending.push(n);
        continue;
      }

      const borrowed = blankLineColumns(previous, columns);
      for (const blank of pending) {
        draw(blank, borrowed);
      }
      pending = [];

      draw(n, columns);
      previous = columns;
    }

    // 視窗下緣還沒收尾的空行：沒有下一行可借，就跟著上面
    for (const blank of pending) {
      draw(blank, blankLineColumns(previous, null));
    }
  }

  return builder.finish();
}

/** 往回找最近一個非空行的縮排。找不到（或找太遠）就回傳 null。 */
function columnsBefore(doc: Text, lineNumber: number): number | null {
  const limit = Math.max(1, lineNumber - BORROW_SCAN_LIMIT);

  for (let n = lineNumber - 1; n >= limit; n -= 1) {
    const columns = leadingColumns(doc.line(n).text);
    if (columns !== null) {
      return columns;
    }
  }

  return null;
}

// ---------------------------------------------------------------- Academic IDE 語義裝飾

/*
 * HighlightStyle 能替 heading、list、quote 的內容上色，但 Lezer 會把整個清單項目都標成
 * tags.list；直接把 tags.list 設成結構色，正文也會一起變淡。這層只依 syntax tree 找
 * marker node，讓「結構」與「內容」各自保有正確權重，不另外 parse Markdown。
 */
const STRUCTURE_MARK_NODES = new Set(["HeaderMark", "ListMark", "QuoteMark"]);
const TECHNICAL_MARK_NODES = new Set(["LinkMark", "EmphasisMark", "CodeMark"]);
const CODE_CONTEXT_NODES = new Set(["InlineCode", "FencedCode", "CodeBlock", "CodeText"]);

/*
 * 四色螢光筆是 NEXUM 的自訂 inline 語法，Lezer Markdown 不認得它。只掃描目前可見的行，
 * 而且先用 syntax tree 排除 code context；不碰文件內容、不影響 IME／selection／undo，
 * 長文件也不會因每次輸入重掃全文。
 */
const EDITOR_HIGHLIGHT_PATTERN = /==([^=\n]+)==(?:\{([gpb])\})?/g;
const CALLOUT_MARK_PATTERN = /^(\s*>\s*)\[!(KEY|PRACTICE|PITFALL|INSIGHT)\]/;

const setWikiResolutions = StateEffect.define<WikiLinkResolution[]>();
const wikiResolutionField = StateField.define<ReadonlyMap<string, WikiLinkResolution>>({
  create: () => new Map(),
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setWikiResolutions)) {
        return new Map(effect.value.map((item) => [item.title, item]));
      }
    }
    return value;
  },
});

const academicDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildAcademicDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.startState.field(wikiResolutionField) !== update.state.field(wikiResolutionField)
      ) {
        this.decorations = buildAcademicDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

function buildAcademicDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const tree = syntaxTree(view.state);
  const seenNodes = new Set<string>();

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        const key = `${node.name}:${node.from}:${node.to}`;
        if (seenNodes.has(key) || node.from === node.to) {
          return;
        }
        seenNodes.add(key);

        if (STRUCTURE_MARK_NODES.has(node.name)) {
          ranges.push(
            Decoration.mark({ class: "cm-structureMark" }).range(node.from, node.to),
          );
        } else if (TECHNICAL_MARK_NODES.has(node.name)) {
          ranges.push(
            Decoration.mark({ class: "cm-technicalMark" }).range(node.from, node.to),
          );
        }
      },
    });
  }

  const seenLines = new Set<number>();
  for (const { from, to } of view.visibleRanges) {
    const first = view.state.doc.lineAt(from).number;
    const last = view.state.doc.lineAt(to).number;

    for (let number = first; number <= last; number += 1) {
      if (seenLines.has(number)) {
        continue;
      }
      seenLines.add(number);

      const line = view.state.doc.line(number);
      decorateChineseListMarker(line.from, line.text, ranges);
      decorateEditorHighlights(line.from, line.text, tree, ranges);
      decorateCalloutMarker(line.from, line.text, ranges);
      decorateWikiLinks(view, line.from, line.text, tree, ranges);
    }
  }

  return Decoration.set(ranges, true);
}

function decorateWikiLinks(
  view: EditorView,
  lineFrom: number,
  text: string,
  tree: ReturnType<typeof syntaxTree>,
  ranges: Range<Decoration>[],
) {
  const resolutions = view.state.field(wikiResolutionField);
  for (const link of parseWikiLinks(text)) {
    const from = lineFrom + link.from;
    const to = lineFrom + link.to;
    if (isCodeContext(tree.resolveInner(Math.max(from, to - 1), -1))) {
      continue;
    }
    const status = resolutions.get(link.title)?.status ?? "unresolved";
    ranges.push(
      Decoration.mark({
        class: `cm-wikiLink cm-wikiLink-${status}`,
      }).range(from, to),
    );
  }
}

function decorateChineseListMarker(
  lineFrom: number,
  text: string,
  ranges: Range<Decoration>[],
) {
  const marker = parseChineseListMarker(text);
  if (!marker) {
    return;
  }

  const markerLength =
    marker.kind === "dun" ? marker.numeral.length + 1 : marker.numeral.length + 2;
  const from = lineFrom + marker.indent.length;
  ranges.push(Decoration.mark({ class: "cm-legalListMark" }).range(from, from + markerLength));
}

function decorateEditorHighlights(
  lineFrom: number,
  text: string,
  tree: ReturnType<typeof syntaxTree>,
  ranges: Range<Decoration>[],
) {
  EDITOR_HIGHLIGHT_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = EDITOR_HIGHLIGHT_PATTERN.exec(text)) !== null) {
    const openFrom = lineFrom + match.index;
    const contentFrom = openFrom + 2;
    const contentTo = contentFrom + match[1].length;

    if (isCodeContext(tree.resolveInner(contentFrom, 1))) {
      continue;
    }

    const tone = match[2] === "g" ? "green" : match[2] === "p" ? "pink" : match[2] === "b" ? "blue" : "yellow";
    ranges.push(
      Decoration.mark({ class: "cm-highlightDelimiter" }).range(openFrom, contentFrom),
      Decoration.mark({ class: `cm-highlightContent cm-highlightContent-${tone}` }).range(
        contentFrom,
        contentTo,
      ),
      Decoration.mark({ class: "cm-highlightDelimiter" }).range(contentTo, contentTo + 2),
    );

    const suffixFrom = contentTo + 2;
    const suffixTo = openFrom + match[0].length;
    if (suffixTo > suffixFrom) {
      ranges.push(
        Decoration.mark({ class: "cm-technicalMark" }).range(suffixFrom, suffixTo),
      );
    }
  }
}

function decorateCalloutMarker(
  lineFrom: number,
  text: string,
  ranges: Range<Decoration>[],
) {
  const match = CALLOUT_MARK_PATTERN.exec(text);
  if (!match) {
    return;
  }

  const from = lineFrom + match[1].length;
  const tag = match[2].toLowerCase();
  ranges.push(
    Decoration.mark({ class: `cm-calloutMark cm-calloutMark-${tag}` }).range(
      from,
      lineFrom + match[0].length,
    ),
  );
}

function isCodeContext(node: SyntaxNode): boolean {
  for (let current: SyntaxNode | null = node; current; current = current.parent) {
    if (CODE_CONTEXT_NODES.has(current.name)) {
      return true;
    }
  }
  return false;
}

/**
 * 語法上色。
 *
 * Academic IDE 只用四個低飽和色族：結構墨藍、知識暖金、引用藍與技術紫灰。
 * marker 的精準範圍交給上面的 syntax-tree decoration；這裡負責內容本身的階層。
 *
 * 顏色全部走主題變數，深淺色自動跟著換。標題與粗體只靠字重與字色分層，
 * 不上彩色 —— 這裡是拿來寫法律筆記的，不是拿來看語法糖的。
 */
const syntax = HighlightStyle.define([
  { tag: tags.heading1, color: "var(--accent)", fontWeight: "700" },
  {
    tag: tags.heading2,
    color: "color-mix(in srgb, var(--accent) 88%, var(--ink))",
    fontWeight: "650",
  },
  {
    tag: tags.heading3,
    color: "color-mix(in srgb, var(--accent) 72%, var(--ink))",
    fontWeight: "600",
  },
  {
    tag: [tags.heading4, tags.heading5, tags.heading6],
    color: "color-mix(in srgb, var(--accent) 54%, var(--ink))",
    fontWeight: "600",
  },
  { tag: tags.strong, color: "var(--ink)", fontWeight: "650" },
  { tag: tags.emphasis, color: "var(--technical)", fontStyle: "italic" },
  { tag: tags.link, color: "var(--reference)" },
  { tag: tags.url, color: "var(--reference-muted)" },
  {
    tag: tags.quote,
    color: "color-mix(in srgb, var(--ink) 74%, var(--ink-muted))",
  },
  {
    tag: tags.monospace,
    color: "var(--technical)",
    backgroundColor: "var(--technical-soft)",
  },
  // tags.list 涵蓋整個項目；正文必須維持正常，marker 由 decoration 單獨上色。
  { tag: tags.list, color: "var(--ink)" },
  { tag: tags.strikethrough, color: "var(--ink-muted)", textDecoration: "line-through" },
  // 括號、星號與反引號等一般 Markdown mechanics。
  { tag: tags.processingInstruction, color: "var(--syntax-mark)" },
]);

/** 讓 CodeMirror 用主題的 CSS 變數，深淺色才會跟著換。 */
const theme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
    // 15px：這裡打的是中文，不是程式碼。14px 的中文長時間看會累。
    fontSize: "15px",
  },
  "&.cm-focused": {
    outline: "none",
  },
  /*
   * 原始語法也是拿來讀的，所以跟預覽區一樣鎖行寬：大螢幕上整行拉到 1200px
   * 只會讓眼睛從行尾找不回行首。留白給得比預覽區少一點 —— 這裡還要放行號。
   *
   * 寬度走 CSS 變數，只有編輯區時（純寫作模式）外層會把它放寬到 58rem。
   */
  ".cm-content": {
    maxWidth: "var(--editor-measure, 74ch)",
    margin: "0 auto",
    fontFamily: "var(--font-mono, ui-monospace), monospace",
    padding: "1.75rem 0",
    // 中文行距要比程式碼寬一點才好讀
    lineHeight: "1.85",
    letterSpacing: "0.008em",
  },
  ".cm-line": {
    padding: "0 1.25rem",
  },

  /*
   * 縮排參考線。--guides（幾條）與 --guide-step（一層多寬）由 indentGuides 逐行掛上。
   * background-origin/clip 設成 content-box，線才會從文字的起點算起而不是 padding 的邊緣。
   */
  ".cm-line.cm-indentGuides": {
    backgroundImage:
      "repeating-linear-gradient(to right, color-mix(in srgb, var(--line) 72%, transparent) 0 1px, transparent 1px var(--guide-step))",
    backgroundSize: "calc(var(--guides) * var(--guide-step)) 100%",
    backgroundRepeat: "no-repeat",
    backgroundOrigin: "content-box",
    backgroundClip: "content-box",
  },
  /*
   * 行號：窄一點、淡一點。它是輔助資訊，不該跟正文搶視線 ——
   * 這是筆記編輯器，不是 IDE。
   */
  ".cm-gutters": {
    minWidth: "2.25rem",
    paddingRight: "0.25rem",
    backgroundColor: "var(--surface)",
    color: "color-mix(in srgb, var(--ink-muted) 45%, transparent)",
    border: "none",
    fontSize: "11px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 0.35rem 0 0.5rem",
    minWidth: "auto",
  },
  /*
   * 游標所在行。原本用墨藍 6%，在一整片暖白裡是一條藍帶，很吵。
   * 改成幾乎看不見的暖灰 —— 它只要回答「我在哪一行」，不需要被看見。
   */
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--ink) 3.5%, transparent)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--accent)",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--accent)",
    borderLeftWidth: "2px",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--accent-soft) 88%, transparent)",
  },

  // Markdown 結構 marker 與中文法律條列共用同一個 restrained navy。
  ".cm-structureMark, .cm-legalListMark": {
    color: "var(--syntax-structure)",
    fontWeight: "600",
  },
  ".cm-technicalMark": {
    color: "var(--technical)",
  },
  ".cm-highlightDelimiter": {
    color: "color-mix(in srgb, var(--gold) 72%, var(--syntax-mark))",
  },
  ".cm-highlightContent": {
    borderRadius: "2px",
    boxShadow: "0 0 0 1.5px var(--editor-highlight)",
    backgroundColor: "var(--editor-highlight)",
  },
  ".cm-highlightContent-yellow": {
    "--editor-highlight": "var(--hl-yellow)",
  },
  ".cm-highlightContent-green": {
    "--editor-highlight": "var(--hl-green)",
  },
  ".cm-highlightContent-pink": {
    "--editor-highlight": "var(--hl-pink)",
  },
  ".cm-highlightContent-blue": {
    "--editor-highlight": "var(--hl-blue)",
  },
  ".cm-calloutMark": {
    fontWeight: "650",
  },
  ".cm-calloutMark-key": {
    color: "var(--gold)",
  },
  ".cm-calloutMark-practice": {
    color: "var(--syntax-structure)",
  },
  ".cm-calloutMark-pitfall": {
    color: "var(--danger)",
  },
  ".cm-calloutMark-insight": {
    color: "var(--insight)",
  },
  ".cm-wikiLink": {
    borderRadius: "2px",
    color: "var(--reference)",
    textDecoration: "underline",
    textDecorationColor: "color-mix(in srgb, var(--reference) 42%, transparent)",
    textUnderlineOffset: "0.2em",
  },
  ".cm-wikiLink-unresolved, .cm-wikiLink-ambiguous": {
    color: "var(--ink-muted)",
    textDecorationStyle: "dashed",
    textDecorationColor: "color-mix(in srgb, var(--ink-muted) 55%, transparent)",
  },

  // 斜線命令的選單。預設是系統灰底，跟整體不搭。
  ".cm-tooltip.cm-tooltip-autocomplete": {
    border: "1px solid var(--line)",
    borderRadius: "3px",
    backgroundColor: "var(--surface)",
    boxShadow: "var(--shadow-pop)",
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
