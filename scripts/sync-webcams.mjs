import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DATA_DIR = path.join(ROOT, 'public', 'data')
const OUTPUT = path.join(PUBLIC_DATA_DIR, 'webcams.json')
const SEEDS_FILE = path.join(ROOT, 'scripts', 'webcam-seeds.json')

const NOW = new Date().toISOString()
const IS_CI = process.env.GITHUB_ACTIONS === 'true'
const CLIENT_ID = process.env.TDX_CLIENT_ID
const CLIENT_SECRET = process.env.TDX_CLIENT_SECRET
const FETCH_RETRIES = Number(process.env.TDX_FETCH_RETRIES || 3)
const FETCH_TIMEOUT_MS = Number(process.env.TDX_FETCH_TIMEOUT_MS || 60000)
// 只保留距離任一景點在此範圍內的監視器，避免 webcams.json 無限膨脹
const PLACE_RADIUS_KM = Number(process.env.WEBCAM_PLACE_RADIUS_KM || 5)

const TDX_TOKEN_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token'
const TDX_SOURCES = [
  {
    prefix: 'freeway',
    agency: '交通部高速公路局',
    url: 'https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/CCTV/Freeway?%24format=JSON',
  },
  {
    prefix: 'highway',
    agency: '交通部公路局',
    url: 'https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/CCTV/Highway?%24format=JSON',
  },
  // 離島沒有國道/省道 CCTV，補抓縣市監視器；這幾縣不一定有上架 TDX，
  // optional 來源抓不到不會讓同步失敗
  {
    prefix: 'city-penghu',
    agency: '澎湖縣政府',
    url: 'https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/CCTV/City/PenghuCounty?%24format=JSON',
    optional: true,
  },
  {
    prefix: 'city-kinmen',
    agency: '金門縣政府',
    url: 'https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/CCTV/City/KinmenCounty?%24format=JSON',
    optional: true,
  },
  {
    prefix: 'city-lienchiang',
    agency: '連江縣政府',
    url: 'https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/CCTV/City/LienchiangCounty?%24format=JSON',
    optional: true,
  },
]

const PLACE_FILES = [
  'places-featured.json',
  'places-north.json',
  'places-central.json',
  'places-south.json',
  'places-east.json',
  'places-islands.json',
]

// 台灣本島與離島的粗略範圍，過濾座標明顯錯誤的資料
const TAIWAN_BBOX = { minLat: 21.5, maxLat: 26.5, minLng: 118, maxLng: 122.5 }

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371
  const dLat = (bLat - aLat) * (Math.PI / 180)
  const dLng = (bLng - aLng) * (Math.PI / 180)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * (Math.PI / 180)) * Math.cos(bLat * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(h))
}

async function fetchWithRetry(url, init, label) {
  let lastError
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const response = await fetch(url, { ...init, signal: controller.signal })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      return await response.json()
    } catch (error) {
      lastError = error
      if (attempt < FETCH_RETRIES) {
        console.warn(`[webcams] ${label} retry ${attempt}/${FETCH_RETRIES}: ${error.message}`)
        await wait(1500 * attempt)
      }
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError
}

async function getTdxAccessToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  })
  const payload = await fetchWithRetry(
    TDX_TOKEN_URL,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
    'TDX token',
  )
  if (!payload?.access_token) throw new Error('TDX token response missing access_token')
  return payload.access_token
}

function isHttpsUrl(value) {
  return typeof value === 'string' && value.startsWith('https://')
}

function cctvName(item) {
  const description = String(item.SurveillanceDescription || '').trim()
  if (description) return description
  const road = String(item.RoadName || '').trim()
  const start = String(item.RoadSection?.Start || '').trim()
  const end = String(item.RoadSection?.End || '').trim()
  if (road && start && end) return `${road} ${start}－${end}`
  if (road) return road
  return String(item.CCTVID || '')
}

function normalizeTdxCctv(item, source) {
  const lat = Number(item.PositionLat)
  const lng = Number(item.PositionLon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < TAIWAN_BBOX.minLat || lat > TAIWAN_BBOX.maxLat) return null
  if (lng < TAIWAN_BBOX.minLng || lng > TAIWAN_BBOX.maxLng) return null

  // imageUrl = 靜態快照（低流量、預設顯示），streamUrl = mjpeg 直播（點擊才播）；
  // GitHub Pages 是 https，http 影像會被瀏覽器擋掉，直接略過
  let imageUrl = isHttpsUrl(item.VideoImageURL) ? item.VideoImageURL : null
  let streamUrl = isHttpsUrl(item.VideoStreamURL) ? item.VideoStreamURL : null
  // m3u8/mpd/rtsp 需要額外播放器，先不用
  if (streamUrl && /\.m3u8|\.mpd|^rtsp:/i.test(streamUrl)) streamUrl = null
  // 公路局 TDX 給的串流主機常和快照不同且會 404，快照網址去掉 /snapshot 才是可靠的串流位置
  if (imageUrl?.endsWith('/snapshot')) streamUrl = imageUrl.slice(0, -'/snapshot'.length)
  // 高公局只有 mjpeg，會被誤填進 VideoImageURL 的情況也修正回 streamUrl
  if (imageUrl && /bmjpg|mjpg|mjpeg/i.test(imageUrl)) {
    streamUrl = streamUrl || imageUrl
    imageUrl = null
  }
  if (!imageUrl && !streamUrl) return null

  const id = `${source.prefix}-${String(item.CCTVID || '').trim()}`
  if (id === `${source.prefix}-`) return null

  return {
    id,
    name: cctvName(item),
    lat: Number(lat.toFixed(5)),
    lng: Number(lng.toFixed(5)),
    kind: 'image',
    imageUrl: imageUrl || undefined,
    streamUrl: streamUrl || undefined,
    road: String(item.RoadName || '').trim() || undefined,
    source: source.agency,
  }
}

async function loadPlaceCoords() {
  const coords = []
  const seen = new Set()
  for (const filename of PLACE_FILES) {
    try {
      const payload = JSON.parse(await fs.readFile(path.join(PUBLIC_DATA_DIR, filename), 'utf8'))
      const places = Array.isArray(payload) ? payload : payload?.places ?? []
      for (const place of places) {
        const lat = Number(place?.lat)
        const lng = Number(place?.lng)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
        const key = `${lat.toFixed(3)},${lng.toFixed(3)}`
        if (seen.has(key)) continue
        seen.add(key)
        coords.push({ lat, lng })
      }
    } catch (error) {
      console.warn(`[webcams] skip place file ${filename}: ${error.message}`)
    }
  }
  return coords
}

function nearAnyPlace(cam, placeCoords) {
  // 先用經緯度差快速排除，再算精確距離
  const degLimit = PLACE_RADIUS_KM / 90
  for (const place of placeCoords) {
    if (Math.abs(place.lat - cam.lat) > degLimit) continue
    if (Math.abs(place.lng - cam.lng) > degLimit * 1.2) continue
    if (haversineKm(cam.lat, cam.lng, place.lat, place.lng) <= PLACE_RADIUS_KM) return true
  }
  return false
}

async function readPreviousWebcams() {
  try {
    const payload = JSON.parse(await fs.readFile(OUTPUT, 'utf8'))
    return Array.isArray(payload?.webcams) ? payload.webcams : []
  } catch {
    return []
  }
}

async function loadSeeds() {
  const payload = JSON.parse(await fs.readFile(SEEDS_FILE, 'utf8'))
  const seeds = Array.isArray(payload?.webcams) ? payload.webcams : []
  return seeds.filter((seed) => {
    const valid =
      seed.id &&
      seed.name &&
      Number.isFinite(Number(seed.lat)) &&
      Number.isFinite(Number(seed.lng)) &&
      (seed.kind === 'youtube' ? Boolean(seed.youtubeId) : isHttpsUrl(seed.pageUrl))
    if (!valid) console.warn(`[webcams] invalid seed skipped: ${seed.id || seed.name || 'unknown'}`)
    return valid
  })
}

async function syncTdxWebcams(previousWebcams) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    if (IS_CI) {
      throw new Error('TDX_CLIENT_ID / TDX_CLIENT_SECRET is not set. Add them to GitHub Secrets.')
    }
    const reused = previousWebcams.filter((cam) => cam.kind === 'image')
    console.warn(
      `[webcams] TDX credentials not set; reusing ${reused.length} previous TDX webcams. ` +
        'Set TDX_CLIENT_ID / TDX_CLIENT_SECRET to fetch fresh data.',
    )
    return { webcams: reused, status: reused.length ? 'reused-previous' : 'skipped-no-credentials' }
  }

  const token = await getTdxAccessToken()
  const webcams = []
  const status = {}
  for (const source of TDX_SOURCES) {
    try {
      const payload = await fetchWithRetry(
        source.url,
        { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } },
        `TDX ${source.prefix}`,
      )
      const items = Array.isArray(payload) ? payload : payload?.CCTVs ?? []
      const normalized = items.map((item) => normalizeTdxCctv(item, source)).filter(Boolean)
      if (!normalized.length && !source.optional) throw new Error(`no usable CCTV entries (raw: ${items.length})`)
      webcams.push(...normalized)
      status[source.prefix] = { ok: true, raw: items.length, kept: normalized.length }
    } catch (error) {
      const reused = previousWebcams.filter((cam) => cam.id.startsWith(`${source.prefix}-`))
      if (!reused.length && IS_CI && !source.optional) throw error
      console.warn(`[webcams] TDX ${source.prefix} failed (${error.message}); reusing ${reused.length} previous entries.`)
      webcams.push(...reused)
      status[source.prefix] = { ok: false, error: error.message, reused: reused.length }
    }
  }
  return { webcams, status }
}

const previousWebcams = await readPreviousWebcams()
const seeds = await loadSeeds()
const tdxResult = await syncTdxWebcams(previousWebcams)
const placeCoords = await loadPlaceCoords()

let tdxWebcams = tdxResult.webcams
if (placeCoords.length) {
  const before = tdxWebcams.length
  tdxWebcams = tdxWebcams.filter((cam) => nearAnyPlace(cam, placeCoords))
  console.log(`[webcams] place-proximity filter (${PLACE_RADIUS_KM} km): ${before} -> ${tdxWebcams.length}`)
} else {
  console.warn('[webcams] no place coordinates loaded; skipping proximity filter.')
}

const byId = new Map()
for (const cam of [...seeds, ...tdxWebcams]) byId.set(cam.id, cam)
const webcams = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))

if (!webcams.length) {
  throw new Error('No webcams produced; refusing to write empty dataset.')
}

await fs.mkdir(PUBLIC_DATA_DIR, { recursive: true })
await fs.writeFile(OUTPUT, JSON.stringify({
  schemaVersion: 1,
  generatedAt: NOW,
  attribution: '即時影像來源：TDX 運輸資料流通服務（交通部高速公路局、交通部公路局）、交通部觀光署各國家風景區管理處。依政府資料開放授權條款使用。',
  syncStatus: { tdx: tdxResult.status, seeds: seeds.length, placeRadiusKm: PLACE_RADIUS_KM },
  count: webcams.length,
  webcams,
}))

console.log(`Wrote ${webcams.length} webcams to ${path.relative(ROOT, OUTPUT)} (${seeds.length} curated seeds).`)
