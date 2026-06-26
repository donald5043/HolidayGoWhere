/**
 * sync-forest.mjs
 *
 * Pulls attraction data from the Taiwan Forestry Bureau open data API
 * (recreation.forest.gov.tw/mis/api) and merges new entries into the
 * region JSON files.
 *
 * Data source: 行政院農業部林務局山林悠遊網 開放資料
 * License:     政府資料開放授權條款（OGDL）— free to reuse with attribution
 *
 * Endpoints used:
 *   BasicInfo/RA          — 國家森林遊樂區 (22 places)
 *   BasicInfo/ForestPark  — 低海拔森林園區
 *   BasicInfo/NEC         — 自然教育中心
 *   BasicInfo/EEC         — 生態教育館
 *   BasicInfo/Culture     — 林業文化園區
 *   Admission/RA          — 門票資料 (joined by TYP_ID)
 *   Admission/Culture     — 林業文化園區門票
 *
 * Coordinates are in TWD97 TM2 (Taiwan Datum 1997, Zone 2) and are
 * converted to WGS84 via inverse Transverse Mercator projection.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GENERATED_DIR = path.join(ROOT, 'src', 'generated')
const BASE = 'https://recreation.forest.gov.tw/mis/api'

const regionFiles = {
  '北部': 'places-north.json',
  '中部': 'places-central.json',
  '南部': 'places-south.json',
  '東部': 'places-east.json',
  '離島': 'places-islands.json',
}

// ── Coordinate conversion ────────────────────────────────────────────────────

/**
 * Convert TWD97 TM2 (Zone 2, central meridian 121°E) X/Y to WGS84 lat/lng.
 * Uses inverse Transverse Mercator projection (GRS80 ellipsoid, which is
 * identical to WGS84 for practical purposes).
 */
function twd97ToWgs84(X, Y) {
  const lon0 = 121 * Math.PI / 180  // central meridian radians
  const k0 = 0.9999                  // scale factor
  const dx = 250000                  // false easting (m)

  const a = 6378137.0                // GRS80 semi-major axis
  const e2 = 0.00669437999014        // first eccentricity squared

  const x = X - dx
  const y = Y

  // Footprint latitude via series expansion
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  const M = y / k0
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))
  const phi1 = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu)

  const sinP = Math.sin(phi1)
  const cosP = Math.cos(phi1)
  const tanP = Math.tan(phi1)
  const N1 = a / Math.sqrt(1 - e2 * sinP ** 2)
  const T1 = tanP ** 2
  const C1 = e2 / (1 - e2) * cosP ** 2
  const R1 = a * (1 - e2) / Math.pow(1 - e2 * sinP ** 2, 1.5)
  const D = x / (N1 * k0)

  const lat = phi1 - (N1 * tanP / R1) * (
    D ** 2 / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * e2 / (1 - e2)) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * e2 / (1 - e2) - 3 * C1 ** 2) * D ** 6 / 720
  )
  const lon = lon0 + (
    D
    - (1 + 2 * T1 + C1) * D ** 3 / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * e2 / (1 - e2) + 24 * T1 ** 2) * D ** 5 / 120
  ) / cosP

  return { lat: lat * 180 / Math.PI, lng: lon * 180 / Math.PI }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dl = (v) => v * Math.PI / 180
  const a = Math.sin(dl(lat2 - lat1) / 2) ** 2
    + Math.cos(dl(lat1)) * Math.cos(dl(lat2)) * Math.sin(dl(lng2 - lng1) / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function normalize(name) {
  return name.replace(/臺/g, '台').replace(/（/g, '(').replace(/）/g, ')').trim()
}

function addrToRegion(addr) {
  if (/^(臺北市|台北市|新北市|基隆市|桃園市|新竹市|新竹縣)/.test(addr)) return '北部'
  if (/^(苗栗縣|臺中市|台中市|彰化縣|南投縣|雲林縣)/.test(addr)) return '中部'
  if (/^(嘉義市|嘉義縣|臺南市|台南市|高雄市|屏東縣)/.test(addr)) return '南部'
  if (/^(宜蘭縣|花蓮縣|臺東縣|台東縣)/.test(addr)) return '東部'
  if (/^(澎湖縣|金門縣|連江縣)/.test(addr)) return '離島'
  return null
}

function parseCity(addr) {
  const m = addr.match(/^(臺北市|台北市|新北市|基隆市|桃園市|新竹市|新竹縣|苗栗縣|臺中市|台中市|彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|臺南市|台南市|高雄市|屏東縣|宜蘭縣|花蓮縣|臺東縣|台東縣|澎湖縣|金門縣|連江縣)/)
  if (!m) return addr.slice(0, 3)
  return m[1].replace(/^台/, '臺')
}

function parseDistrict(addr) {
  const m = addr.match(/(?:市|縣)([^路號\d\s]{2,4}(?:區|市|鄉|鎮))/)
  return m ? m[1] : ''
}

// Strip leading zip code (e.g. "267 宜蘭縣..." → "宜蘭縣...")
function cleanAddr(addr) {
  return (addr || '').replace(/^\d{3,6}\s*/, '').trim()
}

/**
 * Extract the best price label from an admission fee array.
 * Prefers weekday full price; falls back to any full price; then free.
 * fee array element: { dayType, feeType, fee, feeMemo }
 */
function parsePriceLabel(feeArr) {
  if (!feeArr || feeArr.length === 0) return '請查官網'

  const allFree = feeArr.every((f) => f.feeType === '免票' || f.fee === 0)
  if (allFree) return '免費'

  // Weekday full price first, then any full price
  const weekdayFull = feeArr.find((f) => f.feeType === '全票' && f.dayType === '平日')
  const anyFull = feeArr.find((f) => f.feeType === '全票')
  const chosen = weekdayFull || anyFull
  if (chosen) return chosen.fee === 0 ? '免費' : `$${chosen.fee}`

  return '請查官網'
}

function buildDescription(name, category, setting, city) {
  const settingText = { '室內': '室內', '室外': '室外', '室內外': '室內外' }[setting] ?? '室外'
  const catText = {
    '自然放電': '自然生態',
    '探索學習': '自然教育',
    '藝文美感': '林業文化',
    '交通迷': '林業鐵路',
  }[category] ?? '森林'
  return `${name}是位於${city}的${catText}${settingText}景點，由農業部林務局管理，適合親子同遊。出發前請至山林悠遊網確認最新開放資訊。`
}

const accentByCategory = {
  '自然放電': '#42b883',
  '探索學習': '#6a8dff',
  '藝文美感': '#df7bb4',
  '交通迷': '#f4c95d',
}

function buildPlace({ name, addr, X, Y, openTime, priceLabel, category, setting, sourceId }) {
  if (!X || !Y || X === 0 || Y === 0) return null
  const addr2 = cleanAddr(addr)
  const region = addrToRegion(addr2)
  if (!region) return null

  const { lat, lng } = twd97ToWgs84(Number(X), Number(Y))
  // Sanity check: Taiwan is roughly 21.9–25.3°N, 119.5–122.1°E
  if (lat < 20 || lat > 27 || lng < 118 || lng > 123) return null

  const city = parseCity(addr2)
  const district = parseDistrict(addr2)

  return {
    id: `forest-${sourceId}`,
    name,
    region,
    city,
    district,
    ageMin: category === '探索學習' ? 3 : 2,
    ageMax: 12,
    setting,
    duration: '半日',
    category,
    rating: null,
    reviews: 0,
    priceLabel,
    address: addr2,
    hours: openTime || '請至官方網站確認',
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    image: '',
    imageCandidates: [],
    accent: accentByCategory[category] ?? '#42b883',
    description: buildDescription(name, category, setting, city),
    highlights: [],
    facilities: ['出發前請確認設施'],
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + addr2)}`,
    sources: [
      {
        type: '官方網站',
        label: '山林悠遊網',
        url: 'https://recreation.forest.gov.tw/',
      },
    ],
    dataSource: '林務局開放資料',
    sourceId: `forest-${sourceId}`,
    qualityScore: 20,
    updatedAt: new Date().toISOString(),
    rainyDay: setting === '室內',
    placeType: '景點',
    completeness: {
      score: 55,
      missing: ['官方照片', '親子設施', '詳細介紹'],
    },
  }
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return res.json()
}

async function loadRegionFile(filename) {
  try {
    return JSON.parse(await fs.readFile(path.join(GENERATED_DIR, filename), 'utf-8'))
  } catch {
    return []
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching Forestry Bureau open data...')

  const [ra, forestPark, nec, eec, culture, admRA, admCulture] = await Promise.all([
    fetchJson(`${BASE}/BasicInfo/RA`),
    fetchJson(`${BASE}/BasicInfo/ForestPark`),
    fetchJson(`${BASE}/BasicInfo/NEC`),
    fetchJson(`${BASE}/BasicInfo/EEC`),
    fetchJson(`${BASE}/BasicInfo/Culture`),
    fetchJson(`${BASE}/Admission/RA`),
    fetchJson(`${BASE}/Admission/Culture`).catch(() => []),
  ])

  console.log(`RA: ${ra.length}, ForestPark: ${forestPark.length}, NEC: ${nec.length}, EEC: ${eec.length}, Culture: ${culture.length}`)

  // Build admission maps keyed by TYP_ID
  const admRAMap = Object.fromEntries((admRA || []).map((e) => [e.TYP_ID, e.fee]))
  const admCultureMap = Object.fromEntries((admCulture || []).map((e) => [e.TYP_ID, e.fee]))

  // Load all existing places for dedup
  const allExisting = []
  for (const filename of Object.values(regionFiles)) {
    allExisting.push(...await loadRegionFile(filename))
  }
  console.log(`Existing places: ${allExisting.length}`)

  const existingNames = new Set(allExisting.map((p) => normalize(p.name)))

  function isDupe(name, lat, lng) {
    const n = normalize(name)
    if (existingNames.has(n)) return true
    if ([...existingNames].some((en) => n.includes(en) || en.includes(n))) return true
    if (allExisting.some((p) => p.lat && p.lng && distKm(lat, lng, p.lat, p.lng) < 0.3)) return true
    return false
  }

  const toAdd = { '北部': [], '中部': [], '南部': [], '東部': [], '離島': [] }
  let skipped = 0

  function tryAdd(place) {
    if (!place) { skipped++; return }
    if (isDupe(place.name, place.lat, place.lng)) { skipped++; return }
    toAdd[place.region].push(place)
    existingNames.add(normalize(place.name))
  }

  // 1. 國家森林遊樂區
  for (const item of ra) {
    const feeArr = admRAMap[item.TYP_ID]
    const place = buildPlace({
      name: item.RA_name,
      addr: item.ADDRESS,
      X: item.X, Y: item.Y,
      openTime: item.OPEN_TIME,
      priceLabel: parsePriceLabel(feeArr),
      category: '自然放電',
      setting: '室外',
      sourceId: `ra-${item.TYP_ID}`,
    })
    tryAdd(place)
  }

  // 2. 低海拔森林園區
  for (const item of forestPark) {
    const feeArr = admRAMap[item.TYP_ID]
    const place = buildPlace({
      name: item.RA_name,
      addr: item.ADDRESS,
      X: item.X, Y: item.Y,
      openTime: item.OPEN_TIME,
      priceLabel: parsePriceLabel(feeArr) || '免費',
      category: '自然放電',
      setting: '室外',
      sourceId: `fp-${item.TYP_ID ?? normalize(item.RA_name)}`,
    })
    tryAdd(place)
  }

  // 3. 自然教育中心
  for (const item of nec) {
    const place = buildPlace({
      name: item.AduName,
      addr: item.Addr,
      X: item.X, Y: item.Y,
      openTime: item.OpenTime,
      priceLabel: '請查官網',
      category: '探索學習',
      setting: '室內外',
      sourceId: `nec-${item.AduShort ?? normalize(item.AduName)}`,
    })
    tryAdd(place)
  }

  // 4. 生態教育館
  for (const item of eec) {
    const place = buildPlace({
      name: item.AduName,
      addr: item.Addr,
      X: item.X, Y: item.Y,
      openTime: item.OpenTime,
      priceLabel: item.NECFee?.includes('免費') ? '免費' : (item.NECFee || '請查官網'),
      category: '探索學習',
      setting: '室內',
      sourceId: `eec-${normalize(item.AduName)}`,
    })
    tryAdd(place)
  }

  // 5. 林業文化園區
  for (const item of culture) {
    const feeArr = admCultureMap[item.TYP_ID]
    const place = buildPlace({
      name: item.RA_name,
      addr: item.ADDRESS,
      X: item.X, Y: item.Y,
      openTime: item.OPEN_TIME,
      priceLabel: parsePriceLabel(feeArr) || '免費',
      category: '藝文美感',
      setting: '室內外',
      sourceId: `culture-${item.TYP_ID ?? normalize(item.RA_name)}`,
    })
    tryAdd(place)
  }

  // Write updated files
  let totalAdded = 0
  for (const [region, newPlaces] of Object.entries(toAdd)) {
    if (newPlaces.length === 0) continue
    const filename = regionFiles[region]
    const existing = await loadRegionFile(filename)
    const updated = [...existing, ...newPlaces]
    await fs.writeFile(
      path.join(GENERATED_DIR, filename),
      JSON.stringify(updated, null, 2) + '\n',
      'utf-8',
    )
    console.log(`${filename}: +${newPlaces.length} (total ${updated.length})`)
    totalAdded += newPlaces.length
  }

  console.log(`\nDone — added ${totalAdded}, skipped ${skipped}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
