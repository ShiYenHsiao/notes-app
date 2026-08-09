/**
 * NEXUM 的品牌識別。
 *
 * 標誌是一個幾何化的 N，兩端各有一個節點 —— NEXUM 取自 nexus（連結、樞紐），
 * 講的是把零散的爭點與學說串成自己的知識系統。刻意不用書本、法槌、天秤那類
 * 圖示：那是法律模板的長相，不是工具的長相。
 */

export function NexumMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6.5 18.5V5.5L17.5 18.5V5.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6.5" cy="5.5" r="2.1" fill="currentColor" />
      <circle cx="17.5" cy="18.5" r="2.1" fill="currentColor" />
    </svg>
  );
}

/**
 * 方塊版的標誌，給側邊欄與登入頁那種需要一個「品牌方塊」的位置用。
 */
export function NexumBadge({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-md border border-gold/35 bg-action text-white shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent-fill)_72%,black)] ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <NexumMark size={Math.round(size * 0.62)} />
    </span>
  );
}

/**
 * 文字標。NEXUM 用字距拉開做出銘刻感，NOTE 退到次要 —— 產品叫 NEXUM NOTE，
 * 但品牌是 NEXUM。
 */
export function NexumWordmark({ className }: { className?: string }) {
  return (
    <span className={`flex min-w-0 flex-col leading-tight ${className ?? ""}`}>
      <b className="truncate text-base font-semibold tracking-[0.16em] text-primary">NEXUM</b>
      <span className="truncate text-2xs font-medium tracking-[0.24em] text-gold">NOTE</span>
    </span>
  );
}
