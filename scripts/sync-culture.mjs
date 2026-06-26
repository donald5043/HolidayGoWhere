/**
 * sync-culture.mjs
 *
 * Pulls cultural facility data from the Ministry of Culture (文化部)
 * open data API and merges new entries into the region JSON files.
 *
 * Data source: 文化部 cloud.culture.tw 開放資料
 * License:     政府資料開放授權條款（OGDL）— free to reuse with attribution
 *
 * Types fetched:
 *   typeId=H  博物館       (145 records, ~131 with coords)
 *   typeId=K  特色圖書館   (149 records, ~74 with coords)
 *
 * Factual fields used: name, cityName, address, latitude, longitude.
 * The intro field is creative content and is NOT copied.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GENERATED_DIR = path.join(ROOT, 'src', 'generated')
const BASE = 'https://cloud.culture.tw/frontsite/trans/emapOpenDataAction.do?method=exportEmapJson&typeId='

const regionFiles = {
  '北部': 'places-north.json',
  '中部': 'places-central.json',
  '南部': 'places-south.json',
  '東部': 'places-east.json',
  '離島': 'places-islands.json',
}

const cityToRegion = {
  '臺北市': '北部', '台北市': '北部', '新北市': '北部', '基隆市': '北部',
  '桃園市': '北部', '新竹市': '北部', '新竹縣': '北部',
  '苗栗縣': '中部', '臺中市': '中部', '台中市': '中部', '彰化縣': '中部',
  '南投縣': '中部', '雲林縣': '中部',
  '嘉義市': '南部', '嘉義縣': '南部', '臺南市': '南部', '台南市': '南部',
  '高雄市': '南部', '屏東縣': '南部',
  '宜蘭縣': '東部', '花蓮縣': '東部', '臺東縣': '東部', '台東縣': '東部',
  '澎湖縣': '離島', '金門縣': '離島', '連江縣': '離島',
}

// cityName from API may be "臺北市  松山區"
function parseCity(cityName) {
  return (cityName || '').split(/\s+/)[0].replace(/^台/, '臺')
}

function parseDistrict(cityName, address) {
  // Try from cityName second token first (e.g. "松山區")
  const parts = (cityName || '').split(/\s+/)
  if (parts.length > 1 && /[區市鄉鎮]$/.test(parts[1])) return parts[1]
  // Fall back to parsing address
  const m = address.match(/(?:市|縣)([^路號\d\s]{2,4}(?:區|市|鄉|鎮))/)
  return m ? m[1] : ''
}

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

// Map museum subtype → our category
function museumCategory(type) {
  if (/自然|科學|科技|天文|生態|地質/.test(type)) return '探索學習'
  return '藝文美感'
}

function buildDescription(name, category, city) {
  if (category === '探索學習') {
    return `${name}是位於${city}的自然科學博物館，藉由展覽與互動體驗激發孩子的好奇心，適合親子同遊。出發前請至官網確認開放時間與票價。`
  }
  if (category === '藝文美感') {
    return `${name}是位於${city}的文化藝術場館，提供豐富的展覽與人文體驗，適合帶孩子認識在地歷史與藝術。出發前請至官網確認開放時間。`
  }
  return `${name}是位於${city}的特色圖書館，擁有獨特的閱讀空間與豐富館藏，適合親子共讀與文化體驗。`
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(30000),
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

async function main() {
  console.log('Fetching Ministry of Culture open data...')

  const [museums, libraries] = await Promise.all([
    fetchJson(`${BASE}H`),
    fetchJson(`${BASE}K`),
  ])

  console.log(`博物館: ${museums.length}, 特色圖書館: ${libraries.length}`)

  // Load existing places for dedup
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

  function processRow(row, category, setting, ageMin) {
    const name = (row.name || '').trim()
    const lat = Number(row.latitude)
    const lng = Number(row.longitude)
    if (!name || !lat || !lng) { skipped++; return }
    if (lat < 20 || lat > 27 || lng < 118 || lng > 123) { skipped++; return }

    const city = parseCity(row.cityName)
    const region = cityToRegion[city]
    if (!region) { skipped++; return }

    if (isDupe(name, lat, lng)) { skipped++; return }

    const district = parseDistrict(row.cityName, row.address || '')
    const addr = (row.address || '').replace(/^\d{3,6}/, '').trim()
    const cat = category === 'museum' ? museumCategory(row.type || '') : '藝文美感'
    const accent = cat === '探索學習' ? '#6a8dff' : '#df7bb4'

    const place = {
      id: `culture-${row.mainTypePk ?? normalize(name)}`,
      name,
      region,
      city,
      district,
      ageMin,
      ageMax: 12,
      setting,
      duration: '半日',
      category: cat,
      rating: null,
      reviews: 0,
      priceLabel: '請查官網',
      address: addr || `${city}${district}`,
      hours: '請至官方網站確認',
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      image: '',
      imageCandidates: [],
      accent,
      description: buildDescription(name, cat, city),
      highlights: [],
      facilities: ['出發前請確認設施'],
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + addr)}`,
      sources: [
        {
          type: '官方網站',
          label: '文化部博物館資訊',
          url: row.website || row.srcWebsite || 'https://museums.moc.gov.tw/',
        },
      ],
      dataSource: '文化部開放資料',
      sourceId: `culture-${row.mainTypePk ?? normalize(name)}`,
      qualityScore: 22,
      updatedAt: new Date().toISOString(),
      rainyDay: setting === '室內',
      placeType: '景點',
      completeness: {
        score: 44,
        missing: ['票價', '開放時間', '親子設施', '官方照片'],
      },
    }

    toAdd[region].push(place)
    existingNames.add(normalize(name))
  }

  // Process museums (博物館)
  for (const row of museums) {
    processRow(row, 'museum', '室內', 3)
  }

  // Process special libraries (特色圖書館)
  for (const row of libraries) {
    processRow(row, 'library', '室內', 0)
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
