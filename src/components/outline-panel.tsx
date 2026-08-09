"use client";

import type { OutlineItem } from "@/lib/outline";

/**
 * 大綱面板。
 *
 * 法律筆記的層級很深（壹 → 一 → （一） → 1），捲動找章節是每天最花時間的動作之一。
 * 這裡只做一件事：把標題列出來、點了就跳。不做拖曳排序、不做摺疊 —— 那些是大綱編輯器
 * 的功能，這是導覽。
 *
 * **永遠掛著，用寬度收合**：收起時卸載的話沒有過場動畫，而且每次打開都要重新捲到頂。
 */
export function OutlinePanel({
  items,
  open,
  activeIndex,
  onSelect,
}: {
  items: OutlineItem[];
  open: boolean;
  /** 目前讀到哪一節。沒有預覽區可以判斷時是 null。 */
  activeIndex: number | null;
  onSelect: (item: OutlineItem) => void;
}) {
  return (
    <aside
      aria-label="大綱"
      aria-hidden={open ? undefined : true}
      className={`outline-panel hidden shrink-0 flex-col overflow-hidden border-l border-border-subtle bg-list transition-[width,opacity] duration-200 ease-out lg:absolute lg:inset-y-0 lg:right-0 lg:z-20 lg:flex lg:shadow-[var(--shadow-pop)] xl:static xl:z-auto xl:shadow-none ${
        open ? "w-[196px] opacity-100" : "pointer-events-none w-0 opacity-0"
      }`}
    >
      <div className="flex h-10 shrink-0 items-center border-b border-border-subtle px-3">
        <span className="text-sm font-semibold text-secondary">大綱</span>
      </div>

      {items.length === 0 ? (
        <p className="px-3 text-sm text-ink-muted">
          這篇還沒有標題。用 <code className="text-xs">#</code> 開頭建立章節。
        </p>
      ) : (
        /* 長大綱自己捲，不要把整個工作區撐長 */
        <nav className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
          {items.map((item) => {
            const active = item.index === activeIndex;

            return (
              <button
                key={item.index}
                type="button"
                onClick={() => onSelect(item)}
                title={item.text}
                aria-current={active ? "location" : undefined}
                /*
                 * 縮排代表層級，字級不跟著縮 —— 五層深的話字會小到看不見。
                 * h1 用比較重的字重跟其他層拉開。
                 */
                style={{ paddingLeft: `${(item.level - 1) * 12 + 10}px` }}
                className={`relative flex w-full items-center rounded-sm py-1.5 pr-2 text-left text-sm transition-colors duration-150 ${
                  active
                    ? "bg-transparent font-medium text-primary"
                    : item.level === 1
                      ? "font-medium text-secondary hover:bg-hover"
                      : "text-muted hover:bg-hover hover:text-primary"
                }`}
              >
                {/* 目前這一節在最左邊留一條短標記，掃一眼就知道讀到哪 */}
                {active ? (
                  <span
                    className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-gold"
                    aria-hidden
                  />
                ) : null}
                <span className="truncate">{item.text}</span>
              </button>
            );
          })}
        </nav>
      )}
    </aside>
  );
}
