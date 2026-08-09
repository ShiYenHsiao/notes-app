<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# NEXUM NOTE — 給代理人的操作手冊

這是一個**已經在用的個人工具**（部署在 Vercel，作者每天拿它讀書），不是練習專案。
改動的預設立場是保守：先讀懂既有決策，再動手。

延伸閱讀：

- [`docs/STATUS.md`](docs/STATUS.md) — 功能清單、已知問題、沒做的事
- [`docs/UI.md`](docs/UI.md) — 設計系統與版面結構
- [`README.md`](README.md) — 每一個決定「為什麼這樣做」的完整記錄（最長，但答案通常在裡面）

---

## 一分鐘上手

```bash
npm install
cp .env.example .env.local   # 填 Supabase 專案的 URL 與 publishable key
npm run dev                  # 固定 port 3100，不要改
```

| 指令 | 用途 |
|---|---|
| `npm run check` | typecheck + lint + test，**送出前一定要全綠** |
| `npm run build` | production build，`check` 過了不代表 build 會過 |
| `npm test` | 只跑測試（106 項，`node --test`） |
| `npm run typecheck` / `npm run lint` | 個別跑 |

**port 3100 是寫死的**：Supabase 的回跳網址白名單是固定值，port 浮動的話每次重啟都要去
Dashboard 重設。

---

## 這個專案的技術現況

Next.js 16.3（App Router）、React 19.2、Tailwind v4、Supabase、TypeScript strict、
CodeMirror 6 編輯器、react-markdown + remark-gfm 預覽。部署在 Vercel。

三件跟大部分教學文章不一樣、會讓人寫錯的事：

1. **Next.js 16 把 `middleware.ts` 改名為 `proxy.ts`**。Supabase 官方範例還是舊寫法。
2. **React Compiler 的 lint 規則是啟用的**：`react-hooks/set-state-in-effect` 會擋下
   「在 effect 裡同步 setState」。要同步外部狀態（localStorage 之類）請用
   `useSyncExternalStore`，專案裡有三個現成的例子（分頁、專注模式、主題）。
   也不能在 render 期間讀寫 ref（`react-hooks/refs`）。
3. **測試用 `node --test` 直接 import `.ts`**（Node 的型別剝離）。因此
   **`src/lib/` 裡被測試 import 的檔案不能有相對 import**（node 需要副檔名，
   而 tsconfig 沒開 `allowImportingTsExtensions`）。這就是 `tabs.ts` 與
   `use-open-tabs.ts`、`focus-mode.ts` 與 `workspace-focus.tsx` 要拆成兩支的原因：
   純規則放一支（可測），React 那半放另一支。

---

## 不要打破的東西

這些不是風格偏好，是踩過坑之後的結論。動它們之前先讀 README 對應段落。

| 不要 | 為什麼 |
|---|---|
| 不要把標籤寫進 Markdown 內文 | 標籤是 `note_tags` 的關聯。寫進內文會跟標題語法打架，改名還要掃過每一篇 |
| 不要用半形空白縮排中文段落 | 行首半形空白在 Markdown 是排版指令，渲染時被吃掉 —— 左邊有層次右邊是平的。純文字行一律用全形空格 U+3000 |
| 不要讓兩個存檔同時在飛 | 兩次存檔帶同一個 `updated_at`，第二次必然撞到自己的樂觀鎖，使用者會看到「這篇在別的地方被改過」 |
| 不要在專注模式卸載側邊欄／列表 | 卸載會丟掉捲動位置，退出時整棵樹重掛，編輯器連游標都重置。用寬度收到 0 |
| 不要信 CodeMirror 的 height map | `lineBlockAt()` 讀的高度表在這個專案裡是錯的（見 STATUS 的已知問題）。要量位置請用 `coordsAtPos()` |
| 不要顯示沒有實作的快捷鍵 | 曾經有過 `⌘⇧I` 只寫在 tooltip 上卻沒綁定的情況。UI 上出現的快捷鍵必須真的能按 |
| 不要在 UI 做假的付費入口 | 「升級方案」連到使用說明，不是購買頁。沒有付費方案 |
| 不要改 `updated_at` 的 trigger | 它是 `for each row`，釘選也會讓它前進。這個副作用已知，改它要連列表排序一起想 |

---

## 慣例

**註解寫「為什麼」，不寫「做了什麼」。** 這個 repo 的註解密度偏高而且都在解釋取捨，
例如「為什麼不用等比例對應」「為什麼回音鎖要有方向」。跟著這個風格寫，
不要加 `// 設定狀態` 這種複述程式碼的註解。中文，繁體。

**commit 訊息用繁體中文，寫為什麼。** 例：`垃圾桶定期清理與大綱面板`，
內文說明「migration 裡那支 SQL 只刪得掉資料列，碰不到 Storage」。

**新的純邏輯要有測試。** 判斷規則抽成純函式放 `src/lib/`，用 `node --test` 測；
DOM 層級的行為（點擊、焦點、動畫）不寫自動化測試 —— 那需要 jsdom 加一套 testing
library，這個專案刻意不裝。那類行為在瀏覽器裡實際操作驗證。

**Server Action 一律先 `requireUser()`**，即使 RLS 已經擋過一次。

---

## 驗證的現實限制

**本機登入不了。** 登入走 Supabase Magic Link，代理人拿不到信。所以：

- 幾乎所有畫面都在 `requireUser()` 後面，直接開 `localhost:3100` 只會看到登入頁
- 要看 UI：在 `src/app/dev-ui/page.tsx` 建一個臨時頁、把 `/dev-ui` 暫時加進
  `src/proxy.ts` 的 `PUBLIC_PATHS`、用假資料 render 真元件。
  **驗完一定要刪掉頁面並還原 proxy**（`/api/cron` 那一條是正式的，別一起刪）
- Server Action（存檔、標籤改名合併、垃圾桶清理）只驗得到型別與未授權路徑。
  回報時要明講哪些沒有真的跑過，不要當作已驗證

其他兩個會浪費時間的坑：

- `.next/dev/types/validator.ts` 會殘留已刪除路由的型別引用，讓 `tsc` 報
  `Cannot find module`。刪掉 `.next/dev/types` 即可
- 這台機器跑久了會出現 `spawn EAGAIN`（開不了新行程）。停掉 dev server 就會恢復

---

## 部署

推上 `main` 就是 Vercel production。**作者目前的工作方式是改完直接 push**，
但前提是 `npm run check` 與 `npm run build` 都全綠。build 失敗時 Vercel 會保留
前一個成功的部署，所以壞掉的 push 不會讓網站掛掉 —— 真正的風險是「build 過了但
線上壞掉」，而那正是本機驗不到的那一類。

需要新環境變數時，push 之後要明講作者得去 Vercel 設哪幾個，否則功能會安靜地不運作。
目前用到的：

| 變數 | 必要性 | 用途 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 必要 | Supabase 專案 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 必要 | 舊專案叫 `ANON_KEY`，兩個名字都讀得到 |
| `NEXT_PUBLIC_SITE_URL` | 建議 | 登入連結的回跳網址 |
| `ALLOWED_EMAILS` | 選填 | 白名單，不設就是誰都能註冊 |
| `SUPABASE_SERVICE_ROLE_KEY` | 排程必要 | 垃圾桶清理要略過 RLS。**最高權限，只在 route handler 用** |
| `CRON_SECRET` | 排程必要 | 沒設的話 `/api/cron/purge` 一律回 503 |
