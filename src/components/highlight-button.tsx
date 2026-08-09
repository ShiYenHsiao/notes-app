"use client";

import { useEffect, useRef, useState } from "react";

import { IconHighlight } from "./icons";
import type { EditorApi, HighlightColor } from "./markdown-editor";
import { Tooltip } from "./tooltip";

/** 四色與各自的用途建議。顏色本身取自 CSS 變數，深淺主題會自動跟著換。 */
const COLORS: { value?: HighlightColor; label: string; token: string }[] = [
  { value: undefined, label: "黃　要件", token: "--hl-yellow" },
  { value: "g", label: "綠　例外", token: "--hl-green" },
  { value: "p", label: "粉　實務見解", token: "--hl-pink" },
  { value: "b", label: "藍　自己的疑問", token: "--hl-blue" },
];

/**
 * 螢光筆按鈕。
 *
 * 直接按是黃色（跟 ⌘⇧H 一致），按右側的小箭頭才展開選色 ——
 * 最常用的那個不該多花一次點擊。
 */
export function HighlightButton({ api }: { api: React.RefObject<EditorApi | null> }) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);

  // 點到別的地方就收起來
  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (!host.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function apply(color?: HighlightColor) {
    api.current?.applyHighlight(color);
    setOpen(false);
  }

  return (
    <div ref={host} className="relative flex items-center">
      <Tooltip label="螢光筆" shortcut="⌘⇧H">
        <button
          type="button"
          aria-label="螢光筆"
          onClick={() => apply(undefined)}
          className="flex size-7 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-hover hover:text-primary"
        >
          <IconHighlight />
        </button>
      </Tooltip>

      <Tooltip label="選顏色">
        <button
          type="button"
          aria-label="選螢光筆顏色"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex h-7 w-3.5 items-center justify-center rounded-md text-2xs text-muted transition-colors duration-150 hover:bg-hover hover:text-primary"
        >
          ▾
        </button>
      </Tooltip>

      {open ? (
        <div className="absolute top-8 left-0 z-20 w-44 rounded-md border border-border-default bg-elevated py-1 shadow-pop">
          {COLORS.map((color) => (
            <button
              key={color.label}
              type="button"
              onClick={() => apply(color.value)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-primary transition-colors duration-150 hover:bg-hover"
            >
              <span
                className="size-3.5 shrink-0 rounded-sm border border-line"
                style={{ background: `var(${color.token})` }}
                aria-hidden
              />
              {color.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
