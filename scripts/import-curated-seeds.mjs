/**
 * import-curated-seeds.mjs
 *
 * Adds curated family attraction seeds (from scripts/curated-seeds.json) to the
 * generated region JSON files. Uses only factual public data — name, address,
 * coordinates, opening hours, ticket price, and age range. Descriptions are
 * generated programmatically and do not copy any third-party creative content.
 *
 * Run AFTER sync:places so existing places are already present.
 * Skips any seed that already matches an existing place by name or coordinates.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GENERATED_DIR = path.join(ROOT, 'src', 'generated')
const SEEDS_FILE = path.join(ROOT, 'scripts', 'curated-seeds.json')

const regionMap = {
  '台北市': '北部', '新北市': '北部', '基隆市': '北部',
  '桃園市': '北部', '新竹': '北部', '新竹市': '北部', '新竹縣': '北部',
  '苗栗': '中部', '台中市': '中部', '彰化': '中部', '南投': '中部', '雲林': '中部',
  '嘉義': '南部', '台南市': '南部', '高雄市': '南部', '屏東': '南部',
  '宜蘭': '東部', '花蓮': '東部', '台東': '東部',
  '澎湖': '離島', '金門': '離島', '馬祖': '離島',
}

const regionFiles = {
  '北部': 'places-north.json',
  '中部': 'places-central.json',
  '南部': 'places-south.json',
  '東部': 'places-east.json',
  '離島': 'places-islands.json',
}

const cityNormalMap = {
  '台北市': '臺北市', '新北市': '新北市', '基隆市': '基隆市',
  '桃園市': '桃園市', '新竹': '新竹市', '苗栗': '苗栗縣',
  '台中市': '臺中市', '彰化': '彰化縣', '南投': '南投縣', '雲林': '雲林縣',
  '嘉義': '嘉義市', '台南市': '臺南市', '高雄市': '高雄市', '屏東': '屏東縣',
  '宜蘭': '宜蘭縣', '花蓮': '花蓮縣', '台東': '臺東縣',
  '澎湖': '澎湖縣', '金門': '金門縣', '馬祖': '連江縣',
}

const accentByCategory = {
  '動物萌友': '#f2a65a', '親子樂園': '#ff8066', '探索學習': '#6a8dff',
  '農場體驗': '#68b984', '藝文美感': '#df7bb4', '自然放電': '#42b883',
  '交通迷': '#f4c95d', '假日散步': '#64a7a2',
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

function envToSetting(env) {
  if (env === 'indoor') return '室內'
  if (env === 'outdoor') return '室外'
  return '室內外'
}

function priceLabel(seed) {
  if (seed.priceRange === 'free') return '免費'
  if (seed.price > 0) return `$${seed.price}`
  if (seed.priceRange === 'low') return '$300以下'
  if (seed.priceRange === 'mid') return '$300–500'
  if (seed.priceRange === 'high') return '$500+'
  return '請查官網'
}

function parseCity(addr, region) {
  const m = addr.match(/^(台北市|新北市|基隆市|桃園市|新竹市|新竹縣|苗栗縣|台中市|彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|台南市|高雄市|屏東縣|宜蘭縣|花蓮縣|台東縣|澎湖縣|金門縣|連江縣)/)
  if (m) return m[1].replace(/^台/, '臺')
  return cityNormalMap[region] || region
}

function parseDistrict(addr) {
  const m = addr.match(/(?:市|縣)([^路號\d\s（(]{2,4}(?:區|市|鄉|鎮))/)
  return m ? m[1] : ''
}

function categoryFor(tags, name, env) {
  const text = tags.join(' ') + ' ' + name
  if (/動物|水族|海洋|牧場|農場/.test(text)) return '動物萌友'
  if (/親子|兒童|遊樂|樂園|球池/.test(text)) return '親子樂園'
  if (/博物館|科學|天文|探索|昆蟲|生態館|美術館/.test(text)) return '探索學習'
  if (/觀光工廠|手作|採果|DIY|農莊|莊園/.test(text)) return '農場體驗'
  if (/藝術|文化|圖書|展覽/.test(text)) return '藝文美感'
  if (env === 'outdoor' || /公園|步道|森林|海灘|山|湖|溪|瀑/.test(text)) return '自然放電'
  if (/鐵道|火車|航空/.test(text)) return '交通迷'
  return '假日散步'
}

function buildDescription(seed, category, setting, city) {
  const ageText = seed.ageMin === 0 ? '0歲起即適合' : `${seed.ageMin}歲以上適合`
  const tagText = seed.tags
    .filter((t) => !/^\d|歲|free|免費/.test(t))
    .slice(0, 2)
    .map((t) => t.replace(/[✅✓+]/g, '').trim())
    .filter(Boolean)
    .join('、')
  const priceText = seed.priceRange === 'free' ? '，免費入場' : ''
  return `${seed.name}是位於${city}的${setting}親子景點，${ageText}${priceText}。${tagText ? `以${tagText}為特色，` : ''}適合全家同遊，出發前請確認最新開放資訊。`
}

async function loadRegionFile(filename) {
  const filePath = path.join(GENERATED_DIR, filename)
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

async function main() {
  const seeds = JSON.parse(await fs.readFile(SEEDS_FILE, 'utf-8'))
  console.log(`Loaded ${seeds.length} curated seeds`)

  // Load all existing places indexed by normalized name and coordinates
  const allPlaces = []
  for (const filename of Object.values(regionFiles)) {
    const places = await loadRegionFile(filename)
    allPlaces.push(...places)
  }
  console.log(`Existing places: ${allPlaces.length}`)

  const existingNames = new Set(allPlaces.map((p) => normalize(p.name)))

  // Group new places by region file
  const toAdd = { '北部': [], '中部': [], '南部': [], '東部': [], '離島': [] }
  let skipped = 0

  for (const seed of seeds) {
    const sname = normalize(seed.name)

    // Skip if exact name exists
    if (existingNames.has(sname)) { skipped++; continue }

    // Skip if partial name match
    const partialMatch = [...existingNames].some((en) => sname.includes(en) || en.includes(sname))
    if (partialMatch) { skipped++; continue }

    // Skip if a place is within 300 m
    const tooClose = allPlaces.some((p) => distKm(seed.lat, seed.lng, p.lat, p.lng) < 0.3)
    if (tooClose) { skipped++; continue }

    const region = regionMap[seed.region] || '北部'
    const setting = envToSetting(seed.env)
    const city = parseCity(seed.addr, seed.region)
    const district = parseDistrict(seed.addr)
    const category = categoryFor(seed.tags, seed.name, seed.env)
    const cleanAddr = seed.addr.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim()

    const place = {
      id: `curated-seed-${seed.id}`,
      name: seed.name,
      region,
      city,
      district,
      ageMin: seed.ageMin,
      ageMax: Math.min(seed.ageMax, 12),
      setting,
      duration: '半日',
      category,
      rating: null,
      reviews: 0,
      priceLabel: priceLabel(seed),
      address: cleanAddr,
      hours: seed.hours && !seed.hours.includes('詳細') && !seed.hours.includes('官網') ? seed.hours : '請至官方網站確認',
      lat: seed.lat,
      lng: seed.lng,
      image: '',
      imageCandidates: [],
      accent: accentByCategory[category] || '#64a7a2',
      description: buildDescription(seed, category, setting, city),
      highlights: seed.tags
        .map((t) => t.replace(/[✅✓+]/g, '').trim())
        .filter((t) => t && !/^\d+$/.test(t)),
      facilities: ['出發前請確認設施'],
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(seed.name + ' ' + cleanAddr)}`,
      sources: [
        {
          type: 'Instagram',
          label: `查看 #${seed.name}`,
          url: `https://www.instagram.com/explore/tags/${encodeURIComponent(seed.name)}/`,
        },
        {
          type: '部落格',
          label: '搜尋親子遊記',
          url: `https://www.google.com/search?q=${encodeURIComponent(seed.name + ' 親子 部落格')}`,
        },
      ],
      dataSource: '人工精選景點',
      sourceId: `curated-seed-${seed.id}`,
      qualityScore: 10,
      updatedAt: new Date().toISOString(),
      rainyDay: seed.env === 'indoor',
      placeType: '景點',
      completeness: {
        score: 33,
        missing: ['官方網站', '官方照片', '親子設施', '詳細介紹'],
      },
    }

    toAdd[region].push(place)
  }

  // Write updated files
  let totalAdded = 0
  for (const [region, newPlaces] of Object.entries(toAdd)) {
    if (newPlaces.length === 0) continue
    const filename = regionFiles[region]
    const existing = await loadRegionFile(filename)
    const updated = [...existing, ...newPlaces]
    await fs.writeFile(path.join(GENERATED_DIR, filename), JSON.stringify(updated, null, 2) + '\n', 'utf-8')
    console.log(`${filename}: added ${newPlaces.length} places (total ${updated.length})`)
    totalAdded += newPlaces.length
  }

  console.log(`\nDone — added ${totalAdded}, skipped ${skipped} (already present)`)
}

main().catch((err) => { console.error(err); process.exit(1) })
