import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Magic link 的落地點。
 *
 * 這裡同時處理兩種形式，因為 Supabase 的信件範本改過與沒改過會送來不一樣的參數：
 *
 * - `token_hash` + `type` —— 信件範本改用 `{{ .TokenHash }}` 之後的形式（Supabase 對
 *   server-side 應用的建議做法，連結不會先經過 Supabase 的網域）。
 * - `code` —— 預設範本 `{{ .ConfirmationURL }}` 經過 Supabase 轉址後帶回來的 PKCE code。
 *
 * 兩種都接，信件範本有沒有改都能登入。
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const rawNext = searchParams.get("next");
  // 只接受站內路徑，避免被改成外部網址當成轉址跳板
  const next = rawNext?.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
    return failed(origin, error.message);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
    return failed(origin, error.message);
  }

  return failed(origin, "登入連結不完整。");
}

function failed(origin: string, message: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}
