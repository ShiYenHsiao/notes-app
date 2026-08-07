"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 共用的 tooltip。
 *
 * 工具列、側邊欄的 icon 按鈕都走這一個 —— 原本各自用瀏覽器內建的 `title`，
 * 那個沒辦法排版（功能名稱與快捷鍵擠成一行）、延遲由作業系統決定（Mac 上要等一秒多），
 * 也吃不到主題色。
 *
 * 仍然保留 `aria-label` 給輔助技術：tooltip 是滑鼠的輔助，不是無障礙資訊的來源。
 */

/** 滑上去多久才出現。太短會在移動滑鼠時整排閃，太長就等不到。 */
const OPEN_DELAY_MS = 350;

/** 離觸發元素多遠。 */
const GAP = 8;

/** 貼齊視窗邊緣時至少留這麼多。 */
const VIEWPORT_MARGIN = 8;

type Placement = { x: number; y: number; below: boolean };

export function Tooltip({
  label,
  shortcut,
  children,
  className,
}: {
  label: string;
  /** 快捷鍵，例如 `⌘B`。沒有就不顯示那一行。 */
  shortcut?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  // 出現後才加上位移動畫的終點，不然第一幀就已經在定位上，看不到 fade + translate
  const [shown, setShown] = useState(false);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const show = useCallback(
    (immediate = false) => {
      cancel();
      const start = () => {
        const rect = anchor.current?.getBoundingClientRect();
        if (!rect) {
          return;
        }
        // 上方放不下就翻到下面，工具列貼著視窗頂端時就是這種情況
        const below = rect.top < 56;
        setPlacement({
          x: rect.left + rect.width / 2,
          y: below ? rect.bottom + GAP : rect.top - GAP,
          below,
        });
        setOpen(true);
      };

      if (immediate) {
        start();
      } else {
        timer.current = setTimeout(start, OPEN_DELAY_MS);
      }
    },
    [cancel],
  );

  const hide = useCallback(() => {
    cancel();
    setOpen(false);
    setShown(false);
  }, [cancel]);

  useEffect(() => cancel, [cancel]);

  // 量完寬度再置中並收進視窗內
  useLayoutEffect(() => {
    if (!open || !bubble.current || !placement) {
      return;
    }

    const { width } = bubble.current.getBoundingClientRect();
    const half = width / 2;
    const min = VIEWPORT_MARGIN + half;
    const max = window.innerWidth - VIEWPORT_MARGIN - half;
    const clamped = Math.min(Math.max(placement.x, min), max);

    if (clamped !== placement.x) {
      setPlacement({ ...placement, x: clamped });
    }
    setShown(true);
  }, [open, placement]);

  // Esc 關掉。鍵盤操作時 tooltip 會跟著焦點出現，總要有辦法趕走它。
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hide();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, hide]);

  return (
    <span
      ref={anchor}
      className={`inline-flex ${className ?? ""}`}
      onPointerEnter={() => show()}
      onPointerLeave={hide}
      onPointerDown={hide}
      // 鍵盤走到這裡時立刻顯示，不用等延遲 —— 那個延遲是為了防滑鼠掃過
      onFocusCapture={() => show(true)}
      onBlurCapture={hide}
    >
      {children}

      {open && placement
        ? createPortal(
            <div
              ref={bubble}
              role="tooltip"
              style={{
                left: placement.x,
                top: placement.y,
                transform: `translate(-50%, ${placement.below ? "0" : "-100%"}) translateY(${
                  shown ? "0" : placement.below ? "-3px" : "3px"
                })`,
                opacity: shown ? 1 : 0,
              }}
              className="pointer-events-none fixed z-[60] grid gap-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-center leading-none whitespace-nowrap shadow-pop transition-[opacity,transform] duration-150 ease-out"
            >
              <span className="text-xs text-ink">{label}</span>
              {shortcut ? (
                <kbd className="font-sans text-2xs tracking-wider text-ink-muted">{shortcut}</kbd>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
