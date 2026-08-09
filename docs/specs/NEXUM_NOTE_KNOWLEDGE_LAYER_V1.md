# NEXUM NOTE — Knowledge Layer v1 Implementation Spec

## 1. 目標

在不改變 Markdown 可攜性與既有編輯體驗的前提下，完成 NEXUM NOTE 第一版知識連結層：

- `[[Wiki Links]]`
- Wiki Link autocomplete
- resolved／unresolved link UX
- unresolved link Quick Create
- Backlinks（含適量引用 context）
- `⌘P` Quick Open，並整合既有 tabs／navigation
- Supabase `note_links` 可重建索引、migration、索引與 RLS
- 匯出、既有功能、併發控制與版本機制的完整相容性

本階段不包含 Knowledge Graph、AI、Embeddings、Semantic Search 或法條資料庫。

## 2. 執行原則與開始前稽核

Codex 開始實作前必須先稽核 repo 的真實狀態，不得依本規格猜測檔名、框架、資料表、元件或指令：

1. 執行並記錄 `git status --short`、目前 branch、既有未提交變更；不得覆蓋、清除或重排使用者的無關修改。
2. 盤點 package manager、workspace 結構、前端框架、CodeMirror 整合、路由／navigation、tabs、筆記資料模型、Supabase client、migration 慣例、RLS、測試與 build 指令。
3. 找出現有 Markdown parse／render／export pipeline、autosave、optimistic locking、版本快照、Focus／View modes、Outline、scroll sync、Slash Command 與 list handling 的實際實作位置。
4. 先閱讀 repo 內的 `AGENTS.md`、README、開發文件與適用規範。
5. 以現有架構和命名實作；若 repo 現況與本規格衝突，優先保留既有行為，並在 final report 說明調整。
6. 在修改 schema 前確認現有 notes table、soft delete／restore 語意、tenant／owner 欄位、主鍵型別及 RLS helper；migration 必須遵循 repo 既有慣例。

實作前先提出簡短 implementation plan，特別說明 title-based Markdown 與 immutable `target_note_id` 索引如何協作，以及 rename、重複標題和 stale index 的策略。除非遇到會實質改變產品語意或資料安全的阻礙，否則完成稽核後直接實作。

## 3. 核心資料原則

### 3.1 Markdown 是 source of truth

筆記正文必須保留人類可讀、可攜的 title syntax：

```md
強制處分原則上受到 [[令狀原則]] 的拘束。
```

v1 僅支援 `[[Title]]`。不得把正文改寫成 UUID，也不納入 alias、path、heading fragment 等擴充語法。

### 3.2 `note_links` 是可重建索引

Supabase `note_links` 只用於 backlinks、快速解析與後續查詢，不是連結內容的權威來源。它必須能由 notes 的 Markdown 全量重建；索引缺失、過期或損毀不得改變正文，也不得造成資料遺失。

建議的概念欄位如下，實際命名與型別須配合既有 schema：

```text
note_links
  id                  （若既有慣例需要）
  workspace_id        （或現有 tenant scope）
  source_note_id      immutable note id, FK
  target_note_id      nullable immutable note id, FK
  target_title        Markdown 中原始／正規化後的 title lookup value
  occurrence_index    或等價 occurrence identity（若需保留多處 context）
  created_at
  updated_at
```

實作前必須評估並記錄下列設計：

- Markdown 只保存 title，方便閱讀與匯出。
- resolved index 同時保存 `target_title` 與 immutable `target_note_id`，以穩定支援查詢及 rename 過渡。
- 不得讓舊 `target_note_id` 靜默掩蓋正文已無法依 title 解析的狀態；Markdown 與索引不一致時，正文仍具權威性，背景／儲存時應重建或修復索引。
- 必須明確選擇 rename 行為：是否原子更新所有來源 Markdown，或將舊標題保留為可解析 alias／其他相容機制。v1 若沒有既有 alias 模型，預設採「使用者確認後，原子／可恢復地更新所有可寫來源正文中的精確 Wiki Link，並重建索引」；若受 optimistic locking 或部分失敗限制，必須避免半完成狀態，提供衝突／重試結果，且不得假裝已全部更新。
- final report 必須說明最終選擇、資料一致性策略及 tradeoff。

## 4. Wiki Link 解析與儲存

- 辨識正文中的 `[[Title]]`，保留原始 Markdown 字串。
- Title 至少 trim 外圍空白；大小寫、Unicode normalization 與空白正規化規則須根據現有 title 唯一性與搜尋行為決定，並集中實作、測試和記錄。
- Code fence、inline code 或其他不應解讀為連結的 Markdown 節點不得被誤解析；應優先使用既有 Markdown syntax tree／CodeMirror parser，而非不分語境的全文件 regex。
- 儲存成功後依最新正文同步該來源筆記的 link index；同步操作必須具冪等性。
- 若正文儲存成功但索引更新失敗，正文不可回滾或遺失；標記／記錄可重試狀態，並在後續儲存、開啟或維護流程修復。
- 提供可測試的單篇重建能力；若 repo 有 admin／maintenance 模式，再提供安全的全量 rebuild。不得為此新增過度複雜的管理 UI。

## 5. Wiki Link Autocomplete

在 CodeMirror 內輸入 `[[` 後開啟 autocomplete：

- 使用 `[[` 後、游標前的文字搜尋目前使用者可存取的現有筆記。
- title prefix match 優先，其次採既有搜尋可合理支援的 contains／fuzzy 排序；結果排序須穩定。
- 顯示筆記 title；若重複標題無法避免，加入最少但足以辨識的 context，例如 notebook、folder 或更新時間，不得暴露其他 tenant 資料。
- Enter／點選結果插入完整 `[[Title]]`，正確替換目前 query；Esc 關閉；上下鍵移動；不攔截無關輸入。
- 空 query 顯示合理數量的最近或常用筆記；設定結果上限，避免大型資料集一次載入。
- UI 應沿用現有 Slash Command completion 的視覺語言、定位、鍵盤操作與可及性，但兩者狀態不得互相干擾。
- IME／中文輸入組字期間不得提前提交、重複插入或破壞 composition。
- autosave、selection、undo／redo 和 editor focus 必須維持正常。

## 6. Resolved／Unresolved UX

### Editor

- resolved link 使用清楚但不干擾閱讀的 link style。
- unresolved link 使用較淡或虛線等 broken-link style；不能用會被誤認為錯誤或造成不可讀的樣式。
- 游標、selection、複製、貼上與 Markdown 原文編輯行為不變。
- 連結裝飾不得破壞 CodeMirror performance、中文條列或 scroll sync。

### Preview

- resolved link 可點擊，透過既有 navigation 開啟目標筆記；不得自行建立第二套 routing。
- unresolved link 可點擊並觸發 Quick Create，清楚顯示將建立的 title。
- 連結須支援鍵盤焦點、Enter 操作與適當 accessible label。
- PDF／匯出情境不可依賴 app-only click handler 才能正確顯示文字。

## 7. Unresolved Link Quick Create

- 從 unresolved `[[Title]]` 建立筆記時，預填精確 title，並依既有建立筆記流程決定 notebook／folder／workspace。
- 建立前再次查詢，避免 race condition 產生重複筆記；若此時已有唯一匹配，直接開啟它。
- 建立成功後透過既有 tabs／navigation 開啟新筆記，並刷新／重建相關來源索引，使 unresolved link 自然變為 resolved。
- 建立失敗、權限不足或 title 衝突時保留原正文，顯示可理解且可恢復的錯誤。
- 不得把「點 unresolved link」設計為無確認且不可逆的背景建立；可使用輕量確認介面或明確的「建立」動作。

## 8. Backlinks

在筆記 UI 的既有合適區域呈現 Linked References／Backlinks：

- 僅列出目前使用者可讀且未被有效刪除的來源筆記。
- 每筆至少顯示來源筆記 title，並提供適量引用 context。
- Context 從原 Markdown 中對應 occurrence 周圍擷取，避免切斷 Unicode／中文字符；移除不必要 Markdown 噪音，限制長度，並以安全方式醒目標示命中內容。
- 多次引用同一目標時，預設合併為同一來源並顯示最有用的一至數段 context；避免無上限展開。
- 點擊來源使用既有 tabs／navigation 開啟。
- 提供 loading、empty、error 狀態；索引疑似 stale 時不得顯示跨權限資料，可安全地觸發修復或退回空／可重試狀態。
- 查詢必須分頁或有合理上限，避免 N+1 queries。

## 9. `⌘P` Quick Open

- macOS 使用 `⌘P`；若產品支援其他平台，使用對應 primary modifier（通常 `Ctrl+P`）。不得破壞瀏覽器／既有 app shortcut 的已定義行為；若已有 command palette，整合而非重做。
- 開啟中央 Quick Open，初始顯示最近開啟筆記；輸入後搜尋使用者可存取的筆記。
- 支援中文、IME、上下鍵、Enter、Esc、滑鼠與鍵盤焦點管理。
- Enter 後使用既有 tabs／navigation：已開啟則切換至既有 tab，否則加入 tab，再關閉 palette；不得重複建立相同 tab。
- 保持目前 editor 狀態與尚未完成的安全儲存流程；不得因切換造成內容遺失。
- 結果數量、debounce／cancellation 與 server query 須能支援大型筆記庫，並避免過期請求覆蓋較新的搜尋結果。

## 10. Supabase Migration、索引與 RLS

Migration 必須：

- 建立 `note_links`、必要 FK、唯一約束／去重策略與 timestamps；刪除行為須符合現有 soft-delete／hard-delete 模型。
- 至少為 `source_note_id`、`target_note_id`、tenant scope，以及 backlinks 常用複合條件建立合適索引；以實際 query plan 與現有 schema 決定欄位順序。
- 若 `target_note_id` nullable，為 resolved／unresolved lookup 規劃適當索引。
- 啟用 RLS。SELECT／INSERT／UPDATE／DELETE 必須驗證呼叫者對 source note 與 workspace 的權限；resolved target 也必須屬於相同合法 scope。不得只信任 client 傳入的 owner／workspace id。
- 使用現有 auth／membership helper，避免重複或語意不一致的 policy。
- 防止藉由 backlinks、autocomplete、錯誤訊息或重複標題 context 探測其他使用者／workspace 的筆記。
- migration 必須可在乾淨資料庫與既有資料庫安全套用；若需要 backfill，須可分批、重試且不阻塞正常正文保存。
- 若建立 DB function／trigger，必須固定 `search_path`、使用最小權限，並清楚評估 `security definer`。

不得依賴 `note_links` 反向生成或覆寫 Markdown。

## 11. Edge Cases 與必要行為

### 筆記改名

- 依第 3.2 節先完成設計評估。
- rename 不得讓已解析 link 因只更新 title 或只更新 id 而永久失效。
- 若更新來源 Markdown，必須只替換語意上指向該 note 的精確 Wiki Link，尊重 optimistic locking、autosave 與版本快照；衝突需明示並可重試。
- rename 前後的 index 必須可重建並達到一致。

### 刪除與還原

- 刪除目標筆記後，來源 Markdown 保持不變，連結顯示 unresolved；不得級聯刪除來源正文。
- hard delete 可清除／nullify index target，依 schema 選擇且不得造成 migration 錯誤。
- 還原後應依相同 title／identity 規則自然 resolve，並修復 backlinks。
- 已刪除筆記不得出現在 autocomplete、Quick Open 或一般 backlinks，除非既有 trash UI 明確要求。

### 重複標題

- 開始前確認現有產品是否已在 scope 內保證 title unique。
- 若 unique，Quick Create 與 rename 必須處理 constraint race。
- 若允許重複，禁止任意挑第一筆；顯示 disambiguation，或把 link 視為 ambiguous／unresolved，直到使用者選擇。由於 v1 Markdown 無 id syntax，必須在 report 清楚說明可攜性與穩定解析間的限制。

### 其他

- self-link：允許保存與顯示，但 backlinks UI 須清楚且不得造成遞迴或重複 navigation。
- 循環引用：A→B→A 或更長 cycle 必須正常運作，不得遞迴展開或造成無限查詢。
- stale index：偵測 Markdown hash／updated timestamp／重建結果不一致時，以 Markdown 為準修復；所有修復需冪等。
- 多個相同 link、空 link `[[ ]]`、未閉合 `[[`、巢狀 bracket、標點、emoji、CJK、超長 title、code block／inline code 均須有明確測試。
- 並行編輯：索引更新必須依成功保存的版本，不得讓舊請求覆蓋新內容的索引。

## 12. Export 相容性

- Markdown export 必須原樣保留可讀的 `[[Title]]`；不得輸出 UUID 或 app 私有標記。
- ZIP export 中所有 `.md` 同樣保留 title syntax；不得要求 `note_links` 才能閱讀內容。若 ZIP 既有 manifest，可在不破壞相容性的前提下加入選用 metadata，但不是本階段必要項。
- 現有 browser-native PDF Export 必須正常顯示 link title。resolved／unresolved 樣式可保留適度視覺區別，但不得輸出互動控制、建立按鈕、tooltip 或破版內容。
- 匯出流程不得因 backlinks 查詢、網路離線或 stale index 而失敗。
- 加入包含中文、列表、code、resolved／unresolved link 的 export regression tests；PDF 依 repo 現有能力做 runtime／視覺 smoke verification。

## 13. 不得破壞的既有功能

以下均須加入針對性 regression verification：

- CodeMirror 編輯、selection、undo／redo、IME
- Slash Command 與其 completion UI
- 中文條列
- ordered-list fallback
- autosave
- optimistic locking／衝突處理
- Focus mode／View mode
- Outline
- Editor／Preview scroll sync
- 版本快照與還原
- tabs、navigation、返回／切換行為

新功能應重用現有 abstraction；禁止為 Wiki Links 建立彼此競爭的第二套 editor state、save pipeline、router 或 tab store。

## 14. Tests 與 Runtime Verification

依 repo 現有測試工具新增最小但完整的測試組合：

### Unit

- Wiki Link parse／exclude contexts／normalization／occurrences
- index diff／rebuild／idempotency／stale repair
- context extraction（CJK、emoji、邊界、長度）
- autocomplete query replacement、ranking、keyboard／IME state
- rename、delete、restore、duplicate、self-link、cycles

### Integration

- 保存 Markdown 後建立、更新、刪除 link index
- resolved／unresolved 狀態轉換與 Quick Create
- backlinks 權限、context、合併與分頁
- `⌘P` 與 tabs／navigation
- autosave／optimistic locking／版本快照交互
- RLS：同 tenant 正常、跨 tenant 全部拒絕，且不可透過 error／count 洩漏
- migration、backfill／rebuild、重試和部分失敗

### E2E／Runtime

至少實際驗證：

1. 建立 A 與 B，在 A 輸入 `[[B]]`，autocomplete 插入並顯示 resolved。
2. B 顯示 A backlink 與正確中文 context。
3. 輸入不存在的 `[[C]]`，Editor／Preview 顯示 unresolved；Quick Create C 後自然 resolve。
4. `⌘P` 開啟、搜尋、切換既有 tab 與新增 tab。
5. rename、delete、restore 後正文、解析與 backlinks 符合選定策略。
6. Markdown、ZIP、browser-native PDF Export 均成功且內容可讀。
7. Focus／View、Outline、scroll sync、Slash Command、中文與 ordered list、autosave、版本還原沒有 regression。

若某項 runtime verification 受環境限制無法執行，不得聲稱通過；需列出限制、已完成的替代驗證與人工驗證步驟。

## 15. Performance 與 Security Acceptance

- autocomplete／Quick Open 採 debounce、request cancellation 或等價機制；查詢有上限、scope filter 與穩定排序。
- Backlinks 不得 N+1；大型結果需分頁／漸進載入。
- 解析與 editor decorations 應增量或受控執行；不得在每次 keystroke 全量掃描整個資料庫或造成明顯輸入延遲。
- 對大型筆記與大量 links 建立基準或至少記錄可重現的 smoke measurement；沿用 repo 既有 performance budget，若無則在 report 記錄測試資料規模與觀察結果，不虛構硬性數字。
- 所有 title／Markdown／context 均視為不可信輸入；Preview、highlight 與 tooltip 禁止未消毒 HTML，避免 XSS。
- 所有 server／DB 查詢以 auth scope 為準，client-side filter 不能取代 RLS。
- 日誌不得輸出完整私人筆記內容；錯誤資訊應足以診斷但不洩漏跨 tenant metadata。

## 16. Documentation

更新 repo 中實際適用的開發／使用文件，至少包含：

- `[[Title]]` v1 語法與限制
- autocomplete、unresolved Quick Create、Backlinks、`⌘P`
- Markdown source of truth 與 `note_links` 可重建索引原則
- rename／duplicate title 的最終策略與限制
- migration／backfill／rebuild 操作及故障恢復
- 測試與 runtime verification 指令

不得建立與 repo 現有文件重複、無人維護的新文件層級。

## 17. Definition of Done

只有在以下條件全部滿足時才算完成：

- 本規格範圍已依真實 repo 架構實作，且沒有納入明列的非目標。
- migration、索引與 RLS 已驗證；Markdown 始終是 source of truth。
- title／immutable id 協作、rename 與重複標題策略已實作並有測試。
- 既有 editor、save、navigation、mode、outline、sync、snapshot 與 export 功能沒有已知 regression。
- tests 與 runtime verification 已完成；未能執行者已誠實列出。
- 文件已更新。
- 最後依 repo 的真實指令執行：typecheck、lint、tests、`git diff --check`、production build；不得只因指令名稱不同而跳過，應先找出等價指令。
- 檢查最終 `git status --short` 與 diff，確認沒有 generated secrets、無關檔案或意外覆寫。
- 先不要 commit 或 push；等待 review。

## 18. Final Report 格式

完成後以繁體中文提交下列報告；不得只寫「完成」：

```md
# Knowledge Layer v1 — Implementation Report

## 完成摘要
- 使用者可見功能
- 重要架構／資料流

## Repo Audit
- 實際技術棧、相關模組與既有慣例
- 開始前 git 狀態與保留的既有修改

## 資料模型與一致性決策
- Markdown title syntax 與 immutable target_note_id 如何協作
- rename、duplicate title、delete／restore、stale index 策略
- 選擇原因與 tradeoff

## Schema／RLS
- migrations、indexes、policies、backfill／rebuild

## UX 與相容性
- Editor／Preview、Quick Create、Backlinks、⌘P
- exports 與既有功能 regression 結果

## 驗證結果
- typecheck：指令與結果
- lint：指令與結果
- tests：指令、通過／失敗／略過數量
- git diff --check：結果
- build：指令與結果
- runtime／E2E：逐項結果
- performance／security checks

## 變更檔案
- 依功能分組列出實際檔案與用途

## 已知限制與後續事項
- 僅列真實限制、未完成驗證或需 review 的決策

## Git 狀態
- 最終 branch 與 git status 摘要
- 明確確認：未 commit、未 push，等待 review
```

## 19. 明確非目標

本階段禁止順手加入：

- Knowledge Graph／Graph View
- AI 生成、摘要或助理功能
- Embeddings
- Semantic Search
- 法條資料庫或法規抓取／同步
- `[[id|alias]]`、heading links、block references 等 Wiki Link v2 語法

若實作中發現這些能力是未來必要延伸，只能在 final report 的後續事項簡短記錄，不得擴張本輪 scope。
