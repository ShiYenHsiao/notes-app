import { redirect } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    redirect("/");
  }

  const { next, error } = await searchParams;
  // 只接受站內路徑，避免被改成外部網址當成轉址跳板
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(safeNext);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-3xl font-semibold">筆記</h1>
      <p className="mt-1 mb-8 text-ink-muted">用 email 收一封登入連結，不需要密碼。</p>

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-md border border-accent/40 bg-accent-soft px-3 py-2 text-sm"
        >
          登入失敗：{error}
        </p>
      ) : null}

      <LoginForm next={safeNext} />
    </main>
  );
}
