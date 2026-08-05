/**
 * Supabase 在 2025 年把 API key 改名：舊專案的 dashboard 顯示 `anon` key，
 * 新專案顯示 `publishable` key。兩者用法相同，這裡兩種環境變數名都接受，
 * 免得照著不同版本的文件設定時對不上。
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * 環境變數是否齊全。還沒設定時 app 不會整個炸掉，而是顯示設定說明頁 —
 * 剛 clone 下來還沒建 Supabase 專案時 `npm run dev` 仍然跑得起來。
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && key);
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `缺少環境變數 ${name}。請複製 .env.example 成 .env.local 並填入 Supabase 專案的值。`,
    );
  }
  return value;
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", url);
}

export function supabasePublishableKey(): string {
  return required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key);
}
