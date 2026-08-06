"use client";

import { useCallback, useEffect, useRef } from "react";

import { recordAttachment } from "@/lib/actions/attachments";
import { compressImage } from "@/lib/image-compress";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "attachments";

/** 對齊 bucket 上設的 file_size_limit。 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type UploadHandlers = {
  /** 上傳開始時呼叫，回傳的字串會被插進編輯器當佔位文字。 */
  onStart: (placeholder: string) => void;
  /** 上傳結束時把佔位文字換成最終的 Markdown（失敗則換成錯誤提示）。 */
  onFinish: (placeholder: string, replacement: string) => void;
};

/**
 * 圖片上傳。
 *
 * 檔案由瀏覽器直接送到 Supabase Storage，不經過我們的伺服器 ——
 * Server Action 有 body 大小限制，而且把幾 MB 的圖繞一圈只是白費頻寬。
 */
export function useImageUpload(noteId: string, userId: string, handlers: UploadHandlers) {
  // 把 handlers 收進 ref，呼叫端就不必為了維持識別而包 useMemo。
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  return useCallback(
    async (files: File[]) => {
      const handlers = handlersRef.current;

      const images = files.filter((file) => file.type.startsWith("image/"));

      for (const file of images) {
        // 佔位文字要夠獨特，之後才找得回來換掉。
        // 刻意用純文字而不是 ![](): 空的圖片語法會在預覽區變成 <img src="">，
        // 瀏覽器會因此重新下載整頁，React 也會警告。
        const token = crypto.randomUUID().slice(0, 8);
        const placeholder = `⏳ 上傳中… ${token}`;

        handlers.onStart(placeholder);

        try {
          const compressed = await compressImage(file);

          if (compressed.blob.size > MAX_UPLOAD_BYTES) {
            handlers.onFinish(placeholder, `<!-- 圖片太大（超過 10 MB），沒有上傳 -->`);
            continue;
          }

          // 路徑第一層必須是 user id，Storage 的 RLS policy 靠這個判斷擁有者。
          const path = `${userId}/${crypto.randomUUID()}.${compressed.extension}`;

          const supabase = createClient();
          const { error } = await supabase.storage.from(BUCKET).upload(path, compressed.blob, {
            contentType: compressed.mimeType,
            cacheControl: "31536000",
          });

          if (error) {
            handlers.onFinish(placeholder, `<!-- 上傳失敗：${error.message} -->`);
            continue;
          }

          const {
            data: { publicUrl },
          } = supabase.storage.from(BUCKET).getPublicUrl(path);

          await recordAttachment({
            noteId,
            storagePath: path,
            filename: file.name,
            size: compressed.blob.size,
            mimeType: compressed.mimeType,
          });

          const alt = file.name.replace(/\.[^.]+$/, "");
          handlers.onFinish(placeholder, `![${alt}](${publicUrl})`);
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "未知錯誤";
          handlers.onFinish(placeholder, `<!-- 上傳失敗：${message} -->`);
        }
      }
    },
    [noteId, userId],
  );
}
