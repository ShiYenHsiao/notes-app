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
      className="flex items-center gap-px rounded-md border border-line p-0.5"
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
          className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
            preference === option.value
              ? "bg-accent-soft text-accent"
              : "text-ink-muted hover:text-accent"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
