"use client";

import type { OutlineItem } from "@/lib/outline";

/**
 * 大綱面板。
 *
 * 法律筆記的層級很深（壹 → 一 → （一） → 1），捲動找章節是每天最花時間的動作之一。
 * 這裡只做一件事：把標題列出來、點了就跳。不做拖曳排序、不做摺疊 —— 那些是大綱編輯器
 * 的功能，這是導覽。
 */
export function OutlinePanel({
  items,
  onSelect,
}: {
  items: OutlineItem[];
  onSelect: (item: OutlineItem) => void;
}) {
  return (
    <aside
      aria-label="大綱"
      className="hidden w-[200px] shrink-0 flex-col border-l border-line bg-rail/60 lg:flex"
    >
      <div className="shrink-0 px-3 pt-3 pb-1.5">
        <span className="eyebrow">大綱</span>
      </div>

      {items.length === 0 ? (
        <p className="px-3 text-sm text-ink-muted">
          這篇還沒有標題。用 <code className="text-xs">#</code> 開頭建立章節。
        </p>
      ) : (
        <nav className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
          {items.map((item) => (
            <button
              key={item.index}
              type="button"
              onClick={() => onSelect(item)}
              title={item.text}
              /*
               * 縮排代表層級，字級不跟著縮 —— 五層深的話字會小到看不見。
               * h1 用比較重的字重跟其他層拉開。
               */
              style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
              className={`flex w-full items-center rounded-md py-1.5 pr-2 text-left text-sm transition-colors duration-150 hover:bg-accent-soft hover:text-accent ${
                item.level === 1 ? "font-semibold text-ink" : "text-ink-muted"
              }`}
            >
              <span className="truncate">{item.text}</span>
            </button>
          ))}
        </nav>
      )}
    </aside>
  );
}
