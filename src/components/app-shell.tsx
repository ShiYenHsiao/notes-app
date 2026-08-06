"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { signOut } from "@/lib/actions/auth";
import { createNote } from "@/lib/actions/notes";
import type { NoteSummary, TagSummary } from "@/lib/note-display";

import { IconBook } from "./icons";
import { NoteList } from "./note-list";
import { ThemeToggle } from "./theme-toggle";

export type NoteCounts = {
  all: number;
  trashed: number;
};

/**
 * 桌機三欄版面：側邊欄 ｜ 筆記列表 ｜ 編輯區。
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
  // 手機是兩層導覽：主工作區有東西時就把列表收起來。說明頁跟筆記一樣算「有東西」。
  const noteOpen = pathname.startsWith("/n/") || pathname === "/help";

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
      {/*
        側邊欄與列表用固定寬度、主工作區吃剩下的空間。
        側邊欄自己是 flex column：中段捲動、底部工具區不捲，
        這樣標籤多到爆的時候主題切換與登出仍然看得到。
      */}
      <aside
        className={`w-[216px] shrink-0 flex-col border-r border-line bg-rail px-2.5 pt-4 pb-3 ${
          sidebarOpen ? "hidden lg:flex" : "hidden"
        }`}
      >
        <div className="flex items-center gap-2 px-2 pb-4">
          <span
            className="grid size-6 place-items-center rounded-[3px] bg-accent text-[13px] text-white"
            style={{ fontFamily: "var(--font-serif)" }}
            aria-hidden
          >
            筆
          </span>
          <b className="text-[13px] font-semibold">筆記</b>
        </div>

        <form action={createNote} className="px-1 pb-3">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-[13px] text-ink-muted transition-colors hover:bg-accent-soft hover:text-accent"
          >
            <span className="text-[15px] leading-none">＋</span>
            新增筆記
          </button>
        </form>

        {/* 中段獨立捲動：標籤再多也不會把下面的工具區推出畫面 */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <nav className="grid gap-px">
            <RailLink href="/" label="全部" count={counts.all} active={pathname === "/"} />
            <RailLink
              href="/trash"
              label="垃圾桶"
              count={counts.trashed}
              active={pathname === "/trash"}
            />
            <RailLink href="/help" label="使用說明" active={pathname === "/help"} builtIn />
          </nav>

          <div className="mt-5 px-3 pb-1">
            <span className="eyebrow">標籤</span>
          </div>
          {usedTags.length === 0 ? (
            <p className="px-3 text-[11px] text-ink-muted">還沒有標籤</p>
          ) : (
            <nav className="grid gap-px">
              <Suspense fallback={null}>
                <TagLinks tags={usedTags} />
              </Suspense>
            </nav>
          )}
        </div>

        <div className="grid shrink-0 gap-2 border-t border-line pt-3">
          <ThemeToggle />
          <div className="flex items-center gap-2 px-2 text-[11px] text-ink-muted">
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
      </aside>

      <section
        className={`w-full shrink-0 flex-col border-r border-line bg-list md:flex md:w-[288px] ${
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
            className="w-full rounded-[3px] bg-accent px-3 py-2.5 text-[12px] font-semibold text-white"
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
        <RailLink
          key={tag.id}
          href={`/?tag=${tag.id}`}
          label={`# ${tag.name}`}
          count={tag.count}
          active={tag.id === activeTagId}
        />
      ))}
    </>
  );
}

function RailLink({
  href,
  label,
  count,
  active,
  builtIn = false,
}: {
  href: string;
  label: string;
  /** 內建頁面沒有計數。 */
  count?: number;
  active: boolean;
  /** 內建頁面，不是使用者的筆記。用一個安靜的標記區隔。 */
  builtIn?: boolean;
}) {
  return (
    <Link
      href={href}
      title={builtIn ? `${label}（內建頁面）` : label}
      className={`flex items-center gap-2 rounded-[3px] px-3 py-1.5 text-[13px] transition-colors ${
        active ? "bg-accent-soft font-medium text-accent" : "text-ink hover:bg-accent-soft/60"
      }`}
    >
      {builtIn ? <IconBook size={13} className="shrink-0 opacity-70" /> : null}
      <span className="truncate">{label}</span>
      {count === undefined ? null : (
        <span className="ml-auto text-[10px] text-ink-muted">{count}</span>
      )}
    </Link>
  );
}
