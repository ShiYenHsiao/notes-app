"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useTransition } from "react";

import { signOut } from "@/lib/actions/auth";
import { createNote } from "@/lib/actions/notes";
import { deleteTag, renameTag } from "@/lib/actions/tags";
import { TAG_NAME_MAX_LENGTH, type NoteSummary, type TagSummary } from "@/lib/note-display";
import type { ThemePreference } from "@/lib/theme";
import { useThemePreference } from "@/lib/use-theme-preference";
import { useFocusMode, WorkspaceFocusProvider } from "@/lib/workspace-focus";
import { WorkspaceStatusProvider } from "@/lib/workspace-status";

import { ContextMenu, useContextMenu } from "./context-menu";
import { KnowledgeIndexRepair } from "./knowledge-index-repair";
import {
  IconBook,
  IconNotes,
  IconPinned,
  IconPlus,
  IconSearch,
  IconSettings,
  IconSidebar,
  IconTag,
  IconTrash,
} from "./icons";
import { NexumBadge, NexumWordmark } from "./logo";
import { FOCUS_SEARCH_EVENT, NoteList } from "./note-list";
import { NoteTabs } from "./note-tabs";
import { PlanCard } from "./plan-card";
import { QuickOpen } from "./quick-open";
import { Tooltip } from "./tooltip";

export type NoteCounts = {
  all: number;
  trashed: number;
  pinned: number;
};

/**
 * 桌機四區版面：工具 rail ｜ 文件索引 ｜ Editor / Preview ｜ Outline。
 *
 * 手機是唯讀的兩層導覽，用同一份 DOM 靠 CSS 切換：沒開筆記時只顯示列表，
 * 開了筆記就只顯示內容。判斷依據是網址有沒有 /n/ 前綴。
 */
export function AppShell(props: {
  counts: NoteCounts;
  notes: NoteSummary[];
  tags: TagSummary[];
  children: React.ReactNode;
}) {
  return (
    <WorkspaceFocusProvider>
      <WorkspaceStatusProvider>
        <Shell {...props} />
      </WorkspaceStatusProvider>
    </WorkspaceFocusProvider>
  );
}

function Shell({
  counts,
  notes,
  tags,
  children,
}: {
  counts: NoteCounts;
  notes: NoteSummary[];
  tags: TagSummary[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // 手機是兩層導覽：主工作區有東西時就把列表收起來。說明頁跟筆記一樣算「有東西」。
  const noteOpen = pathname.startsWith("/n/") || pathname === "/help";

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tagPanelOpen, setTagPanelOpen] = useState(false);
  const usedTags = tags.filter((tag) => tag.count > 0);
  const { focused } = useFocusMode();

  /*
   * 專注模式把導覽收起來，但**不卸載**它們。
   *
   * 卸載會丟掉列表的捲動位置，而且退出時整棵樹重新掛載，編輯器也會跟著重建 ——
   * 游標與捲動位置就沒了。改成寬度收到 0 並淡出，狀態全部留在原地，
   * 退出時什麼都不用還原。
   */
  const hidden = "w-0 -translate-x-2 opacity-0 pointer-events-none border-r-0";

  // ⌘\ 收合側邊欄。兩欄都收起來就是專注模式。
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey && event.key === "\\") {
        event.preventDefault();
        setSidebarOpen((open) => !open);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!tagPanelOpen) {
      return;
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setTagPanelOpen(false);
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [tagPanelOpen]);

  return (
    <div className="flex h-dvh bg-background">
      {/* Reference 的第一欄就是工具 rail；展開只增加短標籤，不回到舊版寬導覽。 */}
      <aside
        aria-hidden={focused || undefined}
        className={`hidden shrink-0 flex-col overflow-hidden border-r border-border-subtle bg-sidebar pb-2 transition-[width,opacity,transform] duration-200 ease-out lg:flex ${
          focused
            ? hidden
            : sidebarOpen
              ? "w-[92px] px-1.5 xl:w-[96px]"
              : "w-[54px] px-1.5"
        }`}
      >
        <div className="flex h-[74px] shrink-0 items-center justify-center">
          {sidebarOpen ? (
            <NexumWordmark className="items-center text-center" />
          ) : (
            <NexumBadge size={30} />
          )}
        </div>

        <form action={createNote} className="pb-0.5">
          <SidebarAction
            label="新增筆記"
            icon={<IconPlus size={18} />}
            compact={!sidebarOpen}
          />
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto pt-0.5">
          <nav className="grid gap-0.5">
            {/* 釘選是網址上的篩選條件，讀它需要 useSearchParams，所以要有 Suspense 邊界 */}
            <Suspense fallback={null}>
              <NoteScopeLinks
                counts={counts}
                onNotesPage={pathname === "/" || pathname.startsWith("/n/")}
                compact={!sidebarOpen}
              />
            </Suspense>
            <SidebarButton
              label="搜尋"
              icon={<IconSearch size={18} />}
              compact={!sidebarOpen}
              onClick={() => window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT))}
            />
            <SidebarButton
              label="標籤"
              icon={<IconTag size={18} />}
              compact={!sidebarOpen}
              active={tagPanelOpen}
              onClick={() => setTagPanelOpen((open) => !open)}
            />
            <RailLink
              href="/help"
              label="說明"
              active={pathname === "/help"}
              icon={<IconBook size={18} />}
              compact={!sidebarOpen}
              hint="內建頁面"
            />
            <RailLink
              href="/trash"
              label="垃圾"
              count={counts.trashed}
              active={pathname === "/trash"}
              icon={<IconTrash size={18} />}
              compact={!sidebarOpen}
            />
          </nav>
        </div>

        <div className="grid shrink-0 gap-1 pt-2">
          {sidebarOpen ? <PlanCard used={counts.all} /> : null}

          <div className="flex flex-col items-center gap-0.5">
            <SettingsMenu compact={!sidebarOpen} />

            <Tooltip label={sidebarOpen ? "收合側邊欄" : "展開側邊欄"} shortcut="⌘\">
              <button
                type="button"
                onClick={() => setSidebarOpen((open) => !open)}
                aria-label={`${sidebarOpen ? "收合" : "展開"}側邊欄`}
                aria-expanded={sidebarOpen}
                className="flex size-8 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-hover hover:text-primary"
              >
                <IconSidebar size={16} />
              </button>
            </Tooltip>
          </div>
        </div>
      </aside>

      {tagPanelOpen && !focused ? (
        <>
          <button
            type="button"
            aria-label="關閉標籤選單"
            onClick={() => setTagPanelOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <section className="fixed top-[74px] left-[92px] z-50 w-60 overflow-hidden rounded-lg border border-border-default bg-elevated shadow-pop xl:left-[96px]">
            <div className="flex h-10 items-center border-b border-border-subtle px-3">
              <span className="eyebrow">標籤篩選</span>
              <span className="ml-auto text-2xs text-muted">右鍵管理</span>
            </div>
            {usedTags.length === 0 ? (
              <p className="px-3 py-6 text-sm text-muted">還沒有標籤</p>
            ) : (
              <nav className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5">
                <Suspense fallback={null}>
                  <TagLinks tags={usedTags} onNavigate={() => setTagPanelOpen(false)} />
                </Suspense>
              </nav>
            )}
          </section>
        </>
      ) : null}

      <section
        aria-hidden={focused || undefined}
        className={`w-full shrink-0 flex-col overflow-hidden border-r border-border-subtle bg-list transition-[width,opacity,transform] duration-200 ease-out md:flex ${
          noteOpen ? "hidden" : "flex"
        } ${focused ? `md:w-0 ${hidden}` : "md:w-[clamp(246px,18vw,300px)]"}`}
      >
        {/* useSearchParams 需要 Suspense 邊界 */}
        <Suspense fallback={<div className="flex-1" />}>
          <NoteList notes={notes} tags={tags} total={counts.all} />
        </Suspense>

        {/* 側邊欄在小螢幕收起來了，新增按鈕改放這裡 */}
        <form action={createNote} className="border-t border-line p-3 lg:hidden">
          <button
            type="submit"
            className="w-full rounded-md bg-action px-3 py-2.5 text-sm font-semibold text-white hover:bg-action/90"
          >
            新增筆記
          </button>
        </form>
      </section>

      <main
        className={`flex-1 flex-col overflow-hidden bg-workspace md:flex ${noteOpen ? "flex" : "hidden"}`}
      >
        {/* 專注模式收起分頁列：現在只有一篇筆記重要 */}
        {focused ? null : <NoteTabs notes={notes} />}
        <div className="min-h-0 flex-1">{children}</div>
      </main>

      <QuickOpen notes={notes} />
      <KnowledgeIndexRepair />
    </div>
  );
}

/**
 * 「所有筆記」與「釘選」。
 *
 * 釘選不是另一個頁面，是網址上的篩選條件（`?pinned=1`），跟標籤走同一套 ——
 * 這樣可以加書籤，也不必為它多開一條路由與一份列表查詢。
 */
function NoteScopeLinks({
  counts,
  onNotesPage,
  compact,
}: {
  counts: NoteCounts;
  onNotesPage: boolean;
  compact: boolean;
}) {
  const searchParams = useSearchParams();
  const pinnedOnly = searchParams.get("pinned") === "1";
  const filtered = pinnedOnly || searchParams.get("tag") !== null;

  return (
    <>
      <RailLink
        href="/"
        label="所有筆記"
        count={counts.all}
        active={onNotesPage && !filtered}
        icon={<IconNotes size={17} />}
        compact={compact}
      />
      <RailLink
        href="/?pinned=1"
        label="釘選"
        count={counts.pinned}
        active={onNotesPage && pinnedOnly}
        icon={<IconPinned size={17} />}
        compact={compact}
      />
    </>
  );
}

function TagLinks({ tags, onNavigate }: { tags: TagSummary[]; onNavigate: () => void }) {
  const searchParams = useSearchParams();
  const activeTagId = searchParams.get("tag");

  return (
    <>
      {tags.map((tag) => (
        <TagRow
          key={tag.id}
          tag={tag}
          active={tag.id === activeTagId}
          onNavigate={onNavigate}
        />
      ))}
    </>
  );
}

/**
 * 側邊欄的一個標籤：點是篩選，右鍵是管理。
 *
 * 改名做成原地編輯而不是跳一個對話框 —— 改標籤名是「順手修正」等級的動作，
 * 不值得中斷整個畫面。
 */
function TagRow({
  tag,
  active,
  onNavigate,
}: {
  tag: TagSummary;
  active: boolean;
  onNavigate: () => void;
}) {
  const menu = useContextMenu();
  const [editing, setEditing] = useState(false);
  const [, startTagAction] = useTransition();

  function commit(name: string) {
    setEditing(false);
    if (name.trim() && name.trim() !== tag.name) {
      startTagAction(() => void renameTag(tag.id, name));
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={tag.name}
        maxLength={TAG_NAME_MAX_LENGTH}
        aria-label={`重新命名標籤 ${tag.name}`}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit(event.currentTarget.value);
          }
          if (event.key === "Escape") {
            setEditing(false);
          }
        }}
        className="h-9.5 rounded-md border border-accent bg-surface px-2.5 text-base outline-none"
      />
    );
  }

  return (
    <div onContextMenu={menu.openAtPointer}>
      <Link
        href={`/?tag=${tag.id}`}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`relative flex h-8 items-center gap-2 rounded-md px-2.5 text-sm transition-colors ${
          active ? "bg-active text-primary" : "text-secondary hover:bg-hover hover:text-primary"
        }`}
      >
        <IconTag size={14} className="shrink-0 opacity-70" />
        <span className="min-w-0 flex-1 truncate">{tag.name}</span>
        <span className="text-2xs text-muted tabular-nums">{tag.count}</span>
      </Link>

      {menu.position ? (
        <ContextMenu
          position={menu.position}
          onClose={menu.close}
          label={`標籤 ${tag.name}`}
          items={[
            { label: "重新命名", onSelect: () => setEditing(true) },
            {
              // 講清楚刪的是什麼：這是分類方式的調整，不是清理內容
              label: "刪除標籤（不會刪筆記）",
              danger: true,
              separated: true,
              onSelect: () => startTagAction(() => void deleteTag(tag.id)),
            },
          ]}
        />
      ) : null}
    </div>
  );
}

/**
 * 側邊欄的導覽項目。
 *
 * Active 用淡墨藍底加左側一條短的 accent，不用邊框 —— 邊框在一整排項目裡會
 * 互相干擾，底色與左側標記才看得出「現在在這裡」。
 */
function RailLink({
  href,
  label,
  count,
  active,
  icon,
  compact,
  hint,
}: {
  href: string;
  label: string;
  count?: number;
  active: boolean;
  icon: React.ReactNode;
  compact: boolean;
  hint?: string;
}) {
  const link = (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center rounded-md transition-colors duration-150 ${
        compact
          ? "h-10 w-full justify-center"
          : "h-[54px] w-full flex-col justify-center gap-0.5 px-1 text-sm"
      } ${
        active
          ? "bg-active font-medium text-primary"
          : "text-secondary hover:bg-hover hover:text-primary"
      }`}
    >
      {active ? (
        <span
          className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-gold"
          aria-hidden
        />
      ) : null}
      <span className="shrink-0">{icon}</span>
      {compact ? null : (
        <>
          <span className="max-w-full truncate">{label}</span>
          {/* 計數是參考資訊，壓到最輕 —— 它不該跟項目名稱競爭 */}
          {count === undefined ? null : (
            <span className="absolute top-0.5 right-1 shrink-0 text-2xs text-faint tabular-nums">
              {count}
            </span>
          )}
        </>
      )}
    </Link>
  );

  const tooltip = compact && count !== undefined ? `${label}（${count}）` : label;
  return (
    <Tooltip label={tooltip} shortcut={hint}>
      {link}
    </Tooltip>
  );
}

/** 送出表單的側邊欄項目（新增筆記）。 */
function SidebarAction({
  label,
  icon,
  compact,
  primary = false,
}: {
  label: string;
  icon: React.ReactNode;
  compact: boolean;
  primary?: boolean;
}) {
  return (
    <Tooltip label={label} className="w-full">
      <button
        type="submit"
        aria-label={label}
        className={`flex w-full items-center rounded-md transition-colors duration-150 ${
          compact ? "h-10 justify-center" : "h-[54px] flex-col justify-center gap-0.5 px-1 text-sm"
        } ${
          primary
            ? "bg-active text-primary shadow-[inset_2px_0_0_var(--accent-gold)]"
            : "text-secondary hover:bg-hover hover:text-primary"
        }`}
      >
        <span className="shrink-0">{icon}</span>
        {compact ? null : <span className="truncate font-medium">{label}</span>}
      </button>
    </Tooltip>
  );
}

function SidebarButton({
  label,
  icon,
  compact,
  active = false,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  compact: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip label={label} className="w-full">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`flex w-full items-center rounded-md transition-colors duration-150 ${
          compact ? "h-10 justify-center" : "h-[54px] flex-col justify-center gap-0.5 px-1 text-sm"
        } ${active ? "bg-active text-primary" : "text-secondary hover:bg-hover hover:text-primary"}`}
      >
        <span className="shrink-0">{icon}</span>
        {compact ? null : <span className="truncate">{label}</span>}
      </button>
    </Tooltip>
  );
}

/**
 * 設定。
 *
 * 主題、匯出、登出收在同一個選單裡，側邊欄底部就只剩方案卡與兩個 icon ——
 * 這些是一週用不到一次的東西，不該跟每天要用的導覽搶位置。
 */
/** 匯出是檔案下載而不是頁面導覽，所以觸發一個 `<a download>`，不要動 location。 */
function downloadExport() {
  const link = document.createElement("a");
  link.href = "/api/export";
  link.download = "";
  link.click();
}

function SettingsMenu({ compact }: { compact: boolean }) {
  const menu = useContextMenu();
  const [preference, choose] = useThemePreference();

  const themes: { value: ThemePreference; label: string }[] = [
    { value: "light", label: "淺色主題" },
    { value: "dark", label: "深色主題" },
    { value: "system", label: "跟隨瀏覽器" },
  ];

  return (
    <>
      <Tooltip label="設定">
        <button
          type="button"
          onClick={menu.openBelow}
          aria-label="設定"
          className={`flex items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-hover hover:text-primary ${
            compact ? "size-8" : "h-12 w-full flex-col gap-0.5 text-xs"
          }`}
        >
          <IconSettings size={16} />
          {compact ? null : <span>設定</span>}
        </button>
      </Tooltip>

      {menu.position ? (
        <ContextMenu
          position={menu.position}
          onClose={menu.close}
          label="設定"
          items={[
            ...themes.map((theme) => ({
              label: theme.label,
              hint: preference === theme.value ? "目前" : undefined,
              onSelect: () => choose(theme.value),
            })),
            {
              label: "匯出全部筆記",
              separated: true,
              onSelect: downloadExport,
            },
            {
              label: "登出",
              separated: true,
              danger: true,
              onSelect: () => void signOut(),
            },
          ]}
        />
      ) : null}
    </>
  );
}
