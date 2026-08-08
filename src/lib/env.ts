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

/*
 * 以下兩個只給排程工作用，永遠不會出現在瀏覽器端 —— 名字沒有 NEXT_PUBLIC_ 前綴，
 * Next.js 就不會把它們打包進 client bundle。
 */

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * 清理排程需要略過 RLS：它沒有登入的使用者，卻要跨帳號刪掉過期的垃圾桶內容。
 * **這把 key 等於資料庫的最高權限**，只在 route handler 裡用，絕不能傳到瀏覽器。
 */
export function supabaseServiceRoleKey(): string {
  return required("SUPABASE_SERVICE_ROLE_KEY", serviceRoleKey);
}

export function hasServiceRoleKey(): boolean {
  return Boolean(serviceRoleKey);
}

/**
 * 排程端點的通行碼。Vercel Cron 會自動帶上 `Authorization: Bearer $CRON_SECRET`。
 * 沒設定的話那個端點一律拒絕 —— 一個誰都能呼叫的刪除端點比沒有排程還糟。
 */
export function cronSecret(): string | undefined {
  return process.env.CRON_SECRET;
}
