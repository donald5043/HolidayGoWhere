/**
 * import-michelin.mjs
 *
 * Geocodes and imports Michelin Guide Taiwan 2024 restaurants
 * from scripts/michelin-seeds.json into the region place files.
 *
 * Strategy:
 *   1. If the restaurant already exists (by name) → add michelinAward field to existing record
 *   2. Otherwise → geocode via Nominatim (1 req/sec), then insert as new record
 *   3. Geocode cascade: full address → name+city+district → name+city
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GENERATED_DIR = path.join(ROOT, 'src', 'generated')
const SEEDS_FILE = path.join(ROOT, 'scripts', 'michelin-seeds.json')

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const RATE_LIMIT_MS = 1100

// Approximate bounding boxes per city to reject wrong geocode results
const CITY_BOUNDS = {
  '臺北市': { latMin: 24.95, latMax: 25.22, lngMin: 121.44, lngMax: 121.68 },
  '新北市': { latMin: 24.85, latMax: 25.35, lngMin: 121.30, lngMax: 122.00 },
  '基隆市': { latMin: 25.06, latMax: 25.21, lngMin: 121.59, lngMax: 121.79 },
  '桃園市': { latMin: 24.70, latMax: 25.10, lngMin: 121.00, lngMax: 121.45 },
  '新竹市': { latMin: 24.75, latMax: 24.85, lngMin: 120.90, lngMax: 121.05 },
  '新竹縣': { latMin: 24.60, latMax: 24.90, lngMin: 120.80, lngMax: 121.30 },
  '苗栗縣': { latMin: 24.30, latMax: 24.70, lngMin: 120.70, lngMax: 121.20 },
  '臺中市': { latMin: 23.90, latMax: 24.40, lngMin: 120.50, lngMax: 121.20 },
  '彰化縣': { latMin: 23.75, latMax: 24.15, lngMin: 120.35, lngMax: 120.75 },
  '南投縣': { latMin: 23.50, latMax: 24.30, lngMin: 120.60, lngMax: 121.40 },
  '雲林縣': { latMin: 23.45, latMax: 23.85, lngMin: 120.10, lngMax: 120.65 },
  '嘉義市': { latMin: 23.44, latMax: 23.52, lngMin: 120.40, lngMax: 120.50 },
  '嘉義縣': { latMin: 23.20, latMax: 23.55, lngMin: 120.30, lngMax: 120.95 },
  '臺南市': { latMin: 22.80, latMax: 23.45, lngMin: 119.95, lngMax: 120.55 },
  '高雄市': { latMin: 22.40, latMax: 23.05, lngMin: 120.15, lngMax: 120.85 },
  '屏東縣': { latMin: 21.90, latMax: 22.75, lngMin: 120.35, lngMax: 120.95 },
  '宜蘭縣': { latMin: 24.55, latMax: 24.90, lngMin: 121.50, lngMax: 121.95 },
  '花蓮縣': { latMin: 23.20, latMax: 24.55, lngMin: 121.20, lngMax: 121.75 },
  '臺東縣': { latMin: 22.20, latMax: 23.35, lngMin: 120.75, lngMax: 121.55 },
  '澎湖縣': { latMin: 23.15, latMax: 23.80, lngMin: 119.30, lngMax: 119.75 },
  '金門縣': { latMin: 24.35, latMax: 24.55, lngMin: 118.20, lngMax: 118.45 },
  '連江縣': { latMin: 25.90, latMax: 26.40, lngMin: 119.85, lngMax: 120.55 },
}

const regionFiles = {
  '北部': 'places-north.json',
  '中部': 'places-central.json',
  '南部': 'places-south.json',
  '東部': 'places-east.json',
  '離島': 'places-islands.json',
}

const cityToRegion = {
  '台北市': '北部', '臺北市': '北部',
  '新北市': '北部',
  '基隆市': '北部',
  '桃園市': '北部',
  '新竹市': '北部', '新竹縣': '北部',
  '苗栗縣': '中部',
  '台中市': '中部', '臺中市': '中部',
  '彰化縣': '中部',
  '南投縣': '中部',
  '雲林縣': '中部',
  '嘉義市': '南部', '嘉義縣': '南部',
  '台南市': '南部', '臺南市': '南部',
  '高雄市': '南部',
  '屏東縣': '南部',
  '宜蘭縣': '東部',
  '花蓮縣': '東部',
  '台東縣': '東部', '臺東縣': '東部',
  '澎湖縣': '離島',
  '金門縣': '離島',
  '連江縣': '離島',
}

function normalizeCity(city) {
  return city.replace(/^台/, '臺')
}

function normalizeName(name) {
  return name.replace(/臺/g, '台').replace(/（/g, '(').replace(/）/g, ')').trim().toLowerCase()
}

function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dl = (v) => v * Math.PI / 180
  const a = Math.sin(dl(lat2 - lat1) / 2) ** 2
    + Math.cos(dl(lat1)) * Math.cos(dl(lat2)) * Math.sin(dl(lng2 - lng1) / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function slugify(str) {
  return str.replace(/[^\w一-鿿]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

async function loadJson(filepath) {
  try {
    return JSON.parse(await fs.readFile(filepath, 'utf-8'))
  } catch {
    return []
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function geocode(query, city) {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=tw`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'HolidayGoWhere/1.0 (holiday-go-where family travel app)' },
  })
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`)
  const data = await res.json()
  const bounds = CITY_BOUNDS[city]
  for (const item of data) {
    const lat = parseFloat(item.lat)
    const lng = parseFloat(item.lon)
    // First: validate within city bounds if available
    if (bounds) {
      if (lat >= bounds.latMin && lat <= bounds.latMax && lng >= bounds.lngMin && lng <= bounds.lngMax) {
        return { lat, lng }
      }
    } else if (lat >= 21.7 && lat <= 26.5 && lng >= 118 && lng <= 122.5) {
      return { lat, lng }
    }
  }
  return null
}

function awardLabel(award) {
  return { '3star': '米其林三星', '2star': '米其林二星', '1star': '米其林一星', 'bib_gourmand': '必比登推介' }[award] || '米其林'
}

function awardQualityScore(award) {
  return { '3star': 10, '2star': 9, '1star': 8, 'bib_gourmand': 7 }[award] ?? 7
}

function priceForAward(award) {
  if (award === '3star' || award === '2star') return '$$$$'
  if (award === '1star') return '$$$'
  return '$$'
}

function cuisineToCategory(cuisine) {
  if (!cuisine) return '餐廳'
  if (/日本|壽司|天婦羅|燒肉|拉麵|割烹/.test(cuisine)) return '日式料理'
  if (/法式|法國|義大利|西班牙|歐洲|歐式|現代歐/.test(cuisine)) return '西式料理'
  if (/粵菜|廣東|港式/.test(cuisine)) return '中式料理'
  if (/台灣|台式|台菜|傳統/.test(cuisine)) return '台灣料理'
  if (/淮揚|杭州|北京|川式|湘/.test(cuisine)) return '中式料理'
  if (/海鮮|魚|蟹/.test(cuisine)) return '海鮮料理'
  if (/火鍋|涮/.test(cuisine)) return '火鍋'
  if (/牛排|燒烤/.test(cuisine)) return '燒烤'
  if (/咖啡|甜點|下午茶/.test(cuisine)) return '咖啡下午茶'
  if (/小籠包|蒸餃|餃子|包子|米糕|肉燥|割包|油飯|粽|粥|麵|飯/.test(cuisine)) return '小吃'
  if (/創意|新加坡|亞洲/.test(cuisine)) return '創意料理'
  if (/泰式|越南|韓式/.test(cuisine)) return '亞洲料理'
  return '餐廳'
}

function imageForCuisine(cuisine) {
  if (!cuisine) return 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=80'
  if (/日本|壽司|天婦羅|割烹/.test(cuisine)) return 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=900&q=80'
  if (/台灣|台菜|台式|傳統/.test(cuisine)) return 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=900&q=80'
  if (/粵菜|廣東|淮揚|杭州/.test(cuisine)) return 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=900&q=80'
  return 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=80'
}

function highlightsForAward(award, cuisine) {
  const base = {
    '3star': ['米其林三星', '頂級美食體驗'],
    '2star': ['米其林二星', '精緻料理'],
    '1star': ['米其林一星', '優質餐飲'],
    'bib_gourmand': ['必比登推介', '物超所值'],
  }[award] ?? ['米其林推薦']
  return cuisine ? [...base, cuisine] : base
}

function generateDescription(seed) {
  const city = normalizeCity(seed.city)
  const district = seed.district ? `${city}${seed.district}` : city
  const cuisine = seed.cuisine || '料理'
  if (seed.award === '3star') {
    return `${seed.name}榮獲米其林三星，是指南評定值得專程造訪的殿堂級餐廳。供應${cuisine}，以精湛廚藝詮釋食材本質，每道料理皆體現主廚的創意與職人精神。座落於${district}，是台灣頂級餐飲的代表之一。`
  }
  if (seed.award === '2star') {
    return `${seed.name}獲得米其林二星肯定，代表出色烹飪技藝值得繞道前往。以${cuisine}為核心，料理細節考究、風味層次豐富，展現對食材與技法的深刻掌握。位於${district}，是品味精緻飲食文化的首選之一。`
  }
  if (seed.award === '1star') {
    return `${seed.name}榮獲米其林一星認證，以高水準的${cuisine}獲得評鑑青睞。料理品質穩定、用餐體驗精緻，對食材選用與烹調工序均有獨到堅持。位於${district}，是探索精緻餐飲的好去處。`
  }
  return `${seed.name}入選米其林必比登推介，以合理價格提供優質${cuisine}。必比登代表「物超所值」的好餐廳，注重食物本味與烹調功夫。位於${district}，是在地美食文化的鮮活縮影。`
}

function buildPlaceRecord(seed, city, region, coords) {
  const id = `michelin-${slugify(city)}-${slugify(seed.name)}`
  const normalAddress = seed.address
    ? seed.address.replace(/^台/, '臺')
    : `${city}${seed.district || ''}`
  return {
    id,
    name: seed.name,
    region,
    city,
    district: seed.district || '',
    ageMin: 0,
    ageMax: 12,
    setting: '室內',
    duration: '半日',
    category: cuisineToCategory(seed.cuisine),
    rating: null,
    reviews: 0,
    priceLabel: priceForAward(seed.award),
    address: normalAddress,
    hours: '請查詢官方資訊',
    lat: coords.lat,
    lng: coords.lng,
    image: imageForCuisine(seed.cuisine),
    accent: '#c8956c',
    description: generateDescription(seed),
    highlights: highlightsForAward(seed.award, seed.cuisine),
    facilities: ['出發前請確認設施'],
    familyAmenities: {
      accessibility: 'notListed',
      ramp: 'notListed',
      nursingRoom: 'notListed',
      diaperTable: 'notListed',
      familyRestroom: 'notListed',
      parking: 'notListed',
      strollerFriendly: 'notListed',
      parkingInfo: '停車資訊請向店家確認。',
    },
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${coords.lat.toFixed(6)},${coords.lng.toFixed(6)}`,
    sources: [{
      type: '官方資料',
      label: seed.nameEn ? `Michelin Guide - ${seed.nameEn}` : 'Michelin Guide Taiwan 2024',
      url: 'https://guide.michelin.com/tw/zh_TW/taipei-region/taipei/restaurants',
    }],
    dataSource: 'michelin',
    michelinAward: seed.award,
    cuisine: seed.cuisine || '',
    qualityScore: awardQualityScore(seed.award),
    updatedAt: new Date().toISOString().split('T')[0],
    placeType: '餐飲',
  }
}

async function main() {
  const seeds = JSON.parse(await fs.readFile(SEEDS_FILE, 'utf-8'))
  console.log(`Michelin seeds: ${seeds.length}`)

  // Load all region data into memory (we'll mutate and write back)
  const regionData = {}
  for (const [region, filename] of Object.entries(regionFiles)) {
    regionData[region] = await loadJson(path.join(GENERATED_DIR, filename))
  }

  // Build name → record index for fast lookup across all regions
  // (for UPDATE: mark existing records with michelinAward)
  const nameIndex = new Map()  // normName → { region, index }
  for (const [region, places] of Object.entries(regionData)) {
    for (let i = 0; i < places.length; i++) {
      nameIndex.set(normalizeName(places[i].name), { region, index: i })
    }
  }

  // Also build existing-restaurant list for coord dedup on NEW records
  const existingRestaurants = Object.values(regionData)
    .flat()
    .filter((p) => p.placeType === '餐飲')

  let updated = 0
  let added = 0
  let geocodeFail = 0
  let needsGeocode = []

  // First pass: mark existing records with michelinAward
  for (const seed of seeds) {
    const n = normalizeName(seed.name)
    const found = nameIndex.get(n)
    if (found) {
      const place = regionData[found.region][found.index]
      place.michelinAward = seed.award
      if (!place.cuisine) place.cuisine = seed.cuisine || ''
      updated++
      console.log(`  ↑ updated: ${seed.name} (${awardLabel(seed.award)}) in ${found.region}`)
    } else {
      needsGeocode.push(seed)
    }
  }

  console.log(`\nUpdated ${updated} existing records. Geocoding ${needsGeocode.length} new entries...\n`)

  // Second pass: geocode and insert new records
  for (const seed of needsGeocode) {
    const city = normalizeCity(seed.city)
    const region = cityToRegion[city]
    if (!region) { console.warn(`Unknown city: ${seed.city}`); continue }

    const queries = []
    if (seed.address && seed.address.trim()) queries.push(seed.address.trim())
    if (seed.district && seed.district.trim()) queries.push(`${seed.name} ${seed.city}${seed.district} 台灣`)
    queries.push(`${seed.name} ${seed.city} 台灣`)

    let coords = null
    for (const query of queries) {
      try {
        await sleep(RATE_LIMIT_MS)
        coords = await geocode(query, city)
        if (coords) break
      } catch (err) {
        console.warn(`Geocode error for "${seed.name}": ${err.message}`)
      }
    }

    if (!coords) {
      geocodeFail++
      console.log(`  ✗ geocode fail: ${seed.name} (${seed.city})`)
      continue
    }

    // Skip if geocode lands within 50 m of an existing restaurant (same physical location)
    const nearDupe = existingRestaurants.some(
      (p) => p.lat && p.lng && distKm(coords.lat, coords.lng, p.lat, p.lng) < 0.05,
    )
    if (nearDupe) {
      console.log(`  ~ coord-skip: ${seed.name} (duplicate location)`)
      continue
    }

    const place = buildPlaceRecord(seed, city, region, coords)
    regionData[region].push(place)
    existingRestaurants.push(place)
    nameIndex.set(normalizeName(seed.name), { region, index: regionData[region].length - 1 })
    added++
    console.log(`  ✓ added: ${seed.name} (${awardLabel(seed.award)}) → ${region} [${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}]`)
  }

  // Write all region files back
  let filesWritten = 0
  for (const [region, filename] of Object.entries(regionFiles)) {
    const places = regionData[region]
    await fs.writeFile(
      path.join(GENERATED_DIR, filename),
      JSON.stringify(places, null, 2) + '\n',
      'utf-8',
    )
    const michelinCount = places.filter((p) => p.michelinAward).length
    console.log(`${filename}: ${places.length} places (${michelinCount} Michelin-tagged)`)
    filesWritten++
  }

  console.log(`\nDone — updated ${updated} existing, added ${added} new, geocode fail ${geocodeFail}`)
}

main().catch((err) => { console.error(err); process.exit(1) })
