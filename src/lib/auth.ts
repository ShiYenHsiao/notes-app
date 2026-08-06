import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * 取得目前登入的使用者，沒有就導向登入頁。
 *
 * proxy.ts 已經擋過一次，但那只是樂觀檢查 —— Next.js 明確建議不要把 proxy 當成唯一的
 * 授權關卡，所以每個頁面與 Server Action 都要再確認一次。這裡用 getUser() 而不是
 * getSession()，因為只有前者會真的向 Supabase 驗證 token。
 */
export async function requireUser(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

/**
 * 目前這個站的來源網址，用來組 magic link 的回跳網址。
 *
 * 從request header 推導而不是寫死，dev server 換 port 時才不用改設定；
 * 部署到 Vercel 之後可以用 NEXT_PUBLIC_SITE_URL 明確指定。
 */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

/**
 * 這個 email 是否允許登入。
 *
 * Supabase 預設任何人都能用 magic link 自行註冊，對單人使用的站來說等於門是開的。
 * 設定 ALLOWED_EMAILS（逗號分隔）就只有名單內的人能收到登入信。
 * 更保險的做法是同時到 Supabase Dashboard → Authentication → Sign In / Providers
 * 關掉「Allow new users to sign up」。
 */
export function isEmailAllowed(email: string): boolean {
  const allowList = process.env.ALLOWED_EMAILS;
  if (!allowList) {
    return true;
  }

  const normalized = email.trim().toLowerCase();
  return allowList
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized);
}
