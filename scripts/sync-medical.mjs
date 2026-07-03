/**
 * sync-medical.mjs — 建立藥局與急診醫院資料
 *
 * 資料來源（皆免費開放）：
 * 1. 健保特約藥局：kiang/pharmacies（NHIA 健保特約藥局名冊 + 座標，
 *    口罩地圖時代起持續維護的社群整理版）
 * 2. 醫院：OpenStreetMap Overpass（amenity=hospital），
 *    emergency=yes 標記為急診醫院
 *
 * 輸出 public/data/medical-facilities.json，沿用 RescueSupply schema，
 * 讓主頁「臨時補給」模式與 Q媽管家直接取用。
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT_FILE = path.join(ROOT, 'public', 'data', 'medical-facilities.json')

const PHARMACY_URL = 'https://raw.githubusercontent.com/kiang/pharmacies/master/json/points.json'

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

const HOSPITAL_QUERY = `[out:json][timeout:180][bbox:21.7,118.0,26.5,122.5];
(
  node["amenity"="hospital"]["name"];
  way["amenity"="hospital"]["name"];
);
out center tags;`

// 城市概略邊界（座標 fallback 用，OSM 醫院常缺 addr:city）
const CITY_BOUNDS = {
  '臺北市': { latMin: 24.95, latMax: 25.22, lngMin: 121.44, lngMax: 121.68 },
  '基隆市': { latMin: 25.06, latMax: 25.21, lngMin: 121.59, lngMax: 121.79 },
  '新北市': { latMin: 24.85, latMax: 25.35, lngMin: 121.28, lngMax: 122.02 },
  '桃園市': { latMin: 24.70, latMax: 25.12, lngMin: 120.98, lngMax: 121.45 },
  '新竹市': { latMin: 24.75, latMax: 24.85, lngMin: 120.90, lngMax: 121.05 },
  '新竹縣': { latMin: 24.55, latMax: 24.92, lngMin: 120.85, lngMax: 121.35 },
  '苗栗縣': { latMin: 24.28, latMax: 24.75, lngMin: 120.60, lngMax: 121.25 },
  '臺中市': { latMin: 23.95, latMax: 24.45, lngMin: 120.45, lngMax: 121.30 },
  '彰化縣': { latMin: 23.75, latMax: 24.20, lngMin: 120.25, lngMax: 120.75 },
  '南投縣': { latMin: 23.42, latMax: 24.30, lngMin: 120.60, lngMax: 121.35 },
  '雲林縣': { latMin: 23.45, latMax: 23.90, lngMin: 120.05, lngMax: 120.75 },
  '嘉義市': { latMin: 23.44, latMax: 23.52, lngMin: 120.40, lngMax: 120.50 },
  '嘉義縣': { latMin: 23.18, latMax: 23.62, lngMin: 120.10, lngMax: 120.95 },
  '臺南市': { latMin: 22.85, latMax: 23.45, lngMin: 119.95, lngMax: 120.65 },
  '高雄市': { latMin: 22.45, latMax: 23.30, lngMin: 120.15, lngMax: 121.05 },
  '屏東縣': { latMin: 21.88, latMax: 22.90, lngMin: 120.40, lngMax: 120.95 },
  '宜蘭縣': { latMin: 24.30, latMax: 24.95, lngMin: 121.30, lngMax: 122.05 },
  '花蓮縣': { latMin: 23.05, latMax: 24.40, lngMin: 120.95, lngMax: 121.80 },
  '臺東縣': { latMin: 21.95, latMax: 23.45, lngMin: 120.70, lngMax: 121.65 },
  '澎湖縣': { latMin: 23.15, latMax: 23.90, lngMin: 119.30, lngMax: 119.75 },
  '金門縣': { latMin: 24.15, latMax: 24.58, lngMin: 118.10, lngMax: 118.55 },
  '連江縣': { latMin: 25.90, latMax: 26.40, lngMin: 119.85, lngMax: 120.55 },
}

function normalizeCity(raw) {
  if (!raw) return null
  const city = raw.replace(/^台/, '臺').trim()
  return CITY_BOUNDS[city] ? city : null
}

function cityFromCoords(lat, lng) {
  for (const [city, b] of Object.entries(CITY_BOUNDS)) {
    if (lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax) return city
  }
  return null
}

function mapsUrlFor(name, lat, lng) {
  return `https://www.google.com/maps/search/${encodeURIComponent(name)}/@${lat.toFixed(6)},${lng.toFixed(6)},17z`
}

// service_periods：21 字元 = 週一到週日 ×（早/午/晚），N=營業、Y=休
function hoursFromServicePeriods(periods) {
  if (!periods || periods.length !== 21) return '營業時間請電話確認'
  const closed = [...periods].filter((c) => c === 'Y').length
  if (closed === 0) return '每日早午晚均有營業時段（出發前請電話確認）'
  if (closed >= 15) return '營業時段較少，請先電話確認'
  return '大部分時段營業（出發前請電話確認）'
}

async function fetchPharmacies() {
  console.log('Fetching pharmacies from kiang/pharmacies (NHIA registry)...')
  const res = await fetch(PHARMACY_URL)
  if (!res.ok) throw new Error(`pharmacies HTTP ${res.status}`)
  const geojson = await res.json()
  const checkedAt = new Date().toISOString().split('T')[0]
  const out = []
  let skipped = 0

  for (const feature of geojson.features ?? []) {
    const p = feature.properties ?? {}
    const coords = feature.geometry?.coordinates
    const lng = Number(coords?.[0])
    const lat = Number(coords?.[1])
    if (!p.name || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 21 || lat > 27) { skipped++; continue }
    const city = normalizeCity(p.county) ?? cityFromCoords(lat, lng)
    if (!city) { skipped++; continue }

    out.push({
      id: `pharmacy-${p.id || `${lat}-${lng}`}`,
      name: p.name,
      brand: '健保特約藥局',
      category: 'pharmacy',
      city,
      district: p.town || '',
      address: p.address || '',
      phone: p.phone || '',
      hours: hoursFromServicePeriods(p.service_periods),
      lat,
      lng,
      mapsUrl: mapsUrlFor(p.name, lat, lng),
      source: {
        type: 'open_data',
        label: '健保特約藥局名冊（kiang/pharmacies 整理）',
        url: 'https://github.com/kiang/pharmacies',
        checkedAt,
      },
      confidence: 'high',
      tags: ['藥局', '健保特約'],
    })
  }

  console.log(`Pharmacies: ${out.length} (skipped ${skipped})`)
  return out
}

async function fetchFromOverpass(query) {
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      console.log(`Overpass: trying ${new URL(mirror).host}...`)
      const res = await fetch(mirror, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (Array.isArray(data.elements)) return data.elements
    } catch (err) {
      console.warn(`  ${new URL(mirror).host} failed: ${err.message}`)
    }
  }
  throw new Error('All Overpass mirrors failed')
}

async function fetchHospitals() {
  console.log('Fetching hospitals from OSM Overpass...')
  const elements = await fetchFromOverpass(HOSPITAL_QUERY)
  const checkedAt = new Date().toISOString().split('T')[0]
  const out = []
  let skipped = 0

  for (const el of elements) {
    const tags = el.tags ?? {}
    const name = tags['name:zh'] || tags.name
    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) { skipped++; continue }
    // 排除牙醫/獸醫/診所類誤標
    if (/牙醫|牙科診所|動物|獸醫|寵物/.test(name)) { skipped++; continue }

    const city = normalizeCity(tags['addr:city']) ?? cityFromCoords(lat, lng)
    if (!city) { skipped++; continue }

    const hasEmergency = tags.emergency === 'yes'
    const street = tags['addr:street'] || ''
    const num = tags['addr:housenumber'] ? `${tags['addr:housenumber']}號` : ''
    const district = tags['addr:district'] || tags['addr:suburb'] || ''

    out.push({
      id: `hospital-osm-${el.type}-${el.id}`,
      name,
      brand: hasEmergency ? '急診醫院' : '醫院',
      category: 'hospital_emergency',
      city,
      district,
      address: [city, district, street, num].filter(Boolean).join('') || '地址請以地圖為準',
      phone: tags.phone || tags['contact:phone'] || '',
      hours: hasEmergency ? '急診通常 24 小時（請電話確認）' : (tags.opening_hours || '請電話確認'),
      lat,
      lng,
      mapsUrl: mapsUrlFor(name, lat, lng),
      source: {
        type: 'osm',
        label: 'OpenStreetMap',
        url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
        checkedAt,
      },
      confidence: hasEmergency ? 'high' : 'medium',
      tags: hasEmergency ? ['醫院', '急診'] : ['醫院'],
    })
  }

  const emergencyCount = out.filter((h) => h.tags.includes('急診')).length
  console.log(`Hospitals: ${out.length} (emergency-tagged ${emergencyCount}, skipped ${skipped})`)
  return out
}

async function main() {
  const [pharmacies, hospitals] = await Promise.all([fetchPharmacies(), fetchHospitals()])
  const facilities = [...hospitals, ...pharmacies]

  const payload = {
    generatedAt: new Date().toISOString(),
    sources: [
      { label: '健保特約藥局名冊（kiang/pharmacies）', url: 'https://github.com/kiang/pharmacies' },
      { label: 'OpenStreetMap（醫院）', url: 'https://www.openstreetmap.org' },
    ],
    summary: {
      total: facilities.length,
      pharmacies: pharmacies.length,
      hospitals: hospitals.length,
      emergencyTagged: hospitals.filter((h) => h.tags.includes('急診')).length,
    },
    facilities,
  }

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(payload) + '\n', 'utf-8')
  const sizeMb = (Buffer.byteLength(JSON.stringify(payload)) / 1024 / 1024).toFixed(2)
  console.log(`\nWrote ${OUTPUT_FILE} — ${facilities.length} facilities (${sizeMb} MB)`)
}

main().catch((err) => { console.error(err); process.exit(1) })
