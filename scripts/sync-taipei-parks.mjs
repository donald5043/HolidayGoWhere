/**
 * sync-taipei-parks.mjs
 *
 * 「觀光署景點」名單只收正式認定的觀光景點，親子出遊真正常去的社區共融公園、
 * 特色遊戲場完全不在裡面。這支腳本改抓臺北市政府自己的公園開放資料，把觀光署
 * 漏掉的那一大塊補進來——這是全新的資料來源，不是重複整理現有資料。
 *
 * Data source: 臺北市政府開放資料（公園走透透臺北新花漾）
 * Endpoint:    https://parks.gov.taipei/parks/api/
 * License:     政府資料開放授權條款（OGDL）— free to reuse with attribution
 *
 * 已知資料品質問題：原始資料的 pm_playeq（遊具清單）欄位有累加 bug——同一批
 * 資料裡後面的紀錄會把前面所有紀錄的遊具清單串接起來（第一筆 16 字元，最後一筆
 * 超過 5000 字元），完全不可信，本腳本不使用這個欄位。改用 pm_recreation／
 * pm_service／pm_sports（遊憩／服務／運動設施類別，皆為正常長度）與 pm_overview
 * （文字簡介）組出介紹內容。
 *
 * 只收錄 pm_playtype 為「共融」或「特色」的公園（正式標記為親子重點公園），
 * 一般型社區公園數量太大且多半資訊有限，暫不收錄。
 *
 * 座標已經是 WGS84（不像林務局資料需要 TWD97 轉換），但沒有行政區欄位，用
 * Nominatim（OSM 免費逆地理編碼）查一次、快取起來，之後不用重查。
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GENERATED_DIR = path.join(ROOT, 'src', 'generated')
const DISTRICT_CACHE_FILE = path.join(GENERATED_DIR, 'taipei-parks-district-cache.json')
const API_URL = 'https://parks.gov.taipei/parks/api/'
const USER_AGENT = 'HolidayGoWhere/2.0 (taipei-parks-sync; https://github.com/donald5043/HolidayGoWhere)'

const regionFiles = {
  '北部': 'places-north.json',
}

const INCLUDED_PLAYTYPES = new Set(['共融', '特色'])

function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dl = (v) => (v * Math.PI) / 180
  const a =
    Math.sin(dl(lat2 - lat1) / 2) ** 2 + Math.cos(dl(lat1)) * Math.cos(dl(lat2)) * Math.sin(dl(lng2 - lng1) / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function normalize(name) {
  return String(name || '')
    .replace(/臺/g, '台')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/\s+/g, '')
    .trim()
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function loadRegionFile(filename) {
  try {
    return JSON.parse(await fs.readFile(path.join(GENERATED_DIR, filename), 'utf-8'))
  } catch {
    return []
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

/** Nominatim 逆地理編碼查行政區,一天最多查幾百次淨新增景點,查過的座標永久快取 */
async function lookupDistrict(lat, lng, cache) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`
  if (cache[key] !== undefined) return cache[key]
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&accept-language=zh-TW`
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(15000) })
    const payload = res.ok ? await res.json() : null
    const district = payload?.address?.suburb || payload?.address?.city_district || ''
    cache[key] = district
  } catch {
    cache[key] = ''
  }
  // 遵守 Nominatim 使用政策：最多每秒 1 次查詢
  await sleep(1100)
  return cache[key]
}

function buildDescription(park) {
  const overview = String(park.pm_overview || '').replace(/\s+/g, ' ').trim()
  const facilityParts = [park.pm_recreation, park.pm_service, park.pm_sports]
    .filter(Boolean)
    .join('、')
  const typeLabel = park.pm_playtype === '共融' ? '共融公園' : '特色公園'
  const base = overview || `${park.pm_name}是臺北市${typeLabel}，由${park.pm_unit || '臺北市政府'}管理。`
  return facilityParts ? `${base}\n現場設施類別：${facilityParts}。` : base
}

function buildHighlights(park) {
  const highlights = [park.pm_playtype === '共融' ? '共融遊戲場' : '特色公園']
  for (const field of [park.pm_recreation, park.pm_service, park.pm_sports]) {
    if (!field) continue
    for (const item of field.split(/[、,，]/).map((s) => s.trim()).filter(Boolean)) {
      if (!highlights.includes(item)) highlights.push(item)
    }
  }
  return highlights.slice(0, 8)
}

const TAIPEI_DISTRICTS = [
  '中正區', '大同區', '中山區', '松山區', '大安區', '萬華區',
  '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區',
]

/**
 * pm_location 欄位格式不一致：有的已經包含「臺北市OO區」、有的用「位於OO區…」
 * 描述、有的只是路名片段。直接前綴會重複（例如「臺北市臺北市北投區…」），
 * 所以先把已經出現過的城市/行政區/贅詞去掉，再統一組回乾淨地址。
 */
function cleanLocation(raw) {
  let text = String(raw || '').trim()
  text = text.replace(/^(臺北市|台北市)/, '')
  text = text.replace(/^位於/, '')
  for (const d of TAIPEI_DISTRICTS) {
    if (text.startsWith(d)) {
      text = text.slice(d.length)
      break
    }
  }
  return text.trim()
}

function buildHours(park) {
  const start = park.pm_opening_s || ''
  const end = park.pm_opening_e || ''
  if (!start || !end) return '請至現場確認開放時間'
  if (start === '00:00' && end === '24:00') return '24 小時開放'
  return `${start}–${end}`
}

function buildPlace(park, district) {
  const lat = Number(park.pm_Latitude)
  const lng = Number(park.pm_Longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 20 || lat > 27 || lng < 118 || lng > 123) return null

  const location = cleanLocation(park.pm_location)
  const address = location ? `臺北市${district || ''}${location}` : `臺北市${district || ''}`

  return {
    id: `taipei-park-${park.SeqNo}`,
    name: park.pm_name,
    region: '北部',
    city: '臺北市',
    district: district || '',
    ageMin: 0,
    ageMax: 12,
    setting: '室外',
    duration: '半日',
    category: '親子樂園',
    rating: null,
    reviews: 0,
    priceLabel: '免費',
    address,
    hours: buildHours(park),
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    image: 'https://images.unsplash.com/photo-1596997000103-e597b3ca50df?auto=format&fit=crop&w=900&q=80',
    imageCandidates: [],
    accent: '#ff8066',
    description: buildDescription(park),
    highlights: buildHighlights(park),
    facilities: buildHighlights(park),
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${park.pm_name} ${address}`)}`,
    sources: [
      {
        type: '官方網站',
        label: '臺北市政府開放資料：公園走透透臺北新花漾',
        url: 'https://parks.gov.taipei/',
      },
    ],
    dataSource: '臺北市政府開放資料（公園基本資料）',
    sourceId: `taipei-park-${park.SeqNo}`,
    qualityScore: 20,
    updatedAt: new Date().toISOString(),
    rainyDay: false,
    placeType: '景點',
    completeness: {
      score: 55,
      missing: ['官方照片', '親子設施確認', '票價與開放時間請以現場為準'],
    },
  }
}

async function main() {
  console.log('Fetching Taipei parks open data...')
  const res = await fetch(API_URL, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(60000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${API_URL}`)
  const parks = await res.json()
  console.log(`Fetched ${parks.length} parks total`)

  const targets = parks.filter((park) => INCLUDED_PLAYTYPES.has(park.pm_playtype))
  console.log(`Targeting ${targets.length} 共融／特色 parks`)

  const allExisting = []
  for (const filename of Object.values(regionFiles)) {
    allExisting.push(...(await loadRegionFile(filename)))
  }
  // 台北公園不只可能在北部檔案裡撞名,也可能被其他來源收錄在別區檔案(理論上不會但保險起見全載)
  for (const filename of ['places-central.json', 'places-south.json', 'places-east.json', 'places-islands.json']) {
    allExisting.push(...(await loadRegionFile(filename)))
  }
  console.log(`Existing places (all regions): ${allExisting.length}`)

  const existingNames = new Set(allExisting.map((p) => normalize(p.name)))
  function isDupe(name, lat, lng) {
    const n = normalize(name)
    if (existingNames.has(n)) return true
    if ([...existingNames].some((existingName) => existingName.length >= 3 && (n.includes(existingName) || existingName.includes(n)))) return true
    if (allExisting.some((p) => p.lat && p.lng && distKm(lat, lng, p.lat, p.lng) < 0.25)) return true
    return false
  }

  const novel = targets.filter((park) => {
    const lat = Number(park.pm_Latitude)
    const lng = Number(park.pm_Longitude)
    return Number.isFinite(lat) && Number.isFinite(lng) && !isDupe(park.pm_name, lat, lng)
  })
  console.log(`Net-new after dedup: ${novel.length}`)

  const districtCache = await readJson(DISTRICT_CACHE_FILE, {})
  const newPlaces = []
  let geocoded = 0
  for (const park of novel) {
    const lat = Number(park.pm_Latitude)
    const lng = Number(park.pm_Longitude)
    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`
    const wasCached = districtCache[cacheKey] !== undefined
    const district = await lookupDistrict(lat, lng, districtCache)
    if (!wasCached) {
      geocoded += 1
      if (geocoded % 20 === 0) {
        console.log(`Geocoded ${geocoded} districts so far...`)
        await fs.writeFile(DISTRICT_CACHE_FILE, `${JSON.stringify(districtCache, null, 2)}\n`, 'utf8')
      }
    }
    const place = buildPlace(park, district)
    if (place) {
      newPlaces.push(place)
      existingNames.add(normalize(place.name))
    }
  }
  await fs.writeFile(DISTRICT_CACHE_FILE, `${JSON.stringify(districtCache, null, 2)}\n`, 'utf8')
  console.log(`Newly geocoded this run: ${geocoded}`)

  if (newPlaces.length) {
    const filename = regionFiles['北部']
    const existing = await loadRegionFile(filename)
    const updated = [...existing, ...newPlaces]
    await fs.writeFile(path.join(GENERATED_DIR, filename), `${JSON.stringify(updated, null, 2)}\n`, 'utf-8')
    console.log(`${filename}: +${newPlaces.length} (total ${updated.length})`)
  }

  console.log(`\nDone — added ${newPlaces.length}, skipped ${novel.length - newPlaces.length} (invalid coords)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
