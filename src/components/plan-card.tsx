import Link from "next/link";

/**
 * 側邊欄底部的方案卡。
 *
 * 免費方案的額度是真的：Supabase 免費方案 500 MB 資料庫，這個數字是自己給自己的
 * 提醒，不是促銷。所以它長得像儀表而不是廣告 —— 淡墨藍底、細金線、沒有按鈕樣式的
 * CTA，只有一行可以點的文字。
 */
const PLAN_LIMIT = 100;

export function PlanCard({ used }: { used: number }) {
  const ratio = Math.min(used / PLAN_LIMIT, 1);
  const nearLimit = ratio >= 0.8;

  return (
    <div className="grid gap-2 rounded-md border border-line bg-accent-soft/60 px-3 py-2.5">
      <div className="flex items-baseline gap-1.5">
        <b className="text-xs font-semibold tracking-[0.14em] text-accent">NEXUM</b>
        <span className="text-2xs tracking-wider text-gold">Scholar Free</span>
      </div>

      <div className="grid gap-1">
        <div className="flex items-baseline justify-between text-2xs text-ink-muted">
          <span className="tabular-nums">
            {used} / {PLAN_LIMIT} 篇筆記
          </span>
          {nearLimit ? <span className="text-gold">快滿了</span> : null}
        </div>

        {/* 進度條用金色，跟介面裡代表「操作」的墨藍分開 */}
        <div className="h-1 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-gold transition-[width] duration-200"
            style={{ width: `${Math.max(ratio * 100, 2)}%` }}
          />
        </div>
      </div>

      {/*
        指到使用說明的「方案與額度」那一節，不是購買頁 —— 目前只有一種方案，
        做一個假的付費入口只會消耗信任。react-markdown 沒有產生標題 id，
        所以不用錨點，直接連到說明頁。
      */}
      <Link
        href="/help"
        className="text-2xs text-accent transition-opacity duration-150 hover:opacity-70"
      >
        升級方案 →
      </Link>
    </div>
  );
}
