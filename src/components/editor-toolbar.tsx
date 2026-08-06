"use client";

import type { EditorApi } from "./markdown-editor";

/**
 * 編輯區上方的工具列。
 *
 * 每個按鈕都對應一個快捷鍵，title 上寫出來讓人慢慢從滑鼠換成鍵盤。
 */
export function EditorToolbar({
  api,
  onOpenImagePicker,
}: {
  api: React.RefObject<EditorApi | null>;
  onOpenImagePicker: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-2 py-1">
      <Button label="H1" title="標題" onClick={() => api.current?.toggleLinePrefix("# ")} />
      <Button
        label="B"
        title="粗體 ⌘B"
        className="font-bold"
        onClick={() => api.current?.wrapSelection("**")}
      />
      <Button
        label="I"
        title="斜體 ⌘I"
        className="italic"
        onClick={() => api.current?.wrapSelection("*")}
      />

      <Divider />

      <Button label="•" title="項目清單" onClick={() => api.current?.toggleLinePrefix("- ")} />
      <Button label="1." title="編號清單" onClick={() => api.current?.toggleLinePrefix("1. ")} />
      <Button label="☑" title="待辦清單" onClick={() => api.current?.toggleLinePrefix("- [ ] ")} />
      <Button label="❝" title="引用" onClick={() => api.current?.toggleLinePrefix("> ")} />

      <Divider />

      <Button label="🔗" title="連結 ⌘K" onClick={() => api.current?.insertLink()} />
      <Button label="🖼" title="插入圖片" onClick={onOpenImagePicker} />
      <Button
        label="⌗"
        title="程式碼區塊 ⌘⇧C"
        onClick={() => api.current?.insertBlock("```\n\n```")}
      />
      <Button
        label="▦"
        title="表格"
        onClick={() =>
          api.current?.insertBlock("| 欄位 | 欄位 |\n| --- | --- |\n|  |  |")
        }
      />
    </div>
  );
}

function Button({
  label,
  title,
  onClick,
  className = "",
}: {
  label: string;
  title: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`min-w-7 rounded px-1.5 py-1 text-xs text-ink-muted hover:bg-accent-soft hover:text-accent ${className}`}
    >
      {label}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-line" />;
}
