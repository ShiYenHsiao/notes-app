"use client";

import { useEffect, useRef, useState } from "react";

import { headingAnchorId, type OutlineItem } from "./outline";

/**
 * 預覽區現在讀到哪一節。大綱靠它標出當前位置。
 *
 * 判斷方式是「最後一個已經捲過頂端的標題」，不是 IntersectionObserver ——
 * 章節長度差很多時，observer 的可見比例會在長章節裡整段都不觸發，
 * 而讀者要的答案很單純：我現在在哪個標題底下。
 */

/** 標題捲到距頂端這麼近就算「進入」那一節。 */
const ACTIVATION_OFFSET = 96;

export function useActiveHeading(
  container: React.RefObject<HTMLElement | null>,
  outline: OutlineItem[],
  enabled: boolean,
): number | null {
  const [active, setActive] = useState<number | null>(null);

  // 事件裡才用得到，不要讓它每次改字都重掛
  const outlineRef = useRef(outline);
  useEffect(() => {
    outlineRef.current = outline;
  }, [outline]);

  useEffect(() => {
    const element = container.current;
    if (!enabled || !element) {
      // 不清 state，直接在回傳時擋掉 —— 在 effect 裡 setState 會多繞一次渲染
      return;
    }

    let frame = 0;

    function measure() {
      frame = 0;
      const scroller = container.current;
      if (!scroller) {
        return;
      }

      const top = scroller.getBoundingClientRect().top + ACTIVATION_OFFSET;
      let current: number | null = null;

      for (const item of outlineRef.current) {
        const node = document.getElementById(headingAnchorId(item.index));
        if (node && node.getBoundingClientRect().top <= top) {
          current = item.index;
        }
      }

      setActive(current);
    }

    // 捲動每一幀都量會太貴，壓到一幀一次
    function onScroll() {
      if (frame === 0) {
        frame = requestAnimationFrame(measure);
      }
    }

    measure();
    element.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      element.removeEventListener("scroll", onScroll);
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
    };
  }, [container, enabled]);

  return enabled ? active : null;
}
