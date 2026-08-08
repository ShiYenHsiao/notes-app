import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { supabaseServiceRoleKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * 略過 RLS 的 client。**只給排程工作用。**
 *
 * 一般的請求一律走 `createClient()`（帶 cookie、受 RLS 保護）。排程沒有登入的
 * 使用者，卻要跨帳號刪掉過期的垃圾桶內容，那是唯一需要 service role 的情境。
 *
 * `server-only` 這個 import 是防線：一旦有人在 client component 裡引用到這支，
 * build 就會失敗，而不是把最高權限的 key 打包進瀏覽器。
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: {
      // 沒有使用者，也不需要保存或更新任何 session
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
