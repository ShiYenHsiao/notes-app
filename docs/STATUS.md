# NEXUM NOTE — 專案現況

最後更新：2026-08-09（PDF Export v1）。這份文件描述**目前真的跑得起來的東西**，
以及目前真的壞著的東西。設計理由在 [`README.md`](../README.md)，UI 規格在 [`UI.md`](UI.md)。

---

## 定位

專為法律考生與法律工作者設計的 Markdown 知識工作區。單人帳號（Magic Link），
Mac 是唯一的編輯環境，手機與 iPad 只用來閱讀。

主要使用情境：長時間撰寫法律筆記、閱讀教材式筆記、整理爭點與學說實務、
在多篇筆記間切換研究。

---

## 技術棧

| 項目 | 版本／選擇 |
|---|---|
| 框架 | Next.js 16.3（App Router，Turbopack）、React 19.2 |
| 樣式 | Tailwind v4（`@theme inline` 的 token 在 `globals.css`） |
| 編輯器 | CodeMirror 6 + `@codemirror/lang-markdown` |
| 預覽 | react-markdown + remark-gfm + 三支自訂 rehype 外掛 |
| 後端 | Supabase：Postgres、Storage、Auth，全部免費方案 |
| 部署 | Vercel（`main` 分支 = production），含一個每日 Cron |
| 測試 | `node --test`，133 項，沒有額外的測試框架 |

---

## 資料模型

`supabase/migrations/` 兩個檔案，**本輪與前幾輪都沒有動過 schema**。

```
notes       id, user_id, content, title(generated), pinned,
            created_at, updated_at, deleted_at
tags        id, user_id, name                        unique(user_id, name)
note_tags   note_id, tag_id                          兩邊 on delete cascade
versions    id, note_id, content, created_at
attachments id, note_id, storage_path, filename, size, mime_type, created_at
```

- `notes.title` 是 generated column，資料庫從內文第一行推導。前端的
  `titleFromContent()` 必須跟它同一套規則（有測試釘住）
- `updated_at` 由 trigger 維護，`before update on notes **for each row**` ——
  改任何一欄都會前進，包含只改 `pinned`
- RLS 一律以 `user_id` 為界；`versions`／`attachments`／`note_tags` 沒有自己的
  `user_id`，權限推導自所屬筆記

---

## 功能清單（都已實作並可用）

### 筆記管理
新增、編輯、軟刪除、還原、釘選。搜尋涵蓋**內文與標籤名稱**（`pg_trgm` + ILIKE，
兩個查詢在 JS 合併）。篩選：標籤 `?tag=`、只看釘選 `?pinned=1`，都可加書籤。
單篇「複製 Markdown」「匯出 Markdown」「匯出 PDF」，以及全部打包成 zip（含附件與
frontmatter）。PDF 是受登入與 RLS 保護的獨立 A4 Print View，提供 Study / Clean 兩種樣式，
再由 browser-native Print 儲存；不產生或保存 server-side PDF。

### 編輯器
Markdown 全套語法、四色螢光筆 `==字=={g}`、四種備註框、圖片貼上／拖曳自動上傳
（瀏覽器端壓成 WebP）、Slash Command（中英文篩選）、版本快照（10 分鐘一份、
每篇最多 30 份、存的是改動前的內容）。

**中文條列自動延續**是這個專案最特別的一塊：四套序列（中文數字到 99、天干到癸、
字母到 Z、全形括號數字到 99）× 兩種標記形式（`X、` 與 `（X）`），延續時會在上一行
補兩個空白做硬換行。

**Tab 有兩種縮排單位**：清單／空行用半形兩格（那是語法），其他行用全形空格 U+3000
（半形的在預覽會被吃掉）。搭配縮排參考線。

### 工作區
多筆記分頁（localStorage）、大綱面板（含當前章節追蹤）、兩欄捲動同步（用標題當錨點
內插）、三種檢視 `⌘1`/`⌘2`/`⌘3`、專注模式 `⌘⇧F`、自動存檔與衝突處理。

### 維運
每日 04:00 由 Vercel Cron 清掉超過 30 天的垃圾桶內容，**連同 Storage 上的圖片**。

---

## 快捷鍵（每一個都經過實作查核）

| 按鍵 | 動作 | 實作位置 |
|---|---|---|
| `⌘1` `⌘2` `⌘3` | 只看編輯／分割／只看預覽 | `note-view.tsx` |
| `⌘⇧F` | 專注模式 | `workspace-focus.tsx`（**捕獲階段**） |
| `⌘\` | 收合側邊欄 | `app-shell.tsx` |
| `⌘S` | 立刻存檔 | `markdown-editor.tsx` |
| `⌘B` `⌘I` `⌘K` | 粗體／斜體／連結 | `markdown-editor.tsx` |
| `⌘⇧C` `⌘⇧M` `⌘⇧H` | 程式碼區塊／備註框／螢光筆 | `markdown-editor.tsx` |
| `⌘⇧I` | 插入圖片 | `note-view.tsx` |
| `⌘F` `⌘Z` `⌘⇧Z` | 搜尋／復原／重做 | CodeMirror 內建 |
| `Tab` `⇧Tab` | 縮排／反縮排 | `markdown-editor.tsx` |
| `Esc` | 關最上層浮層；沒有浮層時退出專注模式 | `workspace-focus.tsx`（冒泡階段） |

`⌘⇧F` 必須走捕獲階段並 `stopPropagation`：CodeMirror 的 `⌘F` 按鍵比對有 shift
回退，不攔的話按一次會同時開搜尋面板與專注模式。

---

## 測試

133 項，`npm test`。

| 檔案 | 項數 | 涵蓋 |
|---|---|---|
| `tests/markdown.test.mjs` | 53 | 螢光標記、程式碼區塊、callout（含四種法律類型）、清單與段落銜接、縮排規則、縮排參考線、捲動同步的對應、大綱解析 |
| `tests/chinese-list.test.mjs` | 24 | 四套序列的辨識與遞增、上限、全形半形與大小寫沿用、不該接手的寫法 |
| `tests/workspace.test.mjs` | 29 | 分頁規則、標題推導、垃圾桶保留期、存檔衝突分類、搜尋合併排序、專注模式的快捷鍵與 ESC 判斷 |
| `tests/ordered-list.test.mjs` | 12 | 中文常見的有序清單半／全形輸入、nested list、退出與 undo |
| `tests/slash-commands.test.mjs` | 8 | Slash Command 中英文搜尋、trigger 範圍與 snippet |
| `tests/print-export.test.mjs` | 7 | Study / Clean、匯出日期、metadata、route path 與文件標題去重 |

測的都是純函式。**DOM 層級的行為沒有自動化測試** —— 分頁點擊、右鍵選單的焦點、
專注模式的動畫都是在瀏覽器裡實際操作驗證的。這是刻意的取捨，不是遺漏。

---

## 已知問題

照「會不會咬到人」排序。**這些都不是本輪造成的，也都還沒修。**

### 1. 釘選會把筆記推到列表最上面
`updated_at` 的 trigger 是 `for each row`，`togglePin` 只改 `pinned` 也會讓時間前進。
語意上「釘選」不是「修改」。要修得動 trigger，屬於資料模型變更。

（存檔那邊已經處理了：衝突時會分辨是不是自己造成的，不會再卡住編輯。）

### 2. 標題在閱讀模式重複
標題列顯示一次，預覽區的 `# 標題` 再一次。Markdown-first 工具的必然，但在純閱讀
模式（專注 + `⌘3`）特別明顯。

---

## 沒有實作的功能

UI 上不會出現這些的入口，使用說明頁也寫明了：

- 命令面板 `⌘P`
- PWA 離線唯讀
- 欄寬拖曳（所以也沒有要保留的使用者欄寬設定）
- 離線編輯

---

## 需要人工確認的事

代理人驗不到、只能請作者實測的：

1. **Vercel 是否已設 `SUPABASE_SERVICE_ROLE_KEY` 與 `CRON_SECRET`** ——
   沒設的話每日清理會安靜地回 503
2. **標籤改名合併** —— 拿兩個都有筆記的標籤改成同名，確認兩邊筆記都還在
3. **垃圾桶清理** —— 第一次跑完之後確認 Storage 的圖片真的少了
4. **存檔衝突的自動恢復** —— 編輯途中按釘選，確認不會再跳「在別的地方被改過」
