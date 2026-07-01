import fs from 'node:fs/promises'
import path from 'node:path'

const OUT_FILE = path.join(process.cwd(), 'public', 'data', 'rescue-supplies.json')
const USER_AGENT = 'HolidayGoWhere/0.1 rescue-supplies-sync'
const checkedAt = new Date().toISOString()

const SOURCES = {
  kodomo: 'https://kodomoshops.com/location.php',
  angelbaby: 'https://www.angelbaby.com.tw/pages/location',
}

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

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT },
  })
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  return response.text()
}

function parseKodomo(html) {
  const blocks = [...html.matchAll(/<div class="moreBox">([\s\S]*?)<\/div>\s*<\/div>/g)].map((match) => match[1])
  return blocks.flatMap((block) => {
    const name = decodeHtml(block.match(/<h3>[\s\S]*?title="([^"]+)"[\s\S]*?<\/h3>/)?.[1] || '')
    const addressMatch = block.match(/地址：[\s\S]*?<a href="([^"]+)"[\s\S]*?<strong>([\s\S]*?)<\/strong>/)
    const phone = decodeHtml(block.match(/電話：\s*([^<\n]+)/)?.[1] || '')
    const hours = decodeHtml(block.match(/營業時間：\s*([^<\n]+)/)?.[1] || '')
    if (!name || !addressMatch) return []
    const mapsUrl = decodeHtml(addressMatch[1])
    const address = decodeHtml(stripTags(addressMatch[2]))
    const { city, district } = parseCityDistrict(address)
    return [{
      id: `baby-kodomo-${slugify(name)}`,
      name: `卡多摩 ${name}`,
      brand: '卡多摩',
      category: 'baby_supply',
      city,
      district,
      address,
      phone,
      hours,
      lat: null,
      lng: null,
      mapsUrl,
      source: { type: 'official', label: '卡多摩官方門市據點', url: SOURCES.kodomo, checkedAt },
      confidence: 'medium',
      tags: tagsForBabySupply('卡多摩'),
    }]
  })
}

function parseAngelbaby(html) {
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
    const { city, district } = parseCityDistrict(address)
    return [{
      id: `baby-angelbaby-${slugify(name)}`,
      name: name.startsWith('安琪兒') ? name : `安琪兒 ${name}`,
      brand: '安琪兒',
      category: 'baby_supply',
      city,
      district,
      address,
      phone: phones.join(' / '),
      hours: '請見官方門市資訊',
      lat: null,
      lng: null,
      mapsUrl,
      source: { type: 'official', label: '安琪兒官方門市資訊', url: SOURCES.angelbaby, checkedAt },
      confidence: 'medium',
      tags: tagsForBabySupply('安琪兒'),
    }]
  })
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
    if (exact) return { lat: Number(exact[1]), lng: Number(exact[2]) }
    const center = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
    if (center) return { lat: Number(center[1]), lng: Number(center[2]) }
  } catch {
    return null
  }
  return null
}

async function withCoordinates(supplies) {
  const output = []
  for (const supply of supplies) {
    const coords = await coordinatesFromGoogleMapsUrl(supply.mapsUrl)
    output.push({
      ...supply,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      confidence: coords ? 'high' : 'medium',
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

async function main() {
  const [kodomoHtml, angelHtml] = await Promise.all([
    fetchText(SOURCES.kodomo),
    fetchText(SOURCES.angelbaby),
  ])
  const rawSupplies = dedupe([
    ...parseKodomo(kodomoHtml),
    ...parseAngelbaby(angelHtml),
  ])
  const supplies = await withCoordinates(rawSupplies)
  const payload = {
    generatedAt: checkedAt,
    sources: [
      { label: '卡多摩官方門市據點', url: SOURCES.kodomo },
      { label: '安琪兒官方門市資訊', url: SOURCES.angelbaby },
    ],
    summary: {
      total: supplies.length,
      withCoordinates: supplies.filter((supply) => typeof supply.lat === 'number' && typeof supply.lng === 'number').length,
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
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
