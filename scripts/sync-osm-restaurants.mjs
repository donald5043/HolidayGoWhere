import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT_DIR = path.join(ROOT, 'src', 'generated')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'restaurants-osm.json')

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]
const PER_CITY_CAP = Number(process.env.PER_CITY_CAP || 100)

// Taiwan bbox: south,west,north,east
// `meta` adds timestamp/version per element so we can filter stale entries
const OVERPASS_QUERY = `[out:json][timeout:180][bbox:21.7,118.0,26.5,122.5];
(
  node["amenity"~"^(restaurant|cafe|fast_food|food_court)$"]["name"];
  way["amenity"~"^(restaurant|cafe|fast_food|food_court)$"]["name"];
);
out center tags meta;`

// Drop entries not edited within this many years
const MAX_STALE_YEARS = 4

const regions = {
  北部: ['臺北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣'],
  中部: ['苗栗縣', '臺中市', '彰化縣', '南投縣', '雲林縣'],
  南部: ['嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣'],
  東部: ['宜蘭縣', '花蓮縣', '臺東縣'],
  離島: ['澎湖縣', '金門縣', '連江縣'],
}

const fallbackImageByAmenity = {
  restaurant: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80',
  cafe: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=900&q=80',
  fast_food: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=900&q=80',
  food_court: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80',
}

const accentByCategory = {
  親子餐廳: '#f2a65a',
  咖啡下午茶: '#b98b73',
  甜點冰品: '#df7bb4',
  室內餐廳: '#d88962',
}

function normalizeCity(raw) {
  if (!raw) return null
  return raw.replace(/^台/, '臺').replace(/臺灣省?/, '').trim()
}

function regionFor(city) {
  for (const [region, cities] of Object.entries(regions)) {
    if (cities.includes(city)) return region
  }
  return null
}

function extractCity(tags) {
  const candidates = [tags['addr:city'], tags['addr:county'], tags['is_in:city']]
  for (const raw of candidates) {
    if (!raw) continue
    // Handle compound values like "臺北市;台灣" or "Taiwan;Taipei City"
    for (const part of raw.split(/[,，;；\/]/)) {
      const city = normalizeCity(part.trim())
      if (city && regionFor(city)) return city
      // Try extracting city pattern from string
      const m = city?.match(/([^\s]+[市縣])/)
      if (m) {
        const c2 = normalizeCity(m[1])
        if (c2 && regionFor(c2)) return c2
      }
    }
  }
  return null
}

function extractDistrict(tags) {
  const raw = tags['addr:district'] || tags['addr:suburb'] || tags['addr:town'] || tags['addr:quarter'] || ''
  return normalizeCity(raw) || ''
}

function buildAddress(tags, city, district) {
  const street = tags['addr:street'] || ''
  const num = tags['addr:housenumber'] || ''
  return [city, district, street, num].filter(Boolean).join('') || '地址請見店家資訊'
}

function categoryFor(amenity, name, tags) {
  const text = [name, tags.cuisine || '', tags.description || ''].join(' ')
  if (/親子|兒童|小朋友|家庭|寶寶|幼兒|遊戲區/.test(text)) return '親子餐廳'
  if (amenity === 'cafe' || /咖啡|下午茶|早午餐/.test(text)) return '咖啡下午茶'
  if (/甜點|蛋糕|烘焙|鬆餅|冰品|冰淇淋/.test(text)) return '甜點冰品'
  return '室內餐廳'
}

function familyAmenitiesFor(tags) {
  const yes = (key) => tags[key] === 'yes' ? 'confirmed' : 'notListed'
  const hasDiaper = tags.changing_table === 'yes' || tags['changing_table:location'] !== undefined
  const hasParking = tags.parking === 'yes' || tags['parking'] !== undefined
  const hasWheelchair = tags.wheelchair === 'yes'

  return {
    accessibility: yes('wheelchair'),
    ramp: hasWheelchair ? 'confirmed' : 'notListed',
    nursingRoom: 'notListed',
    diaperTable: hasDiaper ? 'confirmed' : 'notListed',
    familyRestroom: 'notListed',
    parking: hasParking ? 'confirmed' : 'notListed',
    strollerFriendly: hasWheelchair ? 'confirmed' : 'notListed',
    parkingInfo: '停車資訊請向店家確認。',
  }
}

// Build facilities list using keyword text that aligns with restaurantClassifier.ts
function facilitiesFor(tags) {
  const list = []
  if (tags.highchair === 'yes') list.push('高腳椅')         // matches HIGHCHAIR_KW
  if (tags.changing_table === 'yes') list.push('尿布台')
  if (tags.playground === 'yes' || tags['indoor_play_area'] === 'yes') list.push('兒童遊樂設施')
  if (tags.wheelchair === 'yes') list.push('無障礙設施')
  if (tags.outdoor_seating === 'yes') list.push('戶外座位')
  if (tags.takeaway === 'yes') list.push('外帶服務')
  return list.length ? list : ['出發前請確認設施']
}

// Build highlights that feed keyword scoring in restaurantClassifier
function highlightsFor(name, tags) {
  const h = []
  if (/親子|兒童|家庭/.test(name)) h.push('親子友善')
  if (tags.highchair === 'yes') h.push('提供兒童座椅')
  if (tags.playground === 'yes' || tags['indoor_play_area'] === 'yes') h.push('兒童遊戲區')
  if (tags.outdoor_seating === 'yes') h.push('戶外用餐空間')
  if (tags.family === 'yes' || tags['family_friendly'] === 'yes') h.push('家庭友善')
  return h
}

// Google Maps search by coordinates — matches TDX place format exactly
function mapsUrlFor(lat, lng, name) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${lat.toFixed(6)},${lng.toFixed(6)}`)}`
}

function isStale(el) {
  // Explicitly marked as disused / abandoned / demolished
  if (el.tags['disused:amenity'] || el.tags['abandoned:amenity'] || el.tags['demolished:amenity']) return true
  // end_date set and already passed
  const end = el.tags['end_date']
  if (end) {
    const d = new Date(end)
    if (!isNaN(d.getTime()) && d < new Date()) return true
  }
  // Last edit timestamp from `out meta` — skip entries untouched for > MAX_STALE_YEARS
  if (el.timestamp) {
    const ageMs = Date.now() - new Date(el.timestamp).getTime()
    if (ageMs > MAX_STALE_YEARS * 365.25 * 24 * 3600 * 1000) return true
  }
  return false
}

function descriptionFor(name, amenity, tags) {
  const amenityLabel = { restaurant: '餐廳', cafe: '咖啡廳', fast_food: '快餐店', food_court: '美食廣場' }[amenity] || '餐廳'
  const cuisine = tags.cuisine ? `提供${tags.cuisine.replace(/;/g, '、')}料理` : ''
  const parts = [`${name}，位於台灣的${amenityLabel}`, cuisine].filter(Boolean)
  return parts.join('，') + '。更多資訊請參考 OpenStreetMap。'
}

function osmScore(tags, name) {
  let score = 0
  if (tags.highchair === 'yes') score += 20
  if (tags.children_menu === 'yes') score += 15
  if (tags.family === 'yes' || tags['family_friendly'] === 'yes') score += 15
  if (tags.playground === 'yes' || tags['indoor_play_area'] === 'yes') score += 25
  if (tags.changing_table === 'yes') score += 12
  if (tags.wheelchair === 'yes') score += 5
  if (tags.outdoor_seating === 'yes') score += 3
  if (/親子|兒童|家庭|寶寶/.test(name)) score += 15
  if (tags.opening_hours) score += 3
  if (tags.website || tags['contact:website']) score += 3
  return score
}

async function fetchOverpassFromMirror(url) {
  const controller = new AbortController()
  const tid = setTimeout(() => controller.abort(), 190_000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`)
    return await res.json()
  } finally {
    clearTimeout(tid)
  }
}

async function fetchOverpass() {
  let lastErr
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      console.log(`Trying ${mirror} …`)
      const data = await fetchOverpassFromMirror(mirror)
      console.log(`  ✓ Success`)
      return data
    } catch (err) {
      console.warn(`  ✗ ${err.message}`)
      lastErr = err
    }
  }
  throw lastErr
}

async function main() {
  console.log('Querying Overpass API for Taiwan restaurants…')
  let data
  try {
    data = await fetchOverpass()
  } catch (err) {
    console.error('Overpass fetch failed:', err.message)
    process.exit(1)
  }

  console.log(`Raw elements: ${data.elements.length}`)
  const now = new Date().toISOString().slice(0, 10)

  let skippedNoName = 0
  let skippedNoCoords = 0
  let skippedNoCity = 0
  let skippedStale = 0
  let processed = 0

  const perCity = new Map()

  for (const el of data.elements) {
    const tags = el.tags || {}
    const name = (tags.name || '').trim()
    if (!name) { skippedNoName++; continue }
    if (isStale(el)) { skippedStale++; continue }

    let lat, lng
    if (el.type === 'node') {
      lat = el.lat; lng = el.lon
    } else if (el.center) {
      lat = el.center.lat; lng = el.center.lon
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { skippedNoCoords++; continue }

    const city = extractCity(tags)
    if (!city) { skippedNoCity++; continue }

    const region = regionFor(city)
    if (!region) continue

    const amenity = tags.amenity
    const district = extractDistrict(tags)
    const category = categoryFor(amenity, name, tags)
    const score = osmScore(tags, name)
    const hasFamilyInfo = score > 0

    const place = {
      id: `osm-${el.type}-${el.id}`,
      name,
      region,
      city,
      district,
      ageMin: 0,
      ageMax: 12,
      setting: '室內',
      duration: '半日',
      category,
      rating: null,
      reviews: 0,
      priceLabel: '請查店家',
      address: buildAddress(tags, city, district),
      hours: tags.opening_hours || '請以商家公告為準',
      lat,
      lng,
      image: fallbackImageByAmenity[amenity] || fallbackImageByAmenity.restaurant,
      accent: accentByCategory[category] || '#d88962',
      description: descriptionFor(name, amenity, tags),
      highlights: highlightsFor(name, tags),
      facilities: facilitiesFor(tags),
      familyAmenities: hasFamilyInfo ? familyAmenitiesFor(tags) : undefined,
      mapsUrl: mapsUrlFor(lat, lng, name),
      sources: [{ type: '官方網站', label: 'OpenStreetMap', url: `https://www.openstreetmap.org/${el.type}/${el.id}` }],
      dataSource: 'osm',
      sourceId: `${el.type}/${el.id}`,
      qualityScore: 3 + (tags.website || tags['contact:website'] ? 1 : 0) + (tags.opening_hours ? 1 : 0),
      updatedAt: now,
      placeType: '餐飲',
      _osmScore: score,
    }

    if (!perCity.has(city)) perCity.set(city, [])
    perCity.get(city).push(place)
    processed++
  }

  console.log(`\nSkipped — no name: ${skippedNoName}, no coords: ${skippedNoCoords}, no city: ${skippedNoCity}, stale: ${skippedStale}`)
  console.log(`Processed: ${processed} across ${perCity.size} cities\n`)

  const output = []
  for (const [city, places] of [...perCity.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    places.sort((a, b) => b._osmScore - a._osmScore)
    const capped = places.slice(0, PER_CITY_CAP)
    console.log(`  ${city.padEnd(6)} ${places.length.toString().padStart(5)} → ${capped.length}`)
    for (const { _osmScore: _, ...place } of capped) {
      output.push(place)
    }
  }

  console.log(`\nTotal output: ${output.length} places`)
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8')
  console.log(`Written → ${OUTPUT_FILE}`)
}

main()
