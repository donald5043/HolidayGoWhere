import type { Place, RestaurantCategory } from '../data'
import rawRules from '../data/restaurant_chain_rules.json'

export type RestaurantScore = {
  familyScore: number
  tags: string[]
  restaurantCategory: RestaurantCategory
  chain: string | null
}

type ChainRule = {
  keywords: string[]
  chain: string | null
  defaultTags: string[]
  defaultFlags: {
    familyFriendly?: boolean
    strollerFriendly?: boolean
    babyChair?: boolean
    kidsMenu?: boolean
    diaperStation?: boolean
    playArea?: boolean
    parking?: boolean
    indoor?: boolean
  }
  scoreBonus: number
}

type RuleMap = Record<string, ChainRule[]>
const RULES = rawRules as RuleMap

const CATEGORY_ORDER: RestaurantCategory[] = [
  'mall_food_court',
  'family_chain',
  'attraction_attached',
  'family_supply_brand',
  'tourism_restaurant',
  'general_restaurant',
]

export const CATEGORY_LABEL: Record<RestaurantCategory, string> = {
  family_chain: '親子連鎖',
  mall_food_court: '商場美食街',
  family_supply_brand: '親子補給',
  attraction_attached: '景點附設',
  tourism_restaurant: '觀光餐廳',
  general_restaurant: '一般餐廳',
}

export const CATEGORY_COLOR: Record<RestaurantCategory, string> = {
  family_chain: '#fff3e0',
  mall_food_court: '#e3f2fd',
  family_supply_brand: '#f3e5f5',
  attraction_attached: '#e8f5e9',
  tourism_restaurant: '#fce4ec',
  general_restaurant: '#f5f5f5',
}

export const CATEGORY_TEXT_COLOR: Record<RestaurantCategory, string> = {
  family_chain: '#e65100',
  mall_food_court: '#1565c0',
  family_supply_brand: '#6a1b9a',
  attraction_attached: '#2e7d32',
  tourism_restaurant: '#880e4f',
  general_restaurant: '#616161',
}


function matchChain(text: string): { rule: ChainRule; category: RestaurantCategory } | null {
  for (const [catKey, rules] of Object.entries(RULES)) {
    const category = catKey as RestaurantCategory
    for (const rule of rules) {
      if (rule.keywords.some((kw) => text.includes(kw))) {
        return { rule, category }
      }
    }
  }
  return null
}

export function classifyRestaurant(place: Place): RestaurantScore {
  const text = `${place.name} ${place.description ?? ''} ${place.highlights.join(' ')} ${place.facilities.join(' ')} ${place.address ?? ''}`
  let score = 50
  const tagSet = new Set<string>()

  // ── 1. Chain / category match ─────────────────────────────────────────────
  const matched = matchChain(text)
  let restaurantCategory: RestaurantCategory
  let chain: string | null = null

  if (matched) {
    restaurantCategory = matched.category
    chain = matched.rule.chain
    score += matched.rule.scoreBonus
    matched.rule.defaultTags.forEach((t) => tagSet.add(t))

    const f = matched.rule.defaultFlags
    if (f.babyChair)     { score += 15; tagSet.add('兒童椅') }
    if (f.kidsMenu)      { score += 15; tagSet.add('兒童餐') }
    if (f.diaperStation) { score += 20; tagSet.add('尿布台') }
    if (f.playArea)      { score += 25; tagSet.add('遊戲區') }
    if (f.parking)       { score += 15; tagSet.add('停車') }
    if (f.strollerFriendly) { score += 15; tagSet.add('親子友善') }
    if (f.indoor)        { score += 10; tagSet.add('室內') }
  } else if (place.restaurantCategory) {
    // Use pre-stored category from data pipeline
    restaurantCategory = place.restaurantCategory
    if (place.chain) chain = place.chain
    const catBonus: Record<RestaurantCategory, number> = {
      family_chain: 20, mall_food_court: 25, family_supply_brand: 10,
      attraction_attached: 20, tourism_restaurant: 5, general_restaurant: 0,
    }
    score += catBonus[restaurantCategory] ?? 0
  } else if (/觀光|旅遊|景區|風景區|國家公園/.test(text)) {
    restaurantCategory = 'tourism_restaurant'
    score += 5
  } else {
    restaurantCategory = 'general_restaurant'
  }

  // ── 2. familyAmenities (confirmed fields from data) ───────────────────────
  const a = place.familyAmenities as Record<string, unknown> | undefined
  if (a?.nursingRoom === 'confirmed')     { score += 25; tagSet.add('尿布台') }
  if (a?.diaperTable === 'confirmed')     { score += 20; tagSet.add('尿布台') }
  if (a?.strollerFriendly === 'confirmed') { score += 15; tagSet.add('親子友善') }
  if (a?.parking === 'confirmed')         { score += 15; tagSet.add('停車') }

  // ── 3. Text keyword scoring ───────────────────────────────────────────────
  const FAMILY_KW = ['親子', '兒童', '寶寶', '嬰兒', '哺乳', '育嬰', '孩子', '家庭', '兒童餐']
  const HIGHCHAIR_KW = ['兒童座椅', '高腳椅', '兒童餐椅', '寶寶座椅']
  const PLAY_KW = ['遊戲區', '遊樂區', '球池', '溜滑梯', '兒童樂園']

  const familyHits = FAMILY_KW.filter((k) => text.includes(k)).length
  if (familyHits > 0) { score += familyHits * 6; tagSet.add('親子友善') }

  if (HIGHCHAIR_KW.some((k) => text.includes(k))) { score += 15; tagSet.add('兒童椅') }
  if (PLAY_KW.some((k) => text.includes(k)))       { score += 25; tagSet.add('遊戲區') }

  if (/尿布台|換尿布|更衣台/.test(text)) { score += 20; tagSet.add('尿布台') }
  if (/兒童餐|kids menu|兒童套餐/.test(text)) { score += 15; tagSet.add('兒童餐') }
  if (/停車|停車場|車位/.test(text)) { score += 10; tagSet.add('停車') }

  if (place.rainyDay) score += 10
  if (place.setting === '室內') { score += 10; tagSet.add('室內') }

  return {
    familyScore: Math.min(100, score),
    tags: [...tagSet],
    restaurantCategory,
    chain,
  }
}

export function categoryPriority(cat: RestaurantCategory): number {
  return CATEGORY_ORDER.length - CATEGORY_ORDER.indexOf(cat)
}
