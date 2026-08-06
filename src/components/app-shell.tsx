"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOut } from "@/lib/actions/auth";
import { createNote } from "@/lib/actions/notes";
import type { NoteSummary } from "@/lib/note-display";

import { NoteList } from "./note-list";

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
  children,
}: {
  counts: NoteCounts;
  notes: NoteSummary[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const noteOpen = pathname.startsWith("/n/");

  return (
    <div className="flex h-dvh">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-sidebar lg:flex">
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-sm font-semibold tracking-wide text-ink-muted">筆記</span>
          <form action={signOut}>
            <button type="submit" className="text-xs text-ink-muted hover:text-accent">
              登出
            </button>
          </form>
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
          <p className="px-3 py-1 text-xs text-ink-muted">M2 才會做</p>
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
        className={`w-full shrink-0 flex-col border-r border-line bg-sidebar/60 md:flex md:w-72 ${
          noteOpen ? "hidden" : "flex"
        }`}
      >
        <NoteList notes={notes} />

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
