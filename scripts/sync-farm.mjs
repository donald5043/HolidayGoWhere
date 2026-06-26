/**
 * sync-farm.mjs
 *
 * Pulls leisure-agriculture-area data from the Ministry of Agriculture (MOA)
 * open data service and merges new entries into the region JSON files.
 *
 * Data source: 農業部「全國休閒農業區旅遊資訊」開放資料 (data.gov.tw dataset 6406)
 * License:     政府資料開放授權條款（OGDL）— free to reuse with attribution
 *
 * Coordinates are already WGS84 (Latitude / Longitude) — no conversion needed.
 * Only factual fields are used (name, address, county/town, coordinates,
 * official photo). The園區介紹 (Introduction) field is creative content and is
 * NOT copied; descriptions are generated programmatically.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GENERATED_DIR = path.join(ROOT, 'src', 'generated')
const SOURCE_URL = 'https://data.moa.gov.tw/Service/OpenData/ODwsv/ODwsvAttractions.aspx?IsTransData=1&UnitId=192'

const regionFiles = {
  '北部': 'places-north.json',
  '中部': 'places-central.json',
  '南部': 'places-south.json',
  '東部': 'places-east.json',
  '離島': 'places-islands.json',
}

const countyToRegion = {
  '臺北市': '北部', '台北市': '北部', '新北市': '北部', '基隆市': '北部',
  '桃園市': '北部', '新竹市': '北部', '新竹縣': '北部',
  '苗栗縣': '中部', '臺中市': '中部', '台中市': '中部', '彰化縣': '中部',
  '南投縣': '中部', '雲林縣': '中部',
  '嘉義市': '南部', '嘉義縣': '南部', '臺南市': '南部', '台南市': '南部',
  '高雄市': '南部', '屏東縣': '南部',
  '宜蘭縣': '東部', '花蓮縣': '東部', '臺東縣': '東部', '台東縣': '東部',
  '澎湖縣': '離島', '金門縣': '離島', '連江縣': '離島',
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

function buildAddress(county, town, addr) {
  const a = (addr || '').trim()
  if (a.startsWith(county) || a.startsWith(county.replace(/^臺/, '台'))) return a
  return `${county}${town}${a}`
}

function buildDescription(name, city) {
  return `${name}是位於${city}的休閒農業區，可體驗農村生態、農事採摘與在地物產，適合親子一同走訪。出發前請確認各場域開放時間與預約方式。`
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(20000),
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
  console.log('Fetching MOA leisure-agriculture open data...')
  const rows = await fetchJson(SOURCE_URL)
  console.log(`Source rows: ${rows.length}`)

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

  for (const row of rows) {
    const name = (row.Name || '').trim()
    const lat = Number(row.Latitude)
    const lng = Number(row.Longitude)
    if (!name || !lat || !lng) { skipped++; continue }
    if (lat < 20 || lat > 27 || lng < 118 || lng > 123) { skipped++; continue }

    const county = (row.County || '').trim().replace(/^台/, '臺')
    const region = countyToRegion[county]
    if (!region) { skipped++; continue }

    if (isDupe(name, lat, lng)) { skipped++; continue }

    const town = (row.Town || '').trim()
    const photo = (row.Photolink || '').trim()
    const place = {
      id: `farm-${row.ID ?? normalize(name)}`,
      name,
      region,
      city: county,
      district: town,
      ageMin: 2,
      ageMax: 12,
      setting: '室外',
      duration: '半日',
      category: '農場體驗',
      rating: null,
      reviews: 0,
      priceLabel: '請查官網',
      address: buildAddress(county, town, row.Address),
      hours: (row.OpenHours || '').trim() || '請至官方網站確認',
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      image: '',
      imageCandidates: photo && /^https?:\/\//.test(photo) ? [photo] : [],
      accent: '#68b984',
      description: buildDescription(name, county),
      highlights: [],
      facilities: ['出發前請確認設施'],
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + county + town)}`,
      sources: [
        {
          type: '官方網站',
          label: '農業部休閒農業區旅遊資訊',
          url: 'https://ezgo.ardswc.gov.tw/',
        },
      ],
      dataSource: '農業部開放資料',
      sourceId: `farm-${row.ID ?? normalize(name)}`,
      qualityScore: 18,
      updatedAt: new Date().toISOString(),
      rainyDay: false,
      placeType: '景點',
      completeness: {
        score: 44,
        missing: ['營業時間', '親子設施', '詳細介紹'],
      },
    }

    toAdd[region].push(place)
    existingNames.add(normalize(name))
  }

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
