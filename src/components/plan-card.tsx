import Link from "next/link";

/**
 * 工具 rail 底部的額度提示。
 *
 * 免費方案的額度是真的：Supabase 免費方案 500 MB 資料庫，這個數字是自己給自己的
 * 提醒，不是促銷。Reference 的窄 rail 放不下方案卡，因此只留下真實的篇數與細進度線，
 * 點擊仍前往使用說明，不創造不存在的付費入口。
 */
const PLAN_LIMIT = 100;

export function PlanCard({ used }: { used: number }) {
  const ratio = Math.min(used / PLAN_LIMIT, 1);
  const nearLimit = ratio >= 0.8;

  return (
    <Link
      href="/help"
      aria-label={`已使用 ${used} / ${PLAN_LIMIT} 篇筆記額度`}
      className="grid gap-1 px-1.5 py-1 text-center text-2xs text-muted transition-colors hover:text-primary"
    >
      <span className="tabular-nums">
        {used} / {PLAN_LIMIT}
        {nearLimit ? <span className="ml-1 text-gold">快滿</span> : null}
      </span>
      <span className="h-px overflow-hidden bg-border-subtle">
        <span
          className="block h-full bg-gold transition-[width] duration-200"
          style={{ width: `${Math.max(ratio * 100, 2)}%` }}
        />
      </span>
    </Link>
  );
}
