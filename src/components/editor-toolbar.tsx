"use client";

import { calloutBlock, CALLOUTS } from "@/lib/callouts";

import { ContextMenu, useContextMenu } from "./context-menu";
import { HighlightButton } from "./highlight-button";
import {
  IconCallout,
  IconDivider,
  IconHeading,
  IconImage,
  IconLink,
  IconList,
  IconListOrdered,
  IconMore,
  IconQuote,
  IconRedo,
  IconTable,
  IconUndo,
  IconBold,
  IconItalic,
} from "./icons";
import type { EditorApi } from "./markdown-editor";
import { Tooltip } from "./tooltip";

/**
 * 編輯區上方的工具列。
 *
 * 排列順序照「寫一段法律筆記的實際動線」分四組：復原 → 文字 → 清單 → 插入，
 * 中間用細分隔線斷開。每個按鈕都掛 Tooltip（名稱 + 快捷鍵），滑鼠使用者會
 * 慢慢學會鍵盤操作。
 *
 * **程式碼區塊收進「更多」**：法律筆記幾乎不寫程式碼，但很常需要圈出重點，
 * 所以第一層留給重點區塊（callout），`<>` 退到第二層。
 */
export function EditorToolbar({
  api,
  onOpenImagePicker,
}: {
  api: React.RefObject<EditorApi | null>;
  onOpenImagePicker: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Markdown 編輯工具"
      className="flex h-8 shrink-0 flex-nowrap items-center gap-px overflow-x-auto border-b border-border-subtle bg-workspace px-2"
    >
      <Button label="復原" shortcut="⌘Z" onClick={() => api.current?.undo()}>
        <IconUndo />
      </Button>
      <Button label="重做" shortcut="⌘⇧Z" onClick={() => api.current?.redo()}>
        <IconRedo />
      </Button>

      <Divider />

      <Button label="標題" onClick={() => api.current?.toggleLinePrefix("# ")}>
        <IconHeading />
      </Button>
      <Button label="粗體" shortcut="⌘B" onClick={() => api.current?.wrapSelection("**")}>
        <IconBold />
      </Button>
      <Button label="斜體" shortcut="⌘I" onClick={() => api.current?.wrapSelection("*")}>
        <IconItalic />
      </Button>
      <HighlightButton api={api} />

      <Divider />

      <Button label="項目清單" onClick={() => api.current?.toggleLinePrefix("- ")}>
        <IconList />
      </Button>
      <Button label="編號清單" onClick={() => api.current?.toggleLinePrefix("1. ")}>
        <IconListOrdered />
      </Button>
      <Button label="引用" onClick={() => api.current?.toggleLinePrefix("> ")}>
        <IconQuote />
      </Button>

      <Divider />

      <Button label="連結" shortcut="⌘K" onClick={() => api.current?.insertLink()}>
        <IconLink />
      </Button>
      <Button label="插入圖片" shortcut="⌘⇧I" onClick={onOpenImagePicker}>
        <IconImage />
      </Button>
      <Button
        label="表格"
        onClick={() => api.current?.insertBlock("| 欄位 | 欄位 |\n| --- | --- |\n|  |  |")}
      >
        <IconTable />
      </Button>
      <CalloutButton api={api} />
      <Button label="分隔線" onClick={() => api.current?.insertBlock("---")}>
        <IconDivider />
      </Button>

      <Divider />

      <MoreButton api={api} />
    </div>
  );
}

function CalloutButton({ api }: { api: React.RefObject<EditorApi | null> }) {
  const menu = useContextMenu();

  return (
    <>
      <Button label="備註／重點框" shortcut="⌘⇧M" onClick={menu.openBelow}>
        <IconCallout />
      </Button>

      {menu.position ? (
        <ContextMenu
          position={menu.position}
          onClose={menu.close}
          label="備註框的種類"
          items={CALLOUTS.map((callout) => ({
            label: `${callout.label}　${callout.usage}`,
            hint: callout.tag === "KEY" ? "⌘⇧M" : undefined,
            onSelect: () => api.current?.insertBlock(calloutBlock(callout.tag)),
          }))}
        />
      ) : null}
    </>
  );
}

function MoreButton({ api }: { api: React.RefObject<EditorApi | null> }) {
  const menu = useContextMenu();

  return (
    <>
      <Button label="更多" onClick={menu.openBelow}>
        <IconMore />
      </Button>

      {menu.position ? (
        <ContextMenu
          position={menu.position}
          onClose={menu.close}
          label="更多插入項目"
          items={[
            {
              label: "待辦清單",
              onSelect: () => api.current?.toggleLinePrefix("- [ ] "),
            },
            {
              label: "程式碼區塊　⌘⇧C",
              onSelect: () => api.current?.insertBlock("```\n\n```"),
            },
          ]}
        />
      ) : null}
    </>
  );
}

function Button({
  label,
  shortcut,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label} shortcut={shortcut}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="flex size-6 items-center justify-center rounded-sm text-muted transition-colors duration-150 hover:bg-hover hover:text-primary"
      >
        {children}
      </button>
    </Tooltip>
  );
}

/** 群組分隔。非常淡 —— 它只要讓眼睛停一下，不需要被看見。 */
function Divider() {
  return <span className="mx-1 h-3.5 w-px shrink-0 bg-border-subtle" aria-hidden />;
}
