import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { supabasePublishableKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * 伺服器端的 Supabase client，用於 Server Component、Server Action 與 Route Handler。
 * Next.js 15 起 `cookies()` 是非同步的，所以這個函式必須 await。
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component 不能寫 cookie。session 的更新由 proxy.ts 負責，
          // 所以這裡吞掉錯誤是安全的。
        }
      },
    },
  });
}
