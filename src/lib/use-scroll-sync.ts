"use client";

import { useEffect, useRef } from "react";

import type { EditorApi } from "@/components/markdown-editor";

import { headingAnchorId, type OutlineItem } from "./outline";
import { mapScroll, type ScrollAnchor } from "./scroll-sync";

/**
 * 分割模式下兩欄的捲動同步。
 *
 * 對應規則在 scroll-sync.ts（用標題當錨點，中間線性內插），這裡只負責接事件、
 * 量位置、以及避免兩邊互相推。
 */

/**
 * 我們捲動目標欄之後，它會送出一個 scroll 事件；那個事件不能再反推回來，
 * 否則兩邊會互相推。這段時間內只忽略**那一欄**的事件。
 *
 * 早期的版本用一個不分方向的時間鎖，結果是使用者連續捲動時每 120ms 才同步一次 ——
 * 看起來像卡住。回音是有方向的，鎖也必須有方向。
 */
const ECHO_GUARD_MS = 150;

/** 錨點的快取壽命。捲動時每一幀重量一次太貴，但內容一直在變也不能永久快取。 */
const ANCHOR_TTL_MS = 400;

export function useScrollSync(input: {
  editorApi: React.RefObject<EditorApi | null>;
  preview: React.RefObject<HTMLElement | null>;
  outline: OutlineItem[];
  /** 只有分割模式才需要同步；只看一邊的時候沒有對象。 */
  enabled: boolean;
}) {
  const { editorApi, preview, enabled } = input;

  // 錨點只在 scroll 事件裡用得到，所以放進 ref，不要讓它每次改字都重掛事件
  const outlineRef = useRef(input.outline);
  useEffect(() => {
    outlineRef.current = input.outline;
  }, [input.outline]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const editor = editorApi.current?.scroller();
    const previewEl = preview.current;
    if (!editor || !previewEl) {
      return;
    }

    /** 等一下要忽略哪一欄送來的回音，以及忽略到什麼時候。 */
    let echoFrom: HTMLElement | null = null;
    let echoUntil = 0;
    let cached: { anchors: ScrollAnchor[]; at: number } | null = null;

    /** 每個標題在兩邊各自的高度。左邊問編輯器，右邊量 DOM。 */
    function anchors(): ScrollAnchor[] {
      const now = performance.now();
      if (cached && now - cached.at < ANCHOR_TTL_MS) {
        return cached.anchors;
      }

      const previewTop = previewEl!.getBoundingClientRect().top - previewEl!.scrollTop;
      const found: ScrollAnchor[] = [];

      for (const item of outlineRef.current) {
        const source = editorApi.current?.lineTop(item.line);
        const element = document.getElementById(headingAnchorId(item.index));
        if (source == null || !element) {
          continue;
        }
        found.push({
          source,
          target: element.getBoundingClientRect().top - previewTop,
        });
      }

      cached = { anchors: found, at: now };
      return found;
    }

    function sync(from: HTMLElement, to: HTMLElement, invert: boolean) {
      const now = performance.now();

      // 這是我們自己捲出來的回音，吃掉它就好
      if (from === echoFrom && now < echoUntil) {
        echoFrom = null;
        return;
      }

      const pairs = anchors().map((anchor) =>
        invert ? { source: anchor.target, target: anchor.source } : anchor,
      );

      const next = mapScroll({
        anchors: pairs,
        sourceTop: from.scrollTop,
        sourceMax: from.scrollHeight - from.clientHeight,
        targetMax: to.scrollHeight - to.clientHeight,
      });

      // 差不到一個像素就別動，免得兩邊為了捨入誤差互相推
      if (Math.abs(to.scrollTop - next) < 1) {
        return;
      }

      echoFrom = to;
      echoUntil = now + ECHO_GUARD_MS;
      to.scrollTop = next;
    }

    const onEditorScroll = () => sync(editor, previewEl, false);
    const onPreviewScroll = () => sync(previewEl, editor, true);

    editor.addEventListener("scroll", onEditorScroll, { passive: true });
    previewEl.addEventListener("scroll", onPreviewScroll, { passive: true });

    return () => {
      editor.removeEventListener("scroll", onEditorScroll);
      previewEl.removeEventListener("scroll", onPreviewScroll);
    };
  }, [enabled, editorApi, preview]);
}
