# 假日去哪兒 HolidayGoWhere

手機優先的親子假日旅遊地圖 MVP。家長可依地區、孩子年齡、室內／室外與可用時段篩選景點，查看地圖、導航、部落格及 Instagram 延伸資訊。

## 開發

```bash
npm install
npm run sync:places
npm run dev
```

互動地圖使用 Leaflet + OpenStreetMap，不需要 API Key、不需要綁信用卡。Google Maps 僅作為外部導航連結。

## 網站部署

正式網站使用 GitHub Pages：

https://donald5043.github.io/HolidayGoWhere/

推送到 repository 預設分支後，`.github/workflows/deploy-pages.yml` 會自動建置及部署。

第一次使用需到 GitHub repository：

1. 開啟 `Settings` → `Pages`。
2. 在 `Build and deployment` 的 `Source` 選擇 `GitHub Actions`。
3. 到 `Actions` 頁面執行 `Deploy website to GitHub Pages`，或再推送一次 commit。

本機模擬 GitHub Pages 子路徑：

```powershell
$env:GITHUB_PAGES='true'
npm run build
npm run preview
```

## 自動增加景點

景點資料來自交通部觀光署「觀光資訊資料庫 V2.1」，目前每日更新且免費授權使用。

```bash
npm run sync:places
```

同步流程會：

1. 下載觀光署完整景點壓縮檔。
2. 過濾停業、座標錯誤與重複資料。
3. 依名稱、介紹和標籤判斷親子相關程度。
4. 自動分類年齡、室內外、遊玩時間與景點類型。
5. 依圖片、地址、介紹、官網等欄位計算品質分數。
6. 將前 1,200 筆寫入 `src/generated/places.json`，由前端以獨立資料區塊按需載入。

可用環境變數調整發布數量：

```powershell
$env:MAX_PLACES=2000
npm run sync:places
```

`.github/workflows/sync-places.yml` 每天臺灣時間約早上 06:15 自動同步；資料有變更時才會提交。

分類是規則推估結果，不代表官方提供的建議年齡。正式營運時，建議再建立管理後台處理人工覆寫與下架。

## 本機 AI 摘要

可使用本機 Ollama 產生親子摘要，不需要任何雲端 API Key：

```powershell
npm run ai:enrich
```

預設使用 `gemma4:e4b`，每次增量處理 10 筆；已完成且來源未更新的景點不會重跑。

```powershell
$env:AI_LIMIT=3
npm run ai:enrich
$env:OLLAMA_MODEL='gemma4:e4b'
npm run ai:enrich
```

結果儲存在 `src/generated/ai-insights.json`。AI 只依官方開放資料整理，網站會顯示免責說明。

## 目前功能

- 手機優先 Responsive UI
- 地區、年齡、室內外、時段篩選
- OpenStreetMap 互動地圖、景點圖釘與篩選同步
- Google Maps 外部路線
- 1,200 筆官方景點與每日同步
- 自動推估親子分類、年齡、室內外與遊玩時間
- 結構化顯示無障礙、坡道、育嬰、尿布台、親子廁所與停車資訊
- 景點詳情、親子設施與官方來源標示
- 部落格及 Instagram 延伸閱讀
- 本機收藏
- PWA 安裝與離線殼層

## 下一階段

- 建立自己的景點資料審核與更新流程
- 後台 CMS 與景點審核流程
- 會員、雲端收藏、家庭成員年齡設定
- 天氣與雨天推薦
- Capacitor 封裝 iOS / Android

## 地圖使用注意

OpenStreetMap 資料可免費使用，目前底圖使用 OSM 公共圖磚，適合開發與一般流量的互動瀏覽。必須保留畫面右下角的 OpenStreetMap attribution，不可批次下載或預抓離線圖磚。若未來流量大幅成長，可改用自架圖磚，不需重做 Leaflet 介面。
