# NEXUM NOTE — UI 規格

設計系統與版面結構的參考。動 UI 之前先讀這份；每一條背後的取捨在
[`README.md`](../README.md)。

目前版本：**Visual Identity v4 — Academic IDE × Digital Legal Textbook**。

視覺方向：**Premium／Academic／Focused／Calm／Precise**。
不是 dashboard，不是後台管理系統，不是 SaaS 模板。

- Dark Mode 是深墨藍的 Academic IDE：工作表面、閱讀表面與輔助導覽各有深度，Preview
  不使用白紙。
- Light Mode 是暖象牙色的 Digital Legal Textbook：保留紙感，但互動控制仍維持桌面工具的
  精準度，不是純白 SaaS dashboard。
- 兩種模式共用 spacing、geometry、interaction 與 state；palette 不是互相反相。

---

## 品牌

| 項目 | 內容 |
|---|---|
| 名稱 | NEXUM NOTE。品牌是 NEXUM，NOTE 是產品名 |
| 標誌 | 幾何化的 N，兩端各一個節點（`src/components/logo.tsx`）。**不要用書本、法槌、天秤** |
| 文字標 | NEXUM 放大加字距，NOTE 退成副標 |
| 語氣 | 不用驚嘆號，不催促，不推銷 |

**色彩語義**（不要混用）：

- **墨藍 `--accent`** — 互動、導覽、選取、焦點
- **暖金 `--gold`** — 知識層面的強調、釘選、額度卡的進度、備註框「重點」。**只當點綴**，面積一大就變成廉價的金色會員感
- **暖白四層** — 閱讀與工作區表面

---

## Design Token

全部在 `src/app/globals.css` 的 `@theme inline`。**元件只用 token，不寫
`text-[12px]`、`rounded-[3px]` 這種一次性的值。**

### 顏色

用 `light-dark()` 寫成單一來源，深淺色不維護兩份。

| Token | 用途 |
|---|---|
| `--background` | App 最底層；Light 是暖中性色，Dark 是 deep ink navy |
| `--surface-sidebar` / `--surface-list` / `--surface-workspace` / `--surface-editor` | 導覽 → 文件索引 → 工作區 → 編輯表面 |
| `--surface-elevated` / `--surface-hover` / `--surface-active` | 浮層、hover 與 selected state |
| `--border-subtle` / `--border-default` | 區域收邊與真正需要 boundary 的互動元件 |
| `--text-primary` / `--text-secondary` / `--text-muted` / `--text-faint` | 四階文字 hierarchy |
| `--syntax-mark` | 編輯器裡 Markdown 符號（`#`、`**`、`==`、`>`）的暖灰 |
| `--structure` / `--syntax-structure` | 標題、清單、引用與中文法律條列 marker |
| `--reference` / `--reference-muted` | 連結文字、URL 與外部參照 |
| `--technical` / `--technical-soft` | Code、delimiter 與 Markdown mechanics |
| `--accent` / `--accent-soft` | 墨藍與它的淡底 |
| `--accent-gold` / `--accent-gold-muted` | active indicator、品牌細節與知識強調 |
| `--success` / `--warning` / `--danger` | 儲存狀態、ambiguous reference 與破壞性操作 |
| `--hl-yellow` / `-green` / `-pink` / `-blue` | 四色螢光筆，刻意降飽和 |

`--rail`、`--list`、`--paper`、`--surface` 等舊 token 仍是 semantic palette 的相容 alias，
讓既有元件不用為了改名一次重寫。新的視覺決策只在 semantic palette 調整。

### 字級

介面刻意只有五階加一個大標。**內文（預覽區）不走這套**，它由 `.markdown-body` 用 em 自己管。

| Token | px | 用在哪 |
|---|---|---|
| `--text-2xs` | 10 | 計數、eyebrow、chip |
| `--text-xs` | 11 | 次要標示 |
| `--text-sm` | 12 | 時間、說明、選單項目 |
| `--text-base` | 14 | 介面主字級：側邊欄導覽、筆記標題 |
| `--text-lg` | 15 | 筆記標題列 |
| `--text-display` | 28 | 登入頁、空狀態 |

### 圓角與陰影

`--radius-sm 3` / `--radius-md 5` / `--radius-lg 8`，**蓋掉 Tailwind 預設的 4／6px**
（預設對這種資訊密度偏圓）。

陰影只有兩個：`--shadow-pop`（浮起來的選單）與 `--shadow-card`（登入卡片）。
**主工作區不要 shadow** —— 層次靠四層底色，不靠陰影堆疊。

### 動態

150–200ms，`ease-out`，只有淡入與一小段位移。全站尊重
`prefers-reduced-motion`（`globals.css` 有一條全域規則把時間壓到 0.01ms）。

---

## 版面

```
┌─────────┬──────────────┬────────────────────────────────┐
│ Sidebar │  Note List   │  Workspace                     │
│         │              │  ┌──────────────────────────┐  │
│ 品牌    │  [搜尋]      │  │ Tab Bar        38px      │  │
│ 新增    │              │  ├──────────────────────────┤  │
│ 搜尋    │  筆記 A      │  │ 標題 + 標籤 + 操作        │  │
│ ─────   │  筆記 B      │  ├──────────────────────────┤  │
│ 所有    │  筆記 C      │  │ Toolbar        40px      │  │
│ 釘選    │              │  ├────────────┬──────┬─────┤  │
│ 說明    │              │  │ Editor 45% │ 55%  │大綱 │  │
│ 垃圾桶  │              │  │            │      │208px│  │
│ ─────   │              │  └────────────┴──────┴─────┘  │
│ 標籤    │              │            [已儲存]            │
│ 額度卡  │              │                                │
└─────────┴──────────────┴────────────────────────────────┘
 clamp        clamp
 196-208px    244-268px
```

寬度用 `clamp()` 而不是固定值：2560 上導覽不該跟著變胖，1280 上也不該把工作區擠死。

| 區域 | 尺寸 |
|---|---|
| Sidebar | `clamp(196px, 15vw, 208px)`，收合後 58px（icon rail） |
| Note List | `clamp(244px, 21vw, 268px)` |
| Editor / Preview | 45 / 55（讀比寫原始語法重要一點） |
| Outline | 208px，用寬度收合而不是卸載 |
| 閱讀行寬 | 預覽 `68ch`、編輯 `74ch`（純寫作模式 60rem 並連同行號一起置中） |

---

## 各區規格

### Sidebar
品牌區 56px → 新增筆記 → 搜尋筆記 → 導覽 → 標籤 → 額度卡 → 設定與收合。

- 導覽列高 38px、圖示 17px、文字 14px
- Active：`surface-active` + 左側一條短暖金 indicator。**不要用邊框** —— 一整排項目時邊框會互相干擾
- 計數 10px 且更淡，它是參考資訊
- 收合是縮成 icon rail 而不是整條藏起來，每個入口都有 tooltip
- 額度卡：`surface-workspace/45`、無陰影、暖金只在進度條與 Scholar Free 標記上

### Note List
扁平列表，**不要卡片牆**。每列 76px：標題 14px、單行摘要、時間與標籤。摘要直接使用
列表原本已取得的 excerpt，不增加 query；靠文字階層提高密度，不用更小的主要字體。

- Active：`surface-active` + 左側 2px 暖金 indicator
- Hover：只改 surface 與文字對比，不做浮起動畫
- Pinned：暖金**只用在星號圖示**，不要整列變金色
- 右鍵與 hover 的 `⋯` 開**同一個選單、同一份項目**

### Workspace Header
標題（15px 襯線）+ 標籤 chips + 操作。三種檢視用一組 28px segmented control 顯示
目前狀態；高頻的留檯面上（大綱、專注模式），
低頻的收進 `⋯`（釘選、移至垃圾桶）。版本紀錄自帶面板所以保留獨立按鈕。

### Toolbar
高 40px、按鈕 28×28、圖示 16px。四組用**非常淡**的分隔線斷開：
復原重做 ｜ 文字格式 ｜ 清單 ｜ 插入 ｜ 更多。

- 每個按鈕都要有 tooltip（名稱 + 快捷鍵）與 `aria-label`
- **不要每個按鈕都有邊框**，hover 才出淡墨藍底
- 只看預覽時整條收起 —— 那時候沒有編輯器可以操作

### Editor（CodeMirror）
目標是「看起來像 NEXUM 而不是像 IDE」：

- 行號縮到 39px、對比壓到 45%
- 游標所在行用低於 5% 的 structure tint，維持可辨識但不形成色帶
- Markdown 只用四個低飽和語義家族：結構墨藍、知識暖金、引用藍、技術紫灰
- Header／List／Quote marker 由 Lezer syntax tree 精準標示；清單正文維持正常墨色
- 中文法律條列 marker 重用既有 parser，只裝飾可見行，不另寫一套輸入規則
- 四色螢光筆只掃描可見行並排除 code context，不修改 Markdown source
- 15px / 1.85 行高 —— 這裡打的是中文不是程式碼
- 游標 2px 墨藍，不做動畫

### Preview
這是主要閱讀介面，當成**法律教材閱讀模式**而不是 Markdown output。

- 68ch、行高 1.8、襯線體
- 標題各給一個額外訊號：h1 底線、h2 墨藍短標記、h3 無襯線、h4 降階灰
  （中文標題沒有大小寫可以拉開差異，只靠字級分不出來）
- 段距 1.05em、標題上緣 2em 下緣 0.55em、標題接標題不留兩層
- 巢狀清單換記號（disc → circle → square）
- 引用：淡墨藍底 + 左線（法律筆記裡引用通常是判決或條文原文）
- 表格改無襯線縮一階字（那是拿來掃的資料）
- 備註框底色只有 6%，層級靠左線與標籤，不靠色塊面積
- Wiki Link resolved 沿用低飽和 reference blue；unresolved／ambiguous 改淡並用虛線底線，
  不使用紅色錯誤態。Linked References 放在正文末端，合併同一來源，不做無限展開

### Quick Open 與 Wiki Link 浮層

- `⌘P` 使用中央、窄幅 command palette：暖白 surface、1px line、`shadow-pop`、3px 圓角
- active option 用 accent-soft＋墨藍，不新增高飽和 command 顏色
- Wiki autocomplete 共用 CodeMirror 既有 completion menu；Slash Command 與 Wiki source
  並列在同一個 autocompletion extension，不建立第二個 tooltip system
- unresolved Quick Create 是確認 dialog；清楚顯示精確 title，同名時只解釋限制、不提供任選按鈕
- PDF 把 Wiki Link 渲染成純文字 span，不輸出 Quick Create、tooltip 或 app click handler

### PDF Print Preview

`/n/[id]/print` 不進 App Shell。畫面是 neutral workspace background、中間一張 A4 paper，
上方只有 screen-only control bar：返回筆記、PDF 預覽、Study / Clean、列印／儲存 PDF。
列印時控制列、workspace background、paper shadow 與 grain 全部消失。

- Document Header：低調 NEXUM NOTE、筆記標題、文字型 metadata tags、台北匯出日；不要 chip、封面或巨大 logo
- Study：Structure Navy、低飽和四色 highlight、法律 callout 語義色、淡 technical surface
- Clean：白紙、灰階 hierarchy、highlight underline、callout border；背景圖形關閉時仍可辨識
- A4 portrait，正文 11pt／1.72；不機械沿用螢幕的 68ch
- print CSS 全部集中在 `globals.css`，元件內不散落 `@media print`
- renderer 必須沿用 `MarkdownPreview`；PDF 不得另建 parser 或第三套 Markdown pipeline
- 不用 JS 手算分頁，不承諾 browser-native print 無法穩定提供的自訂頁碼與逐頁 header/footer

### Outline
永遠掛著、用寬度收合（200ms）。長大綱自己捲。當前章節只用文字對比 + 左側短金線，
不鋪大面積 active background；捲動時跟著換（`use-active-heading.ts`，rAF throttle）。
1280px 以上是 208px supporting column；1024–1100px 改成同元件的 overlay presentation，
避免同時擠壓 Editor 與 Preview，state、active heading 與 click navigation 都不另建一套。

---

## 專注模式

`⌘⇧F` 或標題列按鈕。收起 Sidebar、Note List、Tab Bar；保留標題、標籤、工具列、
編輯區、預覽區、存檔狀態。

**實作要點：收起而不卸載。** 三欄用寬度收到 0 加淡出，DOM 留在原地 —— 卸載會丟掉
列表捲動位置，退出時整棵樹重掛，編輯器連游標都重置。因此不需要進場快照、退場還原。

| 組合 | 畫面 |
|---|---|
| 專注 + `⌘1` | 純寫作。編輯器連行號一起置中在 60rem |
| 專注 + `⌘2` | 45 / 55 |
| 專注 + `⌘3` | 純閱讀。只剩標題、標籤與 68ch 閱讀欄，上下留白加大 |

大綱在專注模式預設收起（兩種模式各記一份開合狀態），但隨時可以打開。
存檔狀態以小圓點 + 文字放在標題列，只有 error 才提高權重；窄於桌機 header 的唯讀畫面
不額外製造狀態列。
標題旁以小型「專注」標記安靜提示目前狀態；三種檢視控制仍留在標題列。

---

## Accessibility 檢查清單

改 UI 時逐項確認：

- 所有 icon 按鈕有 `aria-label`（**tooltip 不能取代它**）
- 切換類按鈕有 `aria-pressed`（專注模式、大綱、釘選）
- 收起的區域有 `aria-hidden`
- 選單有 `role="menu"`，`Esc` 關閉、上下鍵移動、關閉後焦點還給原本的元素
- 不要移除 focus outline
- 深淺色都要檢查對比，尤其螢光筆與備註框

---

## 不要做的事

- 不要重新設計 Logo，不要換主色
- 不要用科技紫、霓虹藍、漸層、玻璃擬態
- 不要大量 shadow、不要大量卡片、不要把工作區變成圓角大卡
- 不要每一區都畫一條深線分割 —— 層次靠四層底色
- 不要在 UI 顯示沒有實作的快捷鍵或功能入口
