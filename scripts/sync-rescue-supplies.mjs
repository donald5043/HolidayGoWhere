import fs from 'node:fs/promises'
import path from 'node:path'

const OUT_FILE = path.join(process.cwd(), 'public', 'data', 'rescue-supplies.json')
const REGISTRY_FILE = path.join(process.cwd(), 'scripts', 'rescue-brand-registry.json')
const USER_AGENT = 'HolidayGoWhere/0.1 rescue-supplies-sync'
const checkedAt = new Date().toISOString()

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#40;/g, '(')
    .replace(/&#41;/g, ')')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function parseCityDistrict(address) {
  const normalized = address.replace(/^(\d{3,6})\s*/, '').replace(/^台/, '臺')
  const match = normalized.match(/^(臺北市|新北市|桃園市|新竹市|新竹縣|宜蘭縣|基隆市|臺中市|台中市|彰化縣|臺南市|台南市|高雄市|屏東縣|苗栗縣|雲林縣|嘉義市|嘉義縣|南投縣|花蓮縣|臺東縣|台東縣)([^路街大道巷弄號]+?[區鄉鎮市])/)
  return {
    city: match?.[1]?.replace(/^台/, '臺') || '',
    district: match?.[2] || '',
  }
}

function tagsForBabySupply(brand) {
  if (brand === '卡多摩') return ['尿布', '奶粉', '推車', '汽座', '奶瓶奶嘴', '孕婦用品']
  if (brand === '安琪兒') return ['尿布', '推車', '汽座', '奶瓶奶嘴', '嬰兒床', '孕婦用品']
  return ['尿布', '奶粉', '親子補給']
}

function createEvidence({ brand, adapter, sourceUrl, geocodingStatus = 'missing' }) {
  return {
    candidateDiscovery: {
      method: 'brand_registry',
      matchedKeywords: [brand.name, ...(brand.aliases || [])],
      sourceLabels: ['救援品牌 registry', ...brand.regions.map((region) => `${region}候選`)],
    },
    officialVerification: {
      status: 'verified',
      sourceUrl,
      adapter,
    },
    geocoding: {
      status: geocodingStatus,
      provider: geocodingStatus === 'missing' ? 'none' : 'official_google_maps_redirect',
    },
  }
}

async function readRegistry() {
  const text = await fs.readFile(REGISTRY_FILE, 'utf8')
  return JSON.parse(text)
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT },
  })
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  return response.text()
}

function baseSupply({ brand, storeName, address, phone, hours, mapsUrl, adapter, geoUrl }) {
  const { city, district } = parseCityDistrict(address)
  return {
    id: `baby-${brand.id}-${slugify(storeName)}`,
    name: storeName.startsWith(brand.name) ? storeName : `${brand.name} ${storeName}`,
    brand: brand.name,
    category: brand.category,
    city,
    district,
    address,
    phone,
    hours,
    lat: null,
    lng: null,
    mapsUrl,
    geoUrl,
    source: { type: 'official', label: `${brand.name}官方門市資訊`, url: brand.officialUrl, checkedAt },
    confidence: 'medium',
    tags: tagsForBabySupply(brand.name),
    evidence: createEvidence({ brand, adapter, sourceUrl: brand.officialUrl }),
    notes: '官方門市資料整理；商品庫存與營業異動請出發前電話確認。',
  }
}

function parseKodomoOfficialHtml(html, brand) {
  const blocks = [...html.matchAll(/<div class="moreBox">([\s\S]*?)<\/div>\s*<\/div>/g)].map((match) => match[1])
  return blocks.flatMap((block) => {
    const name = decodeHtml(block.match(/<h3>[\s\S]*?title="([^"]+)"[\s\S]*?<\/h3>/)?.[1] || '')
    const addressMatch = block.match(/地址：[\s\S]*?<a href="([^"]+)"[\s\S]*?<strong>([\s\S]*?)<\/strong>/)
    const phone = decodeHtml(block.match(/電話：\s*([^<\n]+)/)?.[1] || '')
    const hours = decodeHtml(block.match(/營業時間：\s*([^<\n]+)/)?.[1] || '')
    if (!name || !addressMatch) return []
    const mapsUrl = decodeHtml(addressMatch[1])
    const address = decodeHtml(stripTags(addressMatch[2]))
    return [baseSupply({
      brand,
      storeName: name,
      address,
      phone,
      hours,
      mapsUrl,
      adapter: 'kodomoOfficialHtml',
    })]
  })
}

function parseAngelbabyOfficialHtml(html, brand) {
  const gridItems = [...html.matchAll(/<div id="page-item-[^"]+" class="Grid-item Grid-text-item">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g)]
    .map((match) => match[1])
  return gridItems.flatMap((block) => {
    const titleText = stripTags(block.match(/Grid-item-title[\s\S]*?<\/div>/)?.[0] || '')
    const nameMatch = titleText.match(/(安琪兒\s*[^ ]{0,18}(?:店|館|中心)|大直忠泰店(?:\s*New!)?)/)
    const name = decodeHtml(nameMatch?.[1] || '')
    if (!name) return []

    const content = block.match(/Grid-item-content">([\s\S]*?)<\/div>/)?.[1] || block
    const addressAnchor = content.match(/<a href="([^"]*maps[^"]*|[^"]*goo\.gl\/maps[^"]*)"[^>]*>([\s\S]*?)<\/a>/)
    const fallbackAddress = stripTags(content).match(/(?:\d{3}\s*)?(?:台北市|臺北市|新北市|桃園市|新竹市|新竹縣|台中市|臺中市)[^T\n]{6,60}/)?.[0]
    const address = decodeHtml(stripTags(addressAnchor?.[2] || fallbackAddress || '')).replace(/^\d{3}\s*/, '')
    const mapsUrl = decodeHtml(addressAnchor?.[1] || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${address}`)}`)
    const phones = [...content.matchAll(/TEL[:：]\s*([0-9()\-\s]{8,20})/g)].map((match) => decodeHtml(match[1]))
    if (!address) return []
    return [baseSupply({
      brand,
      storeName: name,
      address,
      phone: phones.join(' / '),
      hours: '請見官方門市資訊',
      mapsUrl,
      adapter: 'angelbabyOfficialHtml',
    })]
  })
}

function parseMamawayOfficialHtml(html, brand) {
  const blocks = [...html.matchAll(/<div class="item Store_Item"[\s\S]*?<\/div>/g)]
    .map((match) => match[0])
  return blocks.flatMap((block) => {
    const storeName = decodeHtml(
      block.match(/<a class="hide-m"[^>]*>([\s\S]*?)<\/a>/)?.[1] ||
      block.match(/<span class="hide-pc">([\s\S]*?)<\/span>/)?.[1] ||
      '',
    )
    const detailHref = block.match(/<a class="hide-m" href="([^"]+)"/)?.[1] || ''
    const addressMatch = block.match(/<a[^>]+class="map-link"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/) ||
      block.match(/href="([^"]*google\.com\/maps\/place\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    const phone = decodeHtml(block.match(/門市電話\s*([^<]+)/)?.[1] || block.match(/櫃位電話\s*([^<]+)/)?.[1] || '')
    const hours = decodeHtml(
      [...block.matchAll(/<span>([\s\S]*?)<\/span>/g)]
        .map((match) => stripTags(match[1]))
        .find((text) => /AM|PM|營業|百貨|週|周|依/.test(text) && !/電話/.test(text)) || '',
    )
    if (!storeName || !addressMatch) return []
    const mapsUrl = decodeHtml(addressMatch[1])
    const address = decodeHtml(stripTags(addressMatch[2])).replace(/^(\d{3,6})\s*/, '')
    return [baseSupply({
      brand,
      storeName,
      address,
      phone,
      hours: hours || '請見官方門市資訊',
      mapsUrl,
      geoUrl: detailHref ? new URL(detailHref, brand.officialUrl).toString() : undefined,
      adapter: 'mamawayOfficialHtml',
    })]
  })
}

const adapters = {
  kodomoOfficialHtml: parseKodomoOfficialHtml,
  angelbabyOfficialHtml: parseAngelbabyOfficialHtml,
  mamawayOfficialHtml: parseMamawayOfficialHtml,
}

async function coordinatesFromGoogleMapsUrl(url) {
  if (!url) return null
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 HolidayGoWhere rescue-sync' },
    })
    const finalUrl = response.url || ''
    const exact = finalUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
    if (exact) return { lat: Number(exact[1]), lng: Number(exact[2]), status: 'exact' }
    const center = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
    if (center) return { lat: Number(center[1]), lng: Number(center[2]), status: 'map_center' }
  } catch {
    return null
  }
  return null
}

async function coordinatesFromMamawayDetail(url) {
  if (!url) return null
  try {
    const html = await fetchText(url)
    const embed = html.match(/google\.com\/maps\/embed\?pb=([^"]+)/)?.[1] || ''
    const match = embed.match(/!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/)
    if (match) return { lat: Number(match[2]), lng: Number(match[1]), status: 'exact' }
  } catch {
    return null
  }
  return null
}

async function withCoordinates(supplies) {
  const output = []
  for (const supply of supplies) {
    const coords = await coordinatesFromGoogleMapsUrl(supply.mapsUrl) ||
      await coordinatesFromMamawayDetail(supply.geoUrl)
    const cleanSupply = { ...supply }
    delete cleanSupply.geoUrl
    output.push({
      ...cleanSupply,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      confidence: coords?.status === 'exact' ? 'high' : coords ? 'medium' : 'medium',
      evidence: {
        ...supply.evidence,
        geocoding: {
          status: coords?.status ?? 'missing',
          provider: coords ? 'official_google_maps_redirect' : 'none',
        },
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
  return output
}

function dedupe(supplies) {
  const seen = new Set()
  return supplies.filter((supply) => {
    const key = `${supply.brand}-${supply.name}-${supply.address}`.replace(/\s+/g, '')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildCandidateReport(registry) {
  const active = registry.brands.filter((brand) => brand.status === 'active')
  const candidates = registry.brands
    .filter((brand) => brand.status !== 'active')
    .sort((a, b) => b.priority - a.priority)
    .map((brand) => ({
      id: brand.id,
      name: brand.name,
      category: brand.category,
      regions: brand.regions,
      aliases: brand.aliases,
      status: brand.status,
      nextStep: '需要建立官方門市 adapter，通過解析與座標補強後才會上架。',
    }))

  return {
    activeBrands: active.map((brand) => ({
      id: brand.id,
      name: brand.name,
      adapter: brand.adapter,
      officialUrl: brand.officialUrl,
      regions: brand.regions,
    })),
    candidateBrands: candidates,
    keywords: registry.candidateKeywords,
    governmentSources: registry.governmentCandidateSources,
  }
}

function buildPipelineMetadata({ registry, rawSupplies, supplies }) {
  const withCoordinates = supplies.filter((supply) => typeof supply.lat === 'number' && typeof supply.lng === 'number')
  const exact = supplies.filter((supply) => supply.evidence?.geocoding?.status === 'exact')
  return {
    version: 2,
    generatedAt: checkedAt,
    philosophy: '六層模式：先找候選、再官方驗證、再解析門市、再補座標、再信任分級，最後才分層呈現在前端。',
    layers: [
      {
        id: 'candidate_discovery',
        label: '候選店家發現',
        status: 'implemented_seeded',
        description: '使用政府資料來源清單、品牌 registry 與母嬰關鍵字維護候選池；大型政府資料不直接灌進前端。',
        sources: registry.governmentCandidateSources,
        keywords: registry.candidateKeywords,
      },
      {
        id: 'official_verification',
        label: '官方來源確認',
        status: 'implemented',
        description: '只有具官方門市頁 adapter 的品牌會進入上架資料。',
      },
      {
        id: 'store_extraction',
        label: '分店資訊解析',
        status: 'implemented',
        description: `本次從官方門市頁解析 ${rawSupplies.length} 筆門市候選。`,
      },
      {
        id: 'geocoding',
        label: '地圖座標補強',
        status: 'implemented',
        description: `使用官方 Google Maps 連結轉址解析座標；${withCoordinates.length}/${supplies.length} 筆可上地圖，其中 ${exact.length} 筆為精準地點座標。`,
      },
      {
        id: 'confidence',
        label: '信任分級',
        status: 'implemented',
        description: 'high=官方門市 + 精準座標；medium=官方門市但座標仍需確認；low 暫不上架地圖。',
      },
      {
        id: 'presentation',
        label: '前端分層呈現',
        status: 'implemented',
        description: '以「臨時補給」模式獨立載入與顯示，不混入原本景點推薦。',
      },
    ],
  }
}

async function collectOfficialStores(registry) {
  const activeBrands = registry.brands.filter((brand) => brand.status === 'active')
  const stores = []
  for (const brand of activeBrands) {
    const adapter = adapters[brand.adapter]
    if (!adapter) {
      console.warn(`No adapter for ${brand.name}: ${brand.adapter}`)
      continue
    }
    const html = await fetchText(brand.officialUrl)
    stores.push(...adapter(html, brand))
  }
  return dedupe(stores)
}

async function main() {
  const registry = await readRegistry()
  const rawSupplies = await collectOfficialStores(registry)
  const supplies = await withCoordinates(rawSupplies)
  const candidateReport = buildCandidateReport(registry)
  const payload = {
    generatedAt: checkedAt,
    sources: [
      ...candidateReport.activeBrands.map((brand) => ({ label: `${brand.name}官方門市資訊`, url: brand.officialUrl })),
      ...registry.governmentCandidateSources.map((source) => ({ label: source.label, url: source.url })),
    ],
    pipeline: buildPipelineMetadata({ registry, rawSupplies, supplies }),
    discovery: candidateReport,
    summary: {
      total: supplies.length,
      withCoordinates: supplies.filter((supply) => typeof supply.lat === 'number' && typeof supply.lng === 'number').length,
      highConfidence: supplies.filter((supply) => supply.confidence === 'high').length,
      mediumConfidence: supplies.filter((supply) => supply.confidence === 'medium').length,
      activeBrands: candidateReport.activeBrands.length,
      candidateBrands: candidateReport.candidateBrands.length,
      brands: Object.fromEntries(
        [...new Set(supplies.map((supply) => supply.brand))]
          .map((brand) => [brand, supplies.filter((supply) => supply.brand === brand).length]),
      ),
    },
    supplies,
  }
  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true })
  await fs.writeFile(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${payload.summary.total} rescue supplies (${payload.summary.withCoordinates} with coordinates) to ${OUT_FILE}`)
  console.log(`Active brands: ${payload.summary.activeBrands}; candidate brands waiting for adapters: ${payload.summary.candidateBrands}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
