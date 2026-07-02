/**
 * concierge.ts — Q媽隨行管家的核心問答引擎
 *
 * 純規則式意圖解析 + 本地資料檢索，零後端、零 API 費用，
 * 在所有裝置（含 iPhone 加入主畫面的 PWA）都能完整運作。
 * Gemini Nano（promptApi.ts）只負責把模板回覆改寫得更口語，
 * 推薦名單一律出自這裡的檢索結果，不會憑空生出地點。
 */

import type { Place, WeatherSummary } from '../data'
import { getQualityScore } from '../placeQuality'

export type ConciergeContext = {
  places: Place[]
  weather: WeatherSummary | null
  userLocation: { lat: number; lng: number } | null
}

export type ConciergeIntent = {
  rainy: boolean
  indoor: boolean
  outdoor: boolean
  energy: boolean
  stroller: boolean
  baby: boolean
  restaurant: boolean
  cafe: boolean
  michelin: boolean
  free: boolean
  event: boolean
  night: boolean
  nearby: boolean
  greeting: boolean
  ageMin: number | null
  ageMax: number | null
  city: string | null
  signals: string[]
}

export type ConciergePick = {
  place: Place
  reason: string
  distanceKm: number | null
}

export type ConciergeAnswer = {
  text: string
  picks: ConciergePick[]
  chips: string[]
  intent: ConciergeIntent
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const rad = (v: number) => (v * Math.PI) / 180
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

const CITY_ALIASES: [RegExp, string][] = [
  [/台北|臺北/, '臺北市'],
  [/新北/, '新北市'],
  [/基隆/, '基隆市'],
  [/桃園/, '桃園市'],
  [/新竹縣/, '新竹縣'],
  [/新竹/, '新竹市'],
  [/苗栗/, '苗栗縣'],
  [/台中|臺中/, '臺中市'],
  [/彰化/, '彰化縣'],
  [/南投/, '南投縣'],
  [/雲林/, '雲林縣'],
  [/嘉義縣/, '嘉義縣'],
  [/嘉義/, '嘉義市'],
  [/台南|臺南/, '臺南市'],
  [/高雄/, '高雄市'],
  [/屏東/, '屏東縣'],
  [/宜蘭/, '宜蘭縣'],
  [/花蓮/, '花蓮縣'],
  [/台東|臺東/, '臺東縣'],
  [/澎湖/, '澎湖縣'],
  [/金門/, '金門縣'],
  [/馬祖|連江/, '連江縣'],
]

const ZH_NUM: Record<string, number> = {
  一: 1, 兩: 2, 二: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12,
}

function parseAge(query: string): { ageMin: number; ageMax: number } | null {
  const digit = query.match(/(\d{1,2})\s*歲/)
  if (digit) {
    const n = Number(digit[1])
    if (n >= 0 && n <= 15) return { ageMin: n, ageMax: n }
  }
  const zh = query.match(/(十[一二]|[一兩二三四五六七八九十])\s*歲/)
  if (zh && ZH_NUM[zh[1]] != null) {
    const n = ZH_NUM[zh[1]]
    return { ageMin: n, ageMax: n }
  }
  if (/寶寶|嬰兒|嬰幼兒|新生兒|嫩嬰|小嬰/.test(query)) return { ageMin: 0, ageMax: 2 }
  if (/幼兒園|幼稚園|小班|中班|大班|學齡前/.test(query)) return { ageMin: 3, ageMax: 5 }
  if (/小學|國小|低年級|高年級/.test(query)) return { ageMin: 6, ageMax: 12 }
  return null
}

export function parseIntent(query: string): ConciergeIntent {
  const q = query.trim()
  const signals: string[] = []

  const rainy = /雨|颱風|天氣不好|天氣差|天氣爛|天氣糟|濕答答/.test(q)
  const indoor = /室內|冷氣|不想曬|怕曬|怕熱|太熱|好熱|避暑|躲太陽|躲雨/.test(q)
  // 「曬太陽」不列入戶外訊號：常見的是否定句「不想曬太陽」，會和室內訊號打架
  const outdoor = /戶外|室外|野餐|踏青|爬山|步道|大自然|草地|放風|透透氣/.test(q)
  const energy = /放電|跑跳|消耗|體力|活力|運動|悶壞|精力|坐不住|活蹦亂跳|奔跑|發洩|溜滑梯|盪鞦韆|遊戲場|特色公園/.test(q)
  const stroller = /推車|嬰兒車|娃娃車|寶寶車/.test(q)
  const restaurant = /吃|餐廳|美食|午餐|晚餐|早午餐|宵夜|小吃|聚餐|覓食|用餐|餓/.test(q)
  const cafe = /咖啡|下午茶|甜點|蛋糕|鬆餅|冰淇淋/.test(q)
  const michelin = /米其林|必比登|星級餐廳|摘星/.test(q)
  const free = /免費|不用錢|省錢|不花錢|免門票|不用門票|省荷包/.test(q)
  const event = /活動|展覽|特展|市集|表演|音樂會|嘉年華|園遊會|燈會|煙火|節慶/.test(q)
  const night = /晚上|夜市|夜遊|夜間|夜景|傍晚/.test(q)
  const nearby = /附近|周邊|週邊|離我|旁邊|就近|不遠|近一點/.test(q)
  const greeting = /^(hi|hello|嗨|哈囉|你好|妳好|安安|你會什麼|妳會什麼|怎麼用|幫助|help)[!！?？~～。]*$/i.test(q)

  const age = parseAge(q)
  const baby = age != null && age.ageMax <= 2

  let city: string | null = null
  for (const [pattern, normalized] of CITY_ALIASES) {
    if (pattern.test(q)) { city = normalized; break }
  }

  if (rainy) signals.push('雨天')
  if (age) signals.push(age.ageMin === age.ageMax ? `${age.ageMin}歲` : `${age.ageMin}–${age.ageMax}歲`)
  if (city) signals.push(city)
  if (nearby) signals.push('附近')
  if (indoor) signals.push('室內')
  if (outdoor) signals.push('戶外')
  if (energy) signals.push('放電')
  if (stroller) signals.push('推車友善')
  if (michelin) signals.push('米其林')
  else if (restaurant || cafe) signals.push(cafe && !restaurant ? '咖啡下午茶' : '餐廳')
  if (free) signals.push('免費')
  if (event) signals.push('活動')
  if (night) signals.push('晚上')

  return {
    rainy, indoor, outdoor, energy, stroller, baby,
    restaurant, cafe, michelin, free, event, night, nearby, greeting,
    ageMin: age?.ageMin ?? null,
    ageMax: age?.ageMax ?? null,
    city,
    signals,
  }
}

type ScoredPlace = { place: Place; score: number; distanceKm: number | null }

function scorePlaces(intent: ConciergeIntent, ctx: ConciergeContext, excludeIds: Set<string>): ScoredPlace[] {
  const wantsFood = intent.restaurant || intent.cafe || intent.michelin
  const rainLikely = Boolean(
    intent.rainy ||
    (ctx.weather && (ctx.weather.precipitationProbability >= 55 || (ctx.weather.dailyPrecipitationProbabilityMax ?? 0) >= 70)),
  )

  const scored: ScoredPlace[] = []
  for (const place of ctx.places) {
    if (excludeIds.has(place.id)) continue
    // 網站主軸是景點：問吃的才給餐飲，其餘一律排除餐飲
    if (wantsFood ? place.placeType !== '餐飲' : place.placeType === '餐飲') continue
    if (intent.event && place.placeType !== '活動') continue
    if (intent.michelin && !place.michelinAward) continue
    if (intent.city && place.city !== intent.city) continue
    if (intent.ageMin != null && intent.ageMax != null) {
      if (place.ageMax < intent.ageMin || place.ageMin > intent.ageMax) continue
    }

    const hasCoords = Number.isFinite(place.lat) && Number.isFinite(place.lng)
    const distanceKm = ctx.userLocation && hasCoords ? haversineKm(ctx.userLocation, place) : null
    // 沒指定城市時以使用者所在地為圓心；「附近」收得更緊
    if (!intent.city && distanceKm != null) {
      if (distanceKm > (intent.nearby ? 25 : 60)) continue
    }

    let score = getQualityScore(place) / 4 // 0–25 基礎分

    if (rainLikely) {
      if (place.rainyDay) score += 14
      else if (String(place.setting).includes('室內')) score += 9
      else if (place.setting === '室外') score -= 12
    }
    if (intent.indoor && String(place.setting).includes('室內')) score += 8
    if (intent.outdoor && place.setting !== '室內') score += 8
    if (intent.energy) {
      if (place.setting !== '室內') score += 7
      if (/公園|步道|農場|牧場|森林|草地|沙坑/.test(`${place.category}${place.name}`)) score += 6
    }
    if (intent.stroller) {
      if (place.familyAmenities?.strollerFriendly === 'confirmed') score += 10
      if (place.familyAmenities?.ramp === 'confirmed') score += 4
    }
    if (intent.baby) {
      if (place.familyAmenities?.nursingRoom === 'confirmed') score += 6
      if (place.familyAmenities?.diaperTable === 'confirmed') score += 5
    }
    if (intent.free && place.priceLabel === '免費') score += 12
    if (intent.night && (place.duration === '晚上' || /夜市/.test(place.name))) score += 12
    if (intent.cafe && place.category === '咖啡下午茶') score += 10
    if (place.michelinAward) {
      const bonus = { '3star': 16, '2star': 14, '1star': 12, bib_gourmand: 9 }[place.michelinAward]
      score += wantsFood ? bonus : 0
    }
    if (place.weekendEvent) score += 3

    if (distanceKm != null) score -= Math.min(15, distanceKm * (intent.nearby ? 1.2 : 0.5))

    scored.push({ place, score, distanceKm })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored
}

function reasonFor(entry: ScoredPlace, intent: ConciergeIntent, rainLikely: boolean): string {
  const { place, distanceKm } = entry
  const parts: string[] = []

  if (place.michelinAward) {
    const label = { '3star': '米其林三星', '2star': '米其林二星', '1star': '米其林一星', bib_gourmand: '必比登推介' }[place.michelinAward]
    parts.push(label)
  }
  if (rainLikely && (place.rainyDay || String(place.setting).includes('室內'))) parts.push('雨天照玩')
  if (intent.stroller && place.familyAmenities?.strollerFriendly === 'confirmed') parts.push('推車好走')
  if (intent.baby && place.familyAmenities?.nursingRoom === 'confirmed') parts.push('有哺乳室')
  if (intent.free && place.priceLabel === '免費') parts.push('免費入場')
  if (intent.energy && place.setting !== '室內') parts.push('放電空間大')
  if (parts.length < 2 && distanceKm != null && distanceKm < 15) {
    parts.push(distanceKm < 1 ? `離你約 ${Math.round(distanceKm * 1000)} 公尺` : `離你約 ${distanceKm.toFixed(1)} 公里`)
  }
  if (parts.length === 0) parts.push(place.category)

  return parts.slice(0, 2).join('・')
}

const OPENERS = ['好的！', 'Q媽來幫你～', '收到！', '馬上找！', '交給Q媽！']

function chipsFor(intent: ConciergeIntent, hasPicks: boolean): string[] {
  const chips: string[] = []
  if (hasPicks) chips.push('換一批')
  if (intent.restaurant || intent.cafe || intent.michelin) {
    chips.push('附近有什麼景點？', '雨天備案')
  } else {
    chips.push('附近吃什麼？', intent.rainy ? '孩子要放電' : '雨天備案')
  }
  if (!intent.free) chips.push('免費景點')
  return chips.slice(0, 4)
}

const GREETING_TEXT =
  '嗨，我是Q媽！跟我說說今天的狀況——例如「下雨帶2歲去哪」「附近吃什麼」「台中免費景點」，我馬上從全台開放資料幫你挑。'

const GREETING_CHIPS = ['下雨天帶寶寶去哪？', '孩子要放電', '附近吃什麼？', '米其林餐廳']

export function answerQuery(
  query: string,
  ctx: ConciergeContext,
  options: { excludeIds?: string[]; seed?: number } = {},
): ConciergeAnswer {
  const intent = parseIntent(query)
  const seed = options.seed ?? Date.now()

  if (intent.greeting || query.trim().length < 2) {
    return { text: GREETING_TEXT, picks: [], chips: GREETING_CHIPS, intent }
  }

  const excludeIds = new Set(options.excludeIds ?? [])
  const rainLikely = Boolean(
    intent.rainy ||
    (ctx.weather && (ctx.weather.precipitationProbability >= 55 || (ctx.weather.dailyPrecipitationProbabilityMax ?? 0) >= 70)),
  )
  const ranked = scorePlaces(intent, ctx, excludeIds)
  const picks: ConciergePick[] = ranked.slice(0, 3).map((entry) => ({
    place: entry.place,
    reason: reasonFor(entry, intent, rainLikely),
    distanceKm: entry.distanceKm,
  }))

  if (picks.length === 0) {
    const scopeHint = intent.city
      ? `${intent.city}目前找不到完全符合的`
      : intent.nearby
        ? '你附近 25 公里內找不到完全符合的'
        : '目前找不到完全符合的'
    return {
      text: `嗚，${scopeHint}。試試放寬一點？也可以先選好地區再問我一次。`,
      picks: [],
      chips: ['免費景點', '雨天備案', '附近吃什麼？'],
      intent,
    }
  }

  const opener = OPENERS[seed % OPENERS.length]
  const summary = intent.signals.length > 0 ? `依「${intent.signals.join('＋')}」` : '依你的位置和今天的條件'
  let text = `${opener}${summary}挑了 ${picks.length} 個，點卡片看細節：`
  if (!intent.rainy && rainLikely && ctx.weather) {
    text += `\n（提醒：今天降雨機率約 ${Math.max(ctx.weather.precipitationProbability, ctx.weather.dailyPrecipitationProbabilityMax ?? 0)}%，Q媽優先挑了不怕雨的）`
  }

  return { text, picks, chips: chipsFor(intent, true), intent }
}

export { GREETING_TEXT, GREETING_CHIPS }
