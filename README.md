# Meet 自動截圖（Meet Auto Screenshot）

一個 Chrome 外掛（Manifest V3），在 Google Meet 視訊會議中**每隔 X 秒自動以高畫質擷取會議畫面並下載存檔**。

- ⏱ 間隔秒數可自訂（1–3600 秒），擷取中修改也會即時生效
- 🖼 高畫質：視訊模式以**影片原始解析度**存檔（例如對方分享 1080p 螢幕就存 1920×1080），PNG 無損
- 🎛 三種擷取內容：主畫面視訊／所有視訊／整個分頁
- 🤖 可選「進入會議自動開始、離開會議自動停止」
- 🧹 可選「略過重複畫面」（同一張投影片不重複存檔）
- 🔴 工具列圖示顯示 `REC` 徽章；出錯時顯示 `!`
- 📁 自動依會議代碼分資料夾：`下載/Meet-Screenshots/abc-defg-hij/abc-defg-hij_2026-10-22_17-32-05.png`

---

## 快速安裝

### 方法 A：一鍵安裝腳本（從 GitHub）

**macOS / Linux**（終端機）：

```bash
curl -fsSL https://raw.githubusercontent.com/Eatmeapp/chrome-screen-shot-plugin/main/install.sh | bash
```

**Windows**（PowerShell）：

```powershell
irm https://raw.githubusercontent.com/Eatmeapp/chrome-screen-shot-plugin/main/install.ps1 | iex
```

腳本會自動完成：

1. 從 GitHub 下載（或更新）程式碼到 `~/ChromeExtensions/meet-auto-screenshot`
2. 把外掛資料夾路徑**複製到剪貼簿**
3. 自動打開 `chrome://extensions`

接著你只需要在 Chrome 中手動完成**一次**：

1. 打開右上角「**開發人員模式**」
2. 點「**載入未封裝項目**」→ 貼上剪貼簿裡的路徑（macOS 在選擇視窗按 `⌘ + Shift + G` 貼上）→ 選擇

> **為什麼不能 100% 自動？** Chrome 基於安全考量，不允許任何腳本靜默安裝外掛；舊的 `--load-extension` 啟動參數也已在正式版 Chrome（137 版起）停用。所以「載入未封裝項目」這一步必須由使用者自己點。
>
> **之後要更新**：重新執行同一行指令，然後在 `chrome://extensions` 的外掛卡片上按「↻ 重新載入」即可。
>
> 一鍵安裝需要這個 GitHub repo 是 **public**。可用環境變數改來源或位置，例如：
> `MAS_DIR=~/my-ext curl -fsSL …/install.sh | bash`（另有 `MAS_REPO`、`MAS_BRANCH`）。

### 方法 B：手動載入未封裝的外掛

1. 取得程式碼：`git clone https://github.com/Eatmeapp/chrome-screen-shot-plugin.git`（或在 GitHub 頁面按 **Code → Download ZIP** 後解壓縮）
2. 在 Chrome 網址列輸入 `chrome://extensions` 並按 Enter
3. 開啟右上角的「**開發人員模式**」（Developer mode）
4. 點左上角「**載入未封裝項目**」（Load unpacked）
5. 選擇專案裡的 **`extension`** 資料夾（就是有 `manifest.json` 的那一層，不是專案根目錄）
6. 看到「Meet 自動截圖」卡片就安裝完成了。建議點工具列的拼圖圖示 🧩 → 把它**釘選**在工具列上

---

## 使用方式

1. 進入 Google Meet 會議（`https://meet.google.com/xxx-xxxx-xxx`）
2. 點工具列上的外掛圖示，打開面板
3. 設定「擷取間隔（秒）」與「擷取內容」
4. 按「**開始擷取**」→ 立刻拍第一張，之後每 X 秒一張；工具列圖示會顯示 `REC`
5. 按「**停止擷取**」結束；或直接離開會議，會自動停止
6. 「**拍一張**」可隨時手動補拍

若勾選「**進入會議時自動開始**」，之後每次進入會議都會自動開始，不用再打開面板。

### 擷取內容怎麼選？

| 模式 | 擷取什麼 | 畫質 | 分頁在背景時 |
|---|---|---|---|
| **主畫面視訊**（預設） | 畫面上最大的那個視訊：通常是螢幕分享或主講者 | 影片原始解析度 | ✅ 可以拍 |
| **所有視訊** | 每個可見的視訊各存一張（檔名 `_v1`、`_v2`…） | 影片原始解析度 | ✅ 可以拍 |
| **整個分頁** | 整個 Meet 分頁，包含名牌、字幕、介面 | 螢幕實際像素（Retina 為 2 倍） | ❌ 分頁必須在前景 |

- 視訊模式若找不到任何視訊（例如大家都關鏡頭），會自動改用「整個分頁」。
- 要記錄**簡報內容**，用「主畫面視訊」並開啟「略過重複畫面」效果最好。
- 「整個分頁」想要更清楚：把 Meet 視窗放大或全螢幕、把簡報「固定」在主畫面。

### 截圖存在哪裡？

存在 Chrome 的**預設下載資料夾**下：

```
下載/
└── Meet-Screenshots/          ← 可在「進階設定」修改
    └── abc-defg-hij/          ← 會議代碼
        ├── abc-defg-hij_2026-10-22_17-32-05.png
        └── abc-defg-hij_2026-10-22_17-32-15.png
```

> ⚠️ 如果 Chrome 設定中開啟了「**下載前詢問每個檔案的儲存位置**」，每張截圖都會跳出另存視窗。請到 `chrome://settings/downloads` 關閉這個選項。

---

## 專案結構

```
chrome-screen-shot-plugin/
├── extension/              ← Chrome 要載入的就是這個資料夾
│   ├── manifest.json       外掛設定（MV3、權限）
│   ├── background.js       Service Worker：分頁截圖、下載存檔、徽章
│   ├── content.js          注入 Meet 頁面：計時器、會議偵測、視訊擷取
│   ├── popup.html          面板介面
│   ├── popup.js            面板邏輯：設定、開始/停止、狀態顯示
│   └── icons/              16 / 32 / 48 / 128 px 圖示
├── install.sh              一鍵安裝（macOS / Linux）
├── install.ps1             一鍵安裝（Windows）
└── README.md
```

---

## 一步步建立這些檔案（開發說明）

如果你想從零自己建一次，照這個順序做：

### Step 1：建立資料夾

```bash
mkdir -p chrome-screen-shot-plugin/extension/icons
cd chrome-screen-shot-plugin
```

### Step 2：`extension/manifest.json` — 宣告外掛與權限

| 權限 | 用途 |
|---|---|
| `activeTab` | 使用者點外掛圖示後，允許 `captureVisibleTab` 擷取目前分頁 |
| `downloads` | 用 `chrome.downloads.download()` 自動存檔、指定子資料夾 |
| `storage` | 儲存秒數、模式等設定 |
| `scripting` | 外掛安裝前就開著的 Meet 分頁，由面板補注入 `content.js` |
| `host_permissions: meet.google.com` | 讓 `content.js` 自動注入 Meet 頁面 |
| `optional_host_permissions: <all_urls>` | **可選**；只有「整個分頁 + 自動開始」時才會詢問 |

`content_scripts` 讓 `content.js` 在每個 `meet.google.com` 頁面自動執行；`action.default_popup` 指定點圖示時開啟的面板。

### Step 3：`extension/content.js` — 核心截圖邏輯

為什麼計時器放在 content script，而不是 background？MV3 的 Service Worker 閒置約 30 秒就會被關掉，`chrome.alarms` 最短間隔也是 30 秒，做不到「每 5 秒」。content script 跟著 Meet 分頁活著，而且 Meet 分頁在播放聲音時 Chrome 不會降速它的計時器。

重點流程：

1. **偵測是否在會議中**：網址符合 `xxx-xxxx-xxx`，且頁面上有「離開通話」按鈕（多語系 `aria-label`，或 Material icon 文字 `call_end`）。
2. **高畫質視訊擷取**：找出所有 `<video>`，依畫面上的面積排序，用 `canvas.width = video.videoWidth` 以**原始解析度**畫進 canvas，再 `toDataURL('image/png')`。Meet 的視訊來自 WebRTC 串流，不會被跨網域限制「汙染」，所以可以直接讀取。
3. **存檔**：content script 不能呼叫 `chrome.downloads`，所以把圖片資料傳給 background。
4. **自動開始 / 停止**：每 2 秒檢查一次會議狀態。

### Step 4：`extension/background.js` — Service Worker

- `captureTab`：呼叫 `chrome.tabs.captureVisibleTab()` 擷取整個分頁。先確認 Meet 分頁是該視窗的前景分頁，否則會拍到別的分頁。
- `download`：`chrome.downloads.download({ url: dataUrl, filename, conflictAction: 'uniquify' })`
- `badge`：設定該分頁的 `REC` / `!` 徽章。
- 略過重複畫面：把圖縮成 32×18 灰階，和上一張比平均差異。

### Step 5：`extension/popup.html` + `popup.js` — 面板

- 讀寫 `chrome.storage.local` 的設定，變更後 content script 透過 `storage.onChanged` 即時套用。
- 用 `chrome.tabs.sendMessage` 對 Meet 分頁送出 `start` / `stop` / `snapNow` / `getStatus`。
- 每 0.5 秒更新一次狀態（已存張數、上一張時間、下一張倒數）。
- 支援淺色 / 深色模式。

### Step 6：圖示

在 `extension/icons/` 放 `icon16.png`、`icon32.png`、`icon48.png`、`icon128.png`。

### Step 7：載入測試

照上面「方法 B」載入 `extension` 資料夾。修改程式碼後：

- 改 `background.js` / `manifest.json` → 在 `chrome://extensions` 按「↻ 重新載入」
- 改 `content.js` → 重新載入外掛**並重新整理 Meet 分頁**
- 改 `popup.*` → 關掉再打開面板即可

除錯：`chrome://extensions` → 外掛卡片的「Service Worker」連結可開 background 的 DevTools；在面板上按右鍵 →「檢查」可以除錯 popup；Meet 頁面的 DevTools Console 可看 content script。

### Step 8：推上 GitHub，讓一鍵安裝生效

```bash
git add .
git commit -m "Meet 自動截圖 v1.0.0"
git push -u origin main
```

確認 repo 是 public 後，「方法 A」的指令就能使用。

---

## 常見問題

**Q：按了開始，但出現「需要授權：請點一下工具列上的外掛圖示」？**
「整個分頁」模式依賴 `activeTab`，只有使用者點過外掛圖示後才有效。打開一次面板即可。若想讓「自動開始」也能用整個分頁模式，開啟時面板會詢問額外權限，同意即可；或者改用視訊模式（不需要這個權限）。

**Q：「Meet 分頁不在前景」錯誤？**
「整個分頁」模式只能拍目前顯示中的分頁（Chrome API 限制）。切回 Meet 分頁，或改用視訊模式。

**Q：在 Meet 頁面上看不到任何指示？**
這是刻意的設計：如果在頁面上加浮動標示，用「整個分頁」模式時會被一起拍進去。狀態請看工具列圖示上的 `REC` 徽章。

**Q：外掛更新或重新載入後沒反應？**
重新整理 Meet 分頁（舊的 content script 已和外掛斷線）。

**Q：Google Meet 改版後偵測不到會議？**
「自動開始」依賴 Meet 頁面上的「離開通話」按鈕。如果 Meet 改版導致偵測失效，手動按「開始擷取」仍可正常使用；請到 `content.js` 的 `isInCall()` 更新選擇器。

---

## 隱私與使用提醒

- 所有截圖只存在你的電腦，外掛不會上傳任何資料，也沒有連線到任何伺服器。
- 錄製或截取會議內容前，請先取得與會者同意，並遵守你所在組織的規範與當地法規。
