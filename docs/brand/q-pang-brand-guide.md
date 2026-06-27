# Q 胖（Q-Pang）品牌使用規範

Q 胖是 HolidayGoWhere 的親子旅遊嚮導。使用目標是讓產品更有陪伴感，但不能讓介面變成廉價卡通網站。

## 角色定位

- 角色：親子旅遊小嚮導
- 個性：溫暖、可靠、好奇、會幫爸媽先整理資訊
- 使用情境：首頁靈感、空狀態、新手導引、收藏/行程提示、404 或搜尋無結果
- 避免情境：每張景點 fallback、所有按鈕、資訊密集列表；過度使用會降低專業感

## 色彩系統

主要色彩來自 Q 胖角色設定，但網站 UI 仍以溫暖、乾淨、Premium Family Travel 為主。

| Token | 用途 | 色值 |
| --- | --- | --- |
| `--qpang-hat` | 探險帽黃 | `#FBD36B` |
| `--qpang-fur` | 毛色棕橘 | `#E7B37A` |
| `--qpang-belly` | 肚子米色 | `#FFF1DA` |
| `--qpang-backpack` | 背包藍 | `#74C5F4` |
| `--qpang-scarf` | 圍巾綠 | `#8ED26A` |
| `--qpang-orange` | 活力橘 | `#FFB366` |
| `--qpang-sky` | 天空藍 | `#BEE6FF` |
| `--qpang-grass` | 草地綠 | `#C7E8A3` |
| `--qpang-brown` | 深咖啡 | `#7A5A3A` |

## 資產使用

目前正式使用的輸出資產：

- Header / Profile / PWA：`public/brand/q-pang-app-icon-*.png`
- Hero mascot：`public/mascot/q-pang-waving-premium.png`
- 空狀態 / 探索導引：`public/mascot/q-pang-map-premium.png`
- 收藏空狀態：`public/mascot/q-pang-favorites.png`
- 搜尋無結果：`public/mascot/q-pang-no-results.png`
- 雨天提示：`public/mascot/q-pang-rainy.png`

原始素材包與設計稿不要直接進入 UI；先輸出成適當尺寸、透明背景、檔名語意明確的 web asset。

## 使用規則

1. 主 Logo / favicon 可使用 Q 胖頭像，但頁面標題仍以文字呈現。
2. Hero 可使用一個大型 mascot，其他區塊避免同頁重複大型角色。
3. 空狀態可使用 Q 胖看地圖或揮手，搭配明確 CTA。
4. 景點圖片 fallback 不要全部使用 Q 胖，避免使用者誤以為景點照片都是同一張。
5. 手機版要確保 mascot 不遮住標題、搜尋列、CTA。

## 後續可補的角色狀態

- 收藏成功：開心表情
- 行程規劃：看地圖 / 背包
- 雨天備案：雨傘版本
- 404：拿木牌版本
