export default function EmptyState() {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div className="grid justify-items-center gap-3">
        <span
          className="grid size-12 place-items-center border border-line text-[26px] text-ink-muted"
          style={{ fontFamily: "var(--font-serif)" }}
          aria-hidden
        >
          筆
        </span>
        <p className="text-[12px] text-ink-muted">從左邊選一篇筆記，或新增一篇。</p>
      </div>
    </div>
  );
}
