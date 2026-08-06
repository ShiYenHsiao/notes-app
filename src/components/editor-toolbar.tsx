"use client";

import {
  IconBold,
  IconChecklist,
  IconCode,
  IconHeading,
  IconImage,
  IconItalic,
  IconLink,
  IconList,
  IconListOrdered,
  IconQuote,
  IconTable,
} from "./icons";
import type { EditorApi } from "./markdown-editor";

/**
 * 編輯區上方的工具列。
 *
 * 按功能分三組：段落結構、清單、插入。每個按鈕的 title 都寫出對應的快捷鍵，
 * 讓人慢慢從滑鼠換成鍵盤。
 */
export function EditorToolbar({
  api,
  onOpenImagePicker,
}: {
  api: React.RefObject<EditorApi | null>;
  onOpenImagePicker: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-px border-b border-line px-2 py-1.5">
      <Button title="標題" onClick={() => api.current?.toggleLinePrefix("# ")}>
        <IconHeading />
      </Button>
      <Button title="粗體  ⌘B" onClick={() => api.current?.wrapSelection("**")}>
        <IconBold />
      </Button>
      <Button title="斜體  ⌘I" onClick={() => api.current?.wrapSelection("*")}>
        <IconItalic />
      </Button>
      <Button title="引用" onClick={() => api.current?.toggleLinePrefix("> ")}>
        <IconQuote />
      </Button>

      <Divider />

      <Button title="項目清單" onClick={() => api.current?.toggleLinePrefix("- ")}>
        <IconList />
      </Button>
      <Button title="編號清單" onClick={() => api.current?.toggleLinePrefix("1. ")}>
        <IconListOrdered />
      </Button>
      <Button title="待辦清單" onClick={() => api.current?.toggleLinePrefix("- [ ] ")}>
        <IconChecklist />
      </Button>

      <Divider />

      <Button title="連結  ⌘K" onClick={() => api.current?.insertLink()}>
        <IconLink />
      </Button>
      <Button title="插入圖片" onClick={onOpenImagePicker}>
        <IconImage />
      </Button>
      <Button title="程式碼區塊  ⌘⇧C" onClick={() => api.current?.insertBlock("```\n\n```")}>
        <IconCode />
      </Button>
      <Button
        title="表格"
        onClick={() => api.current?.insertBlock("| 欄位 | 欄位 |\n| --- | --- |\n|  |  |")}
      >
        <IconTable />
      </Button>
    </div>
  );
}

function Button({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-accent-soft hover:text-accent"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1.5 h-4 w-px bg-line" aria-hidden />;
}
