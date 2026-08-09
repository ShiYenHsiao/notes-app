"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 右鍵選單。
 *
 * 右鍵與「⋯」按鈕共用同一個元件與同一份項目清單 —— 兩個入口跑出不同的選項是
 * 最容易累積的那種不一致，從結構上就不給它機會。
 *
 * 用 portal 掛到 body：筆記列表是 `overflow-y-auto` 的容器，選單直接畫在列裡面
 * 會被裁掉，靠 z-index 也救不回來。
 */
export type MenuItem = {
  label: string;
  onSelect: () => void;
  /** 右側的補充字：快捷鍵，或「目前」這種狀態標記。 */
  hint?: string;
  /** 破壞性動作，用紅色標示。 */
  danger?: boolean;
  /** 在這一項上面畫一條分隔線。 */
  separated?: boolean;
  disabled?: boolean;
};

export type MenuPosition = { x: number; y: number };

/** 選單離視窗邊緣至少留這麼多，才不會貼著邊。 */
const VIEWPORT_MARGIN = 8;

export function useContextMenu() {
  const [position, setPosition] = useState<MenuPosition | null>(null);

  /** 右鍵：開在游標的位置。 */
  const openAtPointer = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setPosition({ x: event.clientX, y: event.clientY });
  }, []);

  /** 「⋯」按鈕：開在按鈕下方，右緣對齊。 */
  const openBelow = useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setPosition({ x: rect.right, y: rect.bottom + 4 });
  }, []);

  const close = useCallback(() => setPosition(null), []);

  return { position, openAtPointer, openBelow, close, isOpen: position !== null };
}

export function ContextMenu({
  position,
  items,
  onClose,
  label,
}: {
  position: MenuPosition;
  items: MenuItem[];
  onClose: () => void;
  /** 給輔助技術用的選單名稱。 */
  label: string;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<MenuPosition>(position);

  // 量完真實尺寸再把超出視窗的部分拉回來。在瀏覽器繪製前做完，不會看到跳動。
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) {
      return;
    }

    const { width, height } = element.getBoundingClientRect();
    const maxX = window.innerWidth - width - VIEWPORT_MARGIN;
    const maxY = window.innerHeight - height - VIEWPORT_MARGIN;

    setPlacement({
      // 右緣對齊：選單往左長，所以先減掉自己的寬度
      x: Math.max(VIEWPORT_MARGIN, Math.min(position.x - width, maxX)),
      y: Math.max(VIEWPORT_MARGIN, Math.min(position.y, maxY)),
    });
  }, [position]);

  // 開啟時把焦點移進來，鍵盤才操作得到；關閉後還給原本的元素。
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    menu.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    // pointerdown 而不是 click：按下去的當下就關，跟系統選單的手感一致。
    function onPointerDown(event: PointerEvent) {
      if (!menu.current?.contains(event.target as Node)) {
        onClose();
      }
    }

    // 捲動或改變視窗大小時位置就不對了，直接關掉而不是追著跑。
    function onDismiss() {
      onClose();
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", onDismiss);
    window.addEventListener("scroll", onDismiss, true);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", onDismiss);
      window.removeEventListener("scroll", onDismiss, true);
    };
  }, [onClose]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    event.preventDefault();
    const buttons = Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [],
    );
    if (buttons.length === 0) {
      return;
    }

    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = (current + step + buttons.length) % buttons.length;
    buttons[next].focus();
  }

  return createPortal(
    <div
      ref={menu}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={{ left: placement.x, top: placement.y }}
      className="fixed z-50 min-w-[176px] rounded-md border border-border-default bg-elevated py-1.5 shadow-pop"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
          className={`flex w-full items-center gap-4 px-3 py-1.5 text-left text-sm transition-colors duration-150 disabled:opacity-40 ${
            item.separated ? "mt-1 border-t border-border-subtle pt-2" : ""
          } ${
            item.danger
              ? "text-danger hover:bg-danger-soft"
              : "text-secondary hover:bg-hover hover:text-primary"
          }`}
        >
          <span className="flex-1">{item.label}</span>
          {item.hint ? <span className="text-2xs text-ink-muted">{item.hint}</span> : null}
        </button>
      ))}
    </div>,
    document.body,
  );
}
