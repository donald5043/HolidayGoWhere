import type { Place } from '../data'

export type FreshnessLevel = 'recent' | 'aging' | 'stale' | 'unknown'

export type FreshnessInfo = {
  level: FreshnessLevel
  label: string
  description: string
  daysOld: number | null
  score: number
}

const DAY_MS = 24 * 60 * 60 * 1000

const SYNONYM_GROUPS = [
  ['親子', '兒童', '小孩', '孩子', '家庭'],
  ['嬰兒', '寶寶', '幼兒', '育嬰'],
  ['推車', '嬰兒車', 'stroller'],
  ['哺乳室', '育嬰室', '哺集乳室'],
  ['尿布台', '尿布檯', '換尿布'],
  ['親子廁所', '家庭廁所', '兒童廁所'],
  ['雨天', '下雨', '室內備案'],
  ['免費', '免門票', '免票'],
  ['停車', '停車場', '車位'],
  ['餐廳', '餐飲', '吃飯', '用餐'],
] as const

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('zh-TW')
    .replace(/臺/g, '台')
    .replace(/[，,。.!！?？:：;；/／|｜・、\-—_()（）[\]【】]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function expandToken(token: string): string[] {
  const group = SYNONYM_GROUPS.find((items) => items.some((item) => normalizeSearchText(item) === token))
  return group ? group.map(normalizeSearchText) : [token]
}

export function tokenizeSearchQuery(query: string): string[][] {
  const normalized = normalizeSearchText(query)
  if (!normalized) return []
  return normalized.split(' ').filter(Boolean).map(expandToken)
}

function amenityText(place: Place): string {
  const confirmed = place.familyAmenities
    ? Object.entries(place.familyAmenities)
        .filter(([, status]) => status === 'confirmed')
        .map(([key]) => key)
        .join(' ')
    : ''
  const evidence = place.familyEvidence
    ?.map((item) => `${item.label} ${item.note} ${item.source}`)
    .join(' ') ?? ''
  return `${confirmed} ${evidence}`
}

export function buildPlaceSearchFields(place: Place) {
  return {
    name: normalizeSearchText(place.name),
    location: normalizeSearchText(`${place.region} ${place.city} ${place.district} ${place.address}`),
    category: normalizeSearchText([
      place.category,
      place.placeType,
      place.setting,
      place.duration,
      place.restaurantCategory,
      place.restaurantTier,
      place.chain,
      place.cuisine,
      place.priceLabel,
    ].filter(Boolean).join(' ')),
    family: normalizeSearchText(`${place.highlights?.join(' ') ?? ''} ${place.facilities?.join(' ') ?? ''} ${amenityText(place)}`),
    description: normalizeSearchText(`${place.description ?? ''} ${place.hours ?? ''}`),
    source: normalizeSearchText(`${place.dataSource ?? ''} ${place.sources?.map((source) => `${source.type} ${source.label}`).join(' ') ?? ''}`),
  }
}

export function scorePlaceSearch(place: Place, query: string): { matches: boolean; score: number } {
  const tokenGroups = tokenizeSearchQuery(query)
  if (tokenGroups.length === 0) return { matches: true, score: 0 }

  const fields = buildPlaceSearchFields(place)
  const weights: [keyof typeof fields, number][] = [
    ['name', 18],
    ['location', 11],
    ['category', 9],
    ['family', 7],
    ['description', 4],
    ['source', 1],
  ]
  let score = 0

  for (const alternatives of tokenGroups) {
    let best = 0
    for (const [field, weight] of weights) {
      if (alternatives.some((token) => fields[field].includes(token))) best = Math.max(best, weight)
    }
    if (best === 0) return { matches: false, score: 0 }
    score += best
  }

  const phrase = normalizeSearchText(query)
  if (fields.name === phrase) score += 30
  else if (fields.name.includes(phrase)) score += 16
  return { matches: true, score }
}

export function getFreshnessInfo(updatedAt: string | undefined, now = new Date()): FreshnessInfo {
  if (!updatedAt) {
    return { level: 'unknown', label: '日期未提供', description: '來源沒有提供更新日期，出發前請再次確認。', daysOld: null, score: -6 }
  }
  const timestamp = Date.parse(updatedAt)
  if (!Number.isFinite(timestamp)) {
    return { level: 'unknown', label: '日期未提供', description: '更新日期格式無法辨識，出發前請再次確認。', daysOld: null, score: -6 }
  }
  const daysOld = Math.max(0, Math.floor((now.getTime() - timestamp) / DAY_MS))
  if (daysOld <= 180) {
    return { level: 'recent', label: '近期更新', description: '來源資料在近 6 個月內更新。', daysOld, score: 4 }
  }
  if (daysOld <= 365) {
    return { level: 'aging', label: '建議再確認', description: '來源資料已超過 6 個月，營業資訊可能有變動。', daysOld, score: 0 }
  }
  return { level: 'stale', label: '資料日期較久', description: '來源資料已超過 1 年，出發前務必向官方確認。', daysOld, score: -8 }
}

export function isOfficialSource(place: Place): boolean {
  if (/openstreetmap|^osm$/i.test(place.dataSource?.trim() ?? '') || place.sources?.some((source) => /openstreetmap/i.test(source.label))) {
    return false
  }
  return place.sources?.some((source) => source.type === '官方網站') === true ||
    /政府|官方|觀光署|公所/i.test(place.dataSource ?? '')
}
