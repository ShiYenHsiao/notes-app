"use client";

import { useSyncExternalStore } from "react";

import { applyTheme, readStoredTheme, storeTheme, type ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; title: string }[] = [
  { value: "light", label: "淺", title: "淺色" },
  { value: "dark", label: "深", title: "深色" },
  { value: "system", label: "自動", title: "跟隨系統" },
];

// 同一個分頁裡的切換要通知到所有訂閱者，storage 事件只跨分頁不跨元件。
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** 伺服器端讀不到 localStorage，先當作跟隨系統，掛載後 React 會自動校正。 */
function getServerSnapshot(): ThemePreference {
  return "system";
}

/**
 * 主題切換。
 *
 * 「跟隨系統」在 Chrome 上跟的是瀏覽器自己的外觀設定（chrome://settings/appearance），
 * 不見得等於作業系統的設定 —— 這正是需要手動選項的原因。
 */
export function ThemeToggle() {
  const preference = useSyncExternalStore(subscribe, readStoredTheme, getServerSnapshot);

  function choose(next: ThemePreference) {
    storeTheme(next);
    applyTheme(next);
    for (const listener of listeners) {
      listener();
    }
  }

  return (
    <div
      className="flex items-center gap-0.5 rounded-[3px] border border-line p-0.5"
      role="group"
      aria-label="主題"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-pressed={preference === option.value}
          onClick={() => choose(option.value)}
          className={`flex-1 rounded-[2px] px-2 py-1 text-[10px] font-medium transition-colors ${
            preference === option.value
              ? "bg-accent-soft text-accent"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
