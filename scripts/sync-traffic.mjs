import fs from 'node:fs/promises'

// 從 TDX 即時路況(高公局國道 + 公路局省道快速公路)萃取「目前壅塞路段」清單。
// 輸出刻意保持極小(只含壅塞路段與座標),由 CI 每 10 分鐘 force-push 到
// live-traffic 分支,前端透過 raw.githubusercontent.com 讀取(CORS *、快取 5 分鐘)。
const OUTPUT = process.env.TRAFFIC_OUTPUT || 'traffic.json'

const NOW = new Date().toISOString()
const CLIENT_ID = process.env.TDX_CLIENT_ID
const CLIENT_SECRET = process.env.TDX_CLIENT_SECRET
const FETCH_RETRIES = Number(process.env.TDX_FETCH_RETRIES || 3)
const FETCH_TIMEOUT_MS = Number(process.env.TDX_FETCH_TIMEOUT_MS || 60000)

// 車速低於門檻視為壅塞;國道與快速公路都是無號誌道路,低速即塞車
const CONGESTED_SPEED_KMH = Number(process.env.TRAFFIC_CONGESTED_SPEED || 40)
const MAX_SECTIONS = 120

// 省道只收快速公路(無紅綠燈,低速=壅塞);一般省道市區低速是常態,會誤報
const EXPRESSWAY_NUMBERS = new Set([61, 62, 63, 64, 65, 66, 68, 72, 74, 76, 78, 82, 84, 86, 88])

const TDX_TOKEN_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token'
const TDX_BASE = 'https://tdx.transportdata.tw/api/basic/v2/Road/Traffic'
const NETWORKS = [
  { key: 'freeway', label: '國道', path: 'Freeway' },
  { key: 'highway', label: '省道快速公路', path: 'Highway' },
]

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
        console.warn(`[traffic] ${label} retry ${attempt}/${FETCH_RETRIES}: ${error.message}`)
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

/** TDX 有時回傳裸陣列、有時包在具名欄位;都處理 */
function unwrapArray(payload, ...keys) {
  if (Array.isArray(payload)) return payload
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key]
  }
  return []
}

/** 解析 WKT LINESTRING/MULTILINESTRING,取中間頂點當路段代表座標 */
function midpointOfWkt(wkt) {
  const pairs = [...String(wkt || '').matchAll(/(1[12][0-9]\.\d+)\s+(2[0-6]\.\d+)/g)]
  if (!pairs.length) return null
  const mid = pairs[Math.floor(pairs.length / 2)]
  return { lat: Number(Number(mid[2]).toFixed(5)), lng: Number(Number(mid[1]).toFixed(5)) }
}

function expresswayNumber(roadName) {
  const match = String(roadName || '').match(/^台(\d{2})/)
  return match ? Number(match[1]) : null
}

if (!CLIENT_ID || !CLIENT_SECRET) {
  throw new Error('TDX_CLIENT_ID / TDX_CLIENT_SECRET is not set.')
}

const token = await getTdxAccessToken()
const headers = { authorization: `Bearer ${token}`, accept: 'application/json' }
const congested = []
const status = {}

for (const network of NETWORKS) {
  const [livePayload, sectionPayload, shapePayload] = await Promise.all([
    fetchWithRetry(`${TDX_BASE}/Live/${network.path}?%24format=JSON`, { headers }, `Live/${network.path}`),
    fetchWithRetry(`${TDX_BASE}/Section/${network.path}?%24format=JSON`, { headers }, `Section/${network.path}`),
    fetchWithRetry(`${TDX_BASE}/SectionShape/${network.path}?%24format=JSON`, { headers }, `SectionShape/${network.path}`),
  ])
  const liveItems = unwrapArray(livePayload, 'LiveTraffics')
  const sections = new Map(
    unwrapArray(sectionPayload, 'Sections').map((item) => [String(item.SectionID), item]),
  )
  const shapes = new Map(
    unwrapArray(shapePayload, 'SectionShapes').map((item) => [String(item.SectionID), item]),
  )
  if (!liveItems.length) throw new Error(`Live/${network.path}: no live traffic entries`)

  let kept = 0
  for (const live of liveItems) {
    const speed = Number(live.TravelSpeed)
    // 0 或負值多為無資料/斷線,不能當塞車
    if (!Number.isFinite(speed) || speed <= 0 || speed > CONGESTED_SPEED_KMH) continue

    const section = sections.get(String(live.SectionID))
    if (!section) continue
    const roadName = String(section.RoadName || '').trim()
    if (network.key === 'highway') {
      const num = expresswayNumber(roadName)
      if (!num || !EXPRESSWAY_NUMBERS.has(num)) continue
    }

    const mid = midpointOfWkt(shapes.get(String(live.SectionID))?.Geometry)
    if (!mid) continue

    const start = String(section.RoadSection?.Start || section.SectionStart || '').trim()
    const end = String(section.RoadSection?.End || section.SectionEnd || '').trim()
    congested.push({
      id: String(live.SectionID),
      road: roadName || network.label,
      name: String(section.SectionName || '').trim() || (start && end ? `${start}－${end}` : ''),
      dir: String(section.RoadDirection || '').trim() || undefined,
      speed: Math.round(speed),
      lat: mid.lat,
      lng: mid.lng,
    })
    kept += 1
  }
  status[network.key] = { live: liveItems.length, sections: sections.size, shapes: shapes.size, congested: kept }
  console.log(`[traffic] ${network.label}: ${liveItems.length} live sections, ${kept} congested (<= ${CONGESTED_SPEED_KMH} km/h)`)
}

congested.sort((a, b) => a.speed - b.speed)

await fs.writeFile(OUTPUT, JSON.stringify({
  schemaVersion: 1,
  generatedAt: NOW,
  attribution: '即時路況來源:TDX 運輸資料流通服務(交通部高速公路局、交通部公路局)。依政府資料開放授權條款使用。',
  congestedSpeedKmh: CONGESTED_SPEED_KMH,
  syncStatus: status,
  count: Math.min(congested.length, MAX_SECTIONS),
  congested: congested.slice(0, MAX_SECTIONS),
}))
console.log(`Wrote ${Math.min(congested.length, MAX_SECTIONS)} congested sections to ${OUTPUT}`)
