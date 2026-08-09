"use client";

import { displayTitle, type NoteSummary } from "@/lib/note-display";
import { HELP_TAB_ID } from "@/lib/tabs";
import { useOpenTabs } from "@/lib/use-open-tabs";
import { useIsUnsaved } from "@/lib/workspace-status";

import { ContextMenu, useContextMenu } from "./context-menu";

/**
 * 工作區上方的分頁列。
 *
 * 刻意不做成 VS Code 那種完整工作區（拖曳排序、分割、預覽分頁）—— 這是讀書工具，
 * 分頁要解決的是「爭點整理時同時開總則與分則」，不是管理幾十個檔案。
 *
 * 只在桌機出現。手機是唯讀的兩層導覽，多開分頁沒有意義。
 */
export function NoteTabs({ notes }: { notes: NoteSummary[] }) {
  const titles = new Map(notes.map((note) => [note.id, displayTitle(note)]));
  const tabs = useOpenTabs(new Set(titles.keys()));

  if (tabs.ids.length === 0) {
    return null;
  }

  return (
    <div
      role="tablist"
      aria-label="開啟中的筆記"
      className="hidden h-9.5 shrink-0 items-stretch gap-px overflow-x-auto border-b border-border-subtle bg-list px-1 md:flex"
    >
      {tabs.ids.map((id) => (
        <Tab
          key={id}
          id={id}
          title={id === HELP_TAB_ID ? "使用說明" : (titles.get(id) ?? "無標題")}
          active={id === tabs.activeId}
          onOpen={() => tabs.open(id)}
          onClose={() => tabs.close(id)}
          onCloseOthers={() => tabs.closeOthers(id)}
          multiple={tabs.ids.length > 1}
        />
      ))}
    </div>
  );
}

function Tab({
  id,
  title,
  active,
  onOpen,
  onClose,
  onCloseOthers,
  multiple,
}: {
  id: string;
  title: string;
  active: boolean;
  onOpen: () => void;
  onClose: () => void;
  onCloseOthers: () => void;
  multiple: boolean;
}) {
  const menu = useContextMenu();
  const unsaved = useIsUnsaved(id);

  return (
    <div
      className={`group relative flex max-w-[200px] min-w-0 items-center gap-1.5 border-t-2 px-3 text-sm transition-colors duration-150 ${
        active
          ? "border-t-gold bg-workspace text-primary"
          : "border-t-transparent text-muted hover:bg-hover hover:text-primary"
      }`}
      onContextMenu={menu.openAtPointer}
      // 中鍵關分頁，跟瀏覽器一樣
      onAuxClick={(event) => {
        if (event.button === 1) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={onOpen}
        className="min-w-0 flex-1 truncate text-left"
        title={title}
      >
        {title}
      </button>

      {/*
        沒存完的分頁用一個點提示，不用文字 —— 分頁上塞字會擠掉標題。
        真正的狀態文字在編輯區右下角。
      */}
      {unsaved ? (
        <span className="size-1.5 shrink-0 rounded-full bg-accent" title="尚未儲存" aria-hidden />
      ) : null}

      <button
        type="button"
        onClick={onClose}
        aria-label={`關閉 ${title}`}
        title="關閉"
        className={`flex size-5 shrink-0 items-center justify-center rounded-sm leading-none text-ink-muted transition-[opacity,color,background-color] duration-150 hover:bg-danger-soft hover:text-danger ${
          active ? "opacity-70" : "opacity-0 group-hover:opacity-70"
        }`}
      >
        ×
      </button>

      {menu.position ? (
        <ContextMenu
          position={menu.position}
          onClose={menu.close}
          label={`${title} 的分頁選單`}
          items={[
            { label: "關閉", onSelect: onClose },
            { label: "關閉其他分頁", onSelect: onCloseOthers, disabled: !multiple },
          ]}
        />
      ) : null}
    </div>
  );
}
