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
 * 桌機三欄版面：側邊欄 ｜ 筆記列表 ｜ 編輯區。
 *
 * 側邊欄兩個主題下都是深綠（沿用 NEXUM 的做法）—— 它是整個版面的視覺錨點，
 * 跟著主題變淺就沒有重量了。
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
        className={`w-[236px] shrink-0 flex-col bg-rail px-4 pt-6 pb-4 text-rail-ink ${
          sidebarOpen ? "hidden lg:flex" : "hidden"
        }`}
      >
        <div className="flex items-center gap-3 border-b border-rail-line px-2.5 pb-7">
          <span
            className="grid size-[38px] place-items-center border border-gold text-[23px] text-gold"
            style={{ fontFamily: "var(--font-serif)" }}
            aria-hidden
          >
            筆
          </span>
          <span className="grid gap-px">
            <b
              className="text-[19px] tracking-[0.13em] text-rail-ink-strong"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              筆記
            </b>
            <small className="text-[8px] tracking-[0.19em] text-rail-ink/70">NOTES</small>
          </span>
        </div>

        <nav className="grid gap-0.5 pt-5">
          <RailLink href="/" label="全部" count={counts.all} active={pathname === "/"} />
          <RailLink
            href="/trash"
            label="垃圾桶"
            count={counts.trashed}
            active={pathname === "/trash"}
          />
        </nav>

        <div className="mt-6 px-3 pb-1.5">
          <span className="eyebrow">TAGS</span>
        </div>
        {usedTags.length === 0 ? (
          <p className="px-3 text-[10px] text-rail-ink/60">還沒有標籤</p>
        ) : (
          <nav className="grid gap-0.5 overflow-y-auto">
            <Suspense fallback={null}>
              <TagLinks tags={usedTags} />
            </Suspense>
          </nav>
        )}

        <form action={createNote} className="mt-6">
          <button
            type="submit"
            className="w-full rounded-[3px] border border-gold bg-gold/15 px-3 py-2.5 text-[11px] font-bold tracking-wide text-gold transition-colors hover:bg-gold/25"
          >
            新增筆記
          </button>
        </form>

        <div className="mt-auto grid gap-3 border-t border-rail-line pt-3.5">
          <ThemeToggle />
          <div className="flex items-center gap-2 px-1 text-[10px] text-rail-ink/70">
            {/* 一般 <a> 而不是 Link：這是檔案下載，不是頁面導覽 */}
            <a href="/api/export" download title="把全部筆記與附件打包下載" className="hover:text-gold">
              匯出
            </a>
            <span aria-hidden>·</span>
            <form action={signOut}>
              <button type="submit" className="hover:text-gold">
                登出
              </button>
            </form>
          </div>
        </div>
      </aside>

      <section
        className={`w-full shrink-0 flex-col border-r border-line bg-list md:flex md:w-[300px] ${
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
            className="w-full rounded-[3px] border border-accent bg-accent px-3 py-2.5 text-[11px] font-bold text-white"
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
          label={`#${tag.name}`}
          count={tag.count}
          active={tag.id === activeTagId}
        />
      ))}
    </>
  );
}

/**
 * 側邊欄的項目。
 * 作用中的那項靠左側 2px 金色標線標示 —— 不用整塊反白，安靜但看得見。
 */
function RailLink({
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
      className={`flex items-center gap-3 rounded-[3px] border-l-2 px-3 py-2.5 text-[13px] transition-colors ${
        active
          ? "border-l-gold bg-rail-hover text-rail-ink-strong"
          : "border-l-transparent text-rail-ink hover:bg-rail-hover hover:text-rail-ink-strong"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="ml-auto text-[9px] text-rail-ink/60">{count}</span>
    </Link>
  );
}
