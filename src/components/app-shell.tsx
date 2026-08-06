"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { signOut } from "@/lib/actions/auth";
import { createNote } from "@/lib/actions/notes";
import type { NoteSummary, TagSummary } from "@/lib/note-display";

import { NoteList } from "./note-list";
import { ThemeToggle } from "./theme-toggle";

export type NoteCounts = {
  all: number;
  trashed: number;
};

/**
 * 桌機三欄版面：標籤側邊欄 ｜ 筆記列表 ｜ 編輯區。
 *
 * 手機是唯讀的兩層導覽，用同一份 DOM 靠 CSS 切換：沒開筆記時只顯示列表，
 * 開了筆記就只顯示內容。判斷依據是網址有沒有 /n/ 前綴。
 */
export function AppShell({
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
  const noteOpen = pathname.startsWith("/n/");

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const usedTags = tags.filter((tag) => tag.count > 0);

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

  return (
    <div className="flex h-dvh">
      <aside
        className={`w-56 shrink-0 flex-col border-r border-line bg-sidebar ${
          sidebarOpen ? "hidden lg:flex" : "hidden"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-sm font-semibold tracking-wide text-ink-muted">筆記</span>
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            {/* 一般 <a> 而不是 Link：這是檔案下載，不是頁面導覽 */}
            <a href="/api/export" download title="把全部筆記與附件打包下載" className="hover:text-accent">
              匯出
            </a>
            <span aria-hidden>·</span>
            <form action={signOut}>
              <button type="submit" className="hover:text-accent">
                登出
              </button>
            </form>
          </div>
        </div>

        <div className="px-5 pb-3">
          <ThemeToggle />
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4 text-sm">
          <SidebarLink href="/" label="全部" count={counts.all} active={pathname === "/"} />
          <SidebarLink
            href="/trash"
            label="垃圾桶"
            count={counts.trashed}
            active={pathname === "/trash"}
          />
          <div className="mt-4 px-3 pb-1 text-xs text-ink-muted">標籤</div>
          {/*
            計數 0 的標籤不列出來。點下去只會得到空列表，而且舊版留下的孤兒標籤
            會一直堆在這裡沒辦法清掉。
          */}
          {usedTags.length === 0 ? (
            <p className="px-3 py-1 text-xs text-ink-muted">還沒有標籤</p>
          ) : (
            <Suspense fallback={null}>
              <TagLinks tags={usedTags} />
            </Suspense>
          )}
        </nav>

        <form action={createNote} className="border-t border-line p-3">
          <button
            type="submit"
            className="w-full rounded-md bg-accent px-3 py-2 text-sm text-paper transition-opacity hover:opacity-90"
          >
            新增筆記
          </button>
        </form>
      </aside>

      <section
        className={`w-full shrink-0 flex-col border-r border-line bg-list md:flex md:w-72 ${
          noteOpen ? "hidden" : "flex"
        }`}
      >
        {/* useSearchParams 需要 Suspense 邊界 */}
        <Suspense fallback={<div className="flex-1" />}>
          <NoteList notes={notes} tags={tags} />
        </Suspense>

        {/* 側邊欄在小螢幕收起來了，新增按鈕改放這裡 */}
        <form action={createNote} className="border-t border-line p-3 lg:hidden">
          <button
            type="submit"
            className="w-full rounded-md bg-accent px-3 py-2 text-sm text-paper transition-opacity hover:opacity-90"
          >
            新增筆記
          </button>
        </form>
      </section>

      <main className={`flex-1 flex-col overflow-hidden md:flex ${noteOpen ? "flex" : "hidden"}`}>
        {children}
      </main>
    </div>
  );
}

function TagLinks({ tags }: { tags: TagSummary[] }) {
  const searchParams = useSearchParams();
  const activeTagId = searchParams.get("tag");

  return (
    <>
      {tags.map((tag) => (
        <SidebarLink
          key={tag.id}
          href={`/?tag=${tag.id}`}
          label={`#${tag.name}`}
          count={tag.count}
          active={tag.id === activeTagId}
        />
      ))}
    </>
  );
}

function SidebarLink({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between rounded-md px-3 py-1.5 ${
        active ? "bg-accent-soft text-accent" : "text-ink hover:bg-accent-soft/50"
      }`}
    >
      <span>{label}</span>
      <span className="font-mono text-xs text-ink-muted">{count}</span>
    </Link>
  );
}
