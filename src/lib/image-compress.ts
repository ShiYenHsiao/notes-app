"use client";

/**
 * 上傳前在瀏覽器端壓縮圖片。
 *
 * 手機截圖動輒 2–3 MB，Supabase 免費方案只有 1 GB，不壓的話貼幾百張就滿了。
 * 轉成 WebP 通常能再省一半以上，而且所有現代瀏覽器都支援。
 */

/** 長邊超過這個數字就等比例縮小。3000 以上的解析度在筆記裡看不出差別。 */
const MAX_DIMENSION = 2000;

/** WebP 品質。0.82 在文字截圖上看不出壓縮痕跡。 */
const WEBP_QUALITY = 0.82;

export type CompressedImage = {
  blob: Blob;
  extension: string;
  mimeType: string;
};

/**
 * 壓縮並轉成 WebP。
 *
 * 動態圖（GIF）和向量圖（SVG）直接原樣回傳 —— 前者轉檔會只剩第一幀，
 * 後者轉點陣會糊掉，兩種都是把事情弄得更糟。
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    return {
      blob: file,
      extension: file.type === "image/gif" ? "gif" : "svg",
      mimeType: file.type,
    };
  }

  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return fallback(file);
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", WEBP_QUALITY);
  });

  // 轉檔失敗，或壓完反而更大（已經壓過的小圖會這樣），就用原檔。
  if (!blob || blob.size >= file.size) {
    return fallback(file);
  }

  return { blob, extension: "webp", mimeType: "image/webp" };
}

function fallback(file: File): CompressedImage {
  const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
  return { blob: file, extension, mimeType: file.type || "application/octet-stream" };
}
