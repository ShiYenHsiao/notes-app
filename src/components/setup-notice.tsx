/**
 * 環境變數還沒設定時顯示的說明頁。
 * 讓剛 clone 下來的人 `npm run dev` 就看得到東西，而不是一片錯誤畫面。
 */
export function SetupNotice() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold">筆記</h1>
      <p className="mt-2 text-ink-muted">還差一步就能開始。</p>

      <ol className="mt-10 space-y-6">
        <Step n={1} title="建立 Supabase 專案">
          到 <Link href="https://supabase.com/dashboard">supabase.com/dashboard</Link>{" "}
          建立一個免費專案。
        </Step>

        <Step n={2} title="套用資料表">
          在 SQL Editor 依序執行 <Code>supabase/migrations/0001_init.sql</Code> 與{" "}
          <Code>supabase/migrations/0002_storage.sql</Code>。
        </Step>

        <Step n={3} title="填入環境變數">
          複製 <Code>.env.example</Code> 成 <Code>.env.local</Code>，把 Project Settings → API
          裡的 URL 與 publishable key 填進去，然後重啟 dev server。
        </Step>

        <Step n={4} title="登入之後把註冊關掉">
          Supabase 預設任何人都能用 magic link 自行註冊。第一次登入成功後，到 Authentication
          → Sign In / Providers 關掉 <Code>Allow new users to sign up</Code>，這個站才真的
          只有你進得來。
        </Step>
      </ol>
    </main>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-sm text-accent">
        {n}
      </span>
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-ink-muted">{children}</p>
      </div>
    </li>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[0.85em] text-ink">
      {children}
    </code>
  );
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-accent underline underline-offset-4"
    >
      {children}
    </a>
  );
}
