"use server";

import { isEmailAllowed, siteOrigin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  status: "idle" | "sent" | "error";
  message?: string;
};

export async function sendMagicLink(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const next = String(formData.get("next") ?? "/");

  if (!email) {
    return { status: "error", message: "請輸入 email。" };
  }

  // 不在名單內時回報跟成功一樣的訊息，避免讓人試出哪個 email 有帳號。
  if (!isEmailAllowed(email)) {
    return { status: "sent" };
  }

  const supabase = await createClient();
  const origin = await siteOrigin();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "sent" };
}
