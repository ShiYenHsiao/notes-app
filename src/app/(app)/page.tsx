import { NexumMark } from "@/components/logo";
import { createNote } from "@/lib/actions/notes";

/**
 * 沒有開任何筆記時的工作區。
 *
 * 空狀態要做的是「給下一步」而不是「說明現在沒東西」，所以中央就一個品牌標記、
 * 一句話、一個按鈕。快捷鍵總覽與 Markdown 語法都在使用說明頁，不放這裡搶注意力。
 */
export default function EmptyState() {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div className="grid max-w-sm justify-items-center gap-4">
        <NexumMark size={40} className="text-accent opacity-90" />

        <div className="grid gap-1.5">
          <p className="text-lg font-medium">開始建立你的法律知識庫</p>
          <p className="text-sm text-ink-muted">
            從左邊選一篇筆記，或新增一篇。爭點、學說、實務見解都放進來，之後用標籤與搜尋找回去。
          </p>
        </div>

        <form action={createNote}>
          <button
            type="submit"
            className="rounded-md bg-action px-4 py-2 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90"
          >
            新增第一篇筆記
          </button>
        </form>
      </div>
    </div>
  );
}
