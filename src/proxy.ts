import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/env";

/** 不需要登入就能開啟的路徑。 */
const PUBLIC_PATHS = ["/login", "/auth"];

/**
 * Next.js 16 把 `middleware.ts` 改名為 `proxy.ts`（功能相同）。
 *
 * 這裡只做兩件事：更新即將過期的 session cookie，以及把未登入的人樂觀導向登入頁。
 * 真正的授權檢查在頁面與 Server Action 裡用 `supabase.auth.getUser()` 各自再做一次 —
 * Next.js 明確建議不要把 proxy 當成唯一的授權關卡。
 */
export async function proxy(request: NextRequest) {
  // 還沒設定 Supabase 時直接放行，讓首頁顯示設定說明而不是無限導向登入頁。
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // 這組 header 會禁止 CDN 快取帶有 auth cookie 的回應，
        // 少了它有機率把某個人的 session 發給另一個人。
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // 必須呼叫 getUser()（而非 getSession()）才會真的去驗證並更新 token。
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 重要：必須回傳上面那個 response 物件，否則 supabase 寫入的 cookie 會遺失。
  return response;
}

export const config = {
  matcher: [
    // 排除靜態資源與圖片最佳化，否則 CSS/JS 也會被上面的登入判斷擋掉。
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
