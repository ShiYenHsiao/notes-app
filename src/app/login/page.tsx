import { redirect } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import { NexumBadge } from "@/components/logo";

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
    <main className="login-page">
      <div className="login-card">
        <NexumBadge size={52} className="mb-5" />

        <p className="eyebrow">Legal Knowledge Workspace</p>
        <h1
          className="mt-3 mb-2 text-display tracking-[0.16em]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          NEXUM
        </h1>
        <span className="text-sm text-ink-muted">用 email 收一封登入連結，不需要密碼。</span>

        {error ? (
          <p role="alert" className="login-error">
            {error}
          </p>
        ) : null}

        <LoginForm next={safeNext} />
      </div>
    </main>
  );
}
