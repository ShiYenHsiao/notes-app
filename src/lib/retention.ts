/**
 * 垃圾桶的保留規則。
 *
 * 純函式，測試不必連資料庫。真正的刪除在 lib/purge.ts。
 */

/** 丟進垃圾桶超過這麼多天就真的刪掉。跟 migration 裡那支 SQL 函式同一個數字。 */
export const TRASH_RETENTION_DAYS = 30;

/** 比這個時間更早被丟掉的就過期了。 */
export function expiryCutoff(now: Date): string {
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return cutoff.toISOString();
}

/**
 * Storage 的 remove() 一次不吃太多路徑，切成批次送。
 *
 * 一次刪一個檔案也可以，但每個檔案一趟 HTTP 對免費方案是不必要的浪費 ——
 * 一篇筆記可能有幾十張截圖。
 */
export const STORAGE_BATCH_SIZE = 100;

export function batchPaths(paths: string[], size = STORAGE_BATCH_SIZE): string[][] {
  const batches: string[][] = [];

  for (let i = 0; i < paths.length; i += size) {
    batches.push(paths.slice(i, i + size));
  }

  return batches;
}
