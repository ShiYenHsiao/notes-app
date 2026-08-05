/**
 * 桌機三欄版面的骨架：標籤側邊欄 ｜ 筆記列表 ｜ 編輯區（左右分割）。
 *
 * 目前是靜態骨架，用來確認版面與配色；M1 會把真實資料與編輯器接進來。
 * 手機是唯讀的兩層導覽，走另一條路徑，這個元件在小螢幕只顯示筆記列表那一欄。
 */
export function AppShell() {
  return (
    <div className="flex h-dvh">
      {/* 標籤欄 */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-sidebar lg:flex">
        <div className="px-5 py-4 text-sm font-semibold tracking-wide text-ink-muted">
          筆記
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4 text-sm">
          <SidebarItem label="全部" count={0} active />
          <SidebarItem label="釘選" count={0} />
          <div className="mt-4 px-3 pb-1 text-xs text-ink-muted">標籤</div>
          <p className="px-3 py-1 text-xs text-ink-muted">還沒有標籤</p>
          <div className="mt-4">
            <SidebarItem label="垃圾桶" count={0} />
          </div>
        </nav>
      </aside>

      {/* 筆記列表 */}
      <section className="flex w-full shrink-0 flex-col border-r border-line bg-sidebar/60 md:w-72">
        <div className="border-b border-line p-3">
          <input
            type="search"
            placeholder="搜尋筆記…"
            className="w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm outline-none placeholder:text-ink-muted focus:border-accent"
          />
        </div>
        <ul className="flex-1 overflow-y-auto">
          <li className="px-4 py-8 text-center text-sm text-ink-muted">還沒有筆記</li>
        </ul>
      </section>

      {/* 編輯區：左右分割 */}
      <main className="hidden flex-1 flex-col md:flex">
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 border-r border-line bg-surface p-6 font-mono text-sm text-ink-muted">
            {/* CodeMirror 6 會掛在這裡 */}
            Markdown 原始語法
          </div>
          <div className="flex-1 bg-paper p-6 text-ink-muted">
            {/* 渲染後的預覽 */}
            預覽
          </div>
        </div>
        <footer className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-ink-muted">
          <span>標籤列</span>
          <span>已儲存</span>
        </footer>
      </main>
    </div>
  );
}

function SidebarItem({
  label,
  count,
  active = false,
}: {
  label: string;
  count: number;
  active?: boolean;
}) {
  return (
    <a
      href="#"
      className={`flex items-center justify-between rounded-md px-3 py-1.5 ${
        active ? "bg-accent-soft text-accent" : "text-ink hover:bg-accent-soft/50"
      }`}
    >
      <span>{label}</span>
      <span className="font-mono text-xs text-ink-muted">{count}</span>
    </a>
  );
}
