import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GENERATED_DIR = path.join(ROOT, 'src', 'generated')

const DATA_FILES = [
  'places-north.json',
  'places-central.json',
  'places-south.json',
  'places-east.json',
  'places-islands.json',
  'places-featured.json',
  'restaurants-featured.json',
  'restaurants-osm.json',
]

const FALLBACKS = {
  familyChain: 'restaurant-fallbacks/family-chain.svg',
  cafeRainy: 'restaurant-fallbacks/cafe-rainy.svg',
  foodCourt: 'restaurant-fallbacks/food-court.svg',
  general: 'restaurant-fallbacks/general-restaurant.svg',
  dessert: 'restaurant-fallbacks/dessert.svg',
}

const BAD_PLACEHOLDER_IMAGES = new Set([
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1551024506-0bccd828d307?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=900&q=80',
])

const CHAIN_RULES = [
  {
    chain: 'McDonald’s',
    category: 'family_chain',
    fallback: FALLBACKS.familyChain,
    keywords: ['麥當勞', '麦当劳', 'McDonald', 'McDonald’s', "McDonald's", 'MCDONALD'],
  },
  {
    chain: 'KFC',
    category: 'family_chain',
    fallback: FALLBACKS.familyChain,
    keywords: ['肯德基', 'KFC'],
  },
  {
    chain: 'MOS Burger',
    category: 'family_chain',
    fallback: FALLBACKS.familyChain,
    keywords: ['摩斯漢堡', '摩斯', 'MOS Burger', 'MOSBURGER'],
  },
  {
    chain: 'Burger King',
    category: 'family_chain',
    fallback: FALLBACKS.familyChain,
    keywords: ['漢堡王', 'Burger King'],
  },
  {
    chain: 'Subway',
    category: 'family_chain',
    fallback: FALLBACKS.familyChain,
    keywords: ['Subway', 'SUBWAY', '賽百味'],
  },
  {
    chain: 'Starbucks',
    category: 'family_supply_brand',
    fallback: FALLBACKS.cafeRainy,
    keywords: ['星巴克', 'Starbucks'],
  },
  {
    chain: 'Louisa Coffee',
    category: 'family_supply_brand',
    fallback: FALLBACKS.cafeRainy,
    keywords: ['路易莎', 'Louisa'],
  },
  {
    chain: '85度C',
    category: 'family_supply_brand',
    fallback: FALLBACKS.dessert,
    keywords: ['85度C', '85°C', '85C', '85 度 C'],
  },
  {
    chain: 'cama café',
    category: 'family_supply_brand',
    fallback: FALLBACKS.cafeRainy,
    keywords: ['cama', 'CAMA', '咖碼'],
  },
  {
    chain: 'Sukiya',
    category: 'family_chain',
    fallback: FALLBACKS.familyChain,
    keywords: ['すき家', 'Sukiya', 'SUKIYA'],
  },
  {
    chain: 'Yoshinoya',
    category: 'family_chain',
    fallback: FALLBACKS.familyChain,
    keywords: ['吉野家', 'Yoshinoya'],
  },
  {
    chain: 'Sushiro',
    category: 'family_chain',
    fallback: FALLBACKS.familyChain,
    keywords: ['壽司郎', '寿司郎', 'Sushiro', 'SUSHIRO'],
  },
  {
    chain: 'Kura Sushi',
    category: 'family_chain',
    fallback: FALLBACKS.familyChain,
    keywords: ['藏壽司', '藏寿司', 'くら寿司', 'Kura Sushi', 'KURA'],
  },
  {
    chain: 'Sushi Express',
    category: 'family_chain',
    fallback: FALLBACKS.familyChain,
    keywords: ['爭鮮', '争鲜', 'Sushi Express'],
  },
  {
    chain: 'Pizza Hut',
    category: 'family_chain',
    fallback: FALLBACKS.familyChain,
    keywords: ['必勝客', '必胜客', 'Pizza Hut'],
  },
  {
    chain: 'Domino’s',
    category: 'family_chain',
    fallback: FALLBACKS.familyChain,
    keywords: ['達美樂', '达美乐', 'Domino'],
  },
  {
    chain: 'TGI Fridays',
    category: 'family_chain',
    fallback: FALLBACKS.familyChain,
    keywords: ['TGI Friday', 'TGI Fridays', 'Fridays', 'TGIF'],
  },
]

function isRestaurant(place) {
  return place?.placeType === '餐飲' || place?.id?.startsWith('Restaurant_') || place?.id?.startsWith('osm-')
}

function textFor(place) {
  return [
    place.name,
    place.category,
    place.description,
    place.address,
    place.cuisine,
    ...(place.highlights || []),
    ...(place.facilities || []),
  ].filter(Boolean).join(' ')
}

function matchChain(place) {
  const text = textFor(place)
  return CHAIN_RULES.find((rule) => rule.keywords.some((keyword) => text.includes(keyword))) || null
}

function fallbackFor(place, chainRule) {
  if (chainRule) return chainRule.fallback

  const text = textFor(place)
  if (place.restaurantTier === 'mall_food_court' || place.restaurantCategory === 'mall_food_court' || /百貨|商場|購物中心|美食街|food court|Food Court|Mall|Outlet|LaLaport|SOGO|遠百|新光三越|大遠百|誠品生活|環球購物|Global Mall|Mitsui/i.test(text)) {
    return FALLBACKS.foodCourt
  }
  if (/甜點|冰品|蛋糕|鬆餅|下午茶|dessert|cake|pancake|ice cream|gelato/i.test(text)) {
    return FALLBACKS.dessert
  }
  if (place.restaurantTier === 'cafe_rainy_backup' || place.restaurantCategory === 'family_supply_brand' || /咖啡|咖啡廳|下午茶|cafe|coffee|茶屋|喫茶/i.test(text)) {
    return FALLBACKS.cafeRainy
  }
  return FALLBACKS.general
}

function isWeakImage(url) {
  if (!url) return true
  if (BAD_PLACEHOLDER_IMAGES.has(url)) return true
  if (/images\.unsplash|place-fallback|no[-_]?image|default[-_]?image/i.test(url)) return true
  return false
}

function unique(items) {
  return [...new Set(items.filter(Boolean))]
}

function enrich(place) {
  if (!isRestaurant(place)) return { place, changed: false, enriched: false, chain: false }

  const original = JSON.stringify(place)
  const chainRule = matchChain(place)
  const fallback = fallbackFor(place, chainRule)
  const candidates = unique([...(place.imageCandidates || [])].filter((url) => !isWeakImage(url)))

  const next = { ...place }
  if (chainRule) {
    next.chain = next.chain || chainRule.chain
    next.restaurantCategory = next.restaurantCategory || chainRule.category
  }
  next.restaurantImageKind = chainRule ? 'chain-fallback' : 'category-fallback'

  if (isWeakImage(next.image)) {
    next.image = fallback
    next.imageCandidates = candidates
  } else {
    next.imageCandidates = unique([...candidates, fallback]).slice(0, 6)
  }

  return {
    place: next,
    changed: JSON.stringify(next) !== original,
    enriched: next.image === fallback || next.imageCandidates?.includes(fallback),
    chain: Boolean(chainRule),
  }
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(path.join(GENERATED_DIR, file), 'utf8'))
}

async function writeJson(file, data) {
  await fs.writeFile(path.join(GENERATED_DIR, file), `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

async function main() {
  let totalChanged = 0
  let totalEnriched = 0
  let totalChain = 0

  for (const file of DATA_FILES) {
    const places = await readJson(file)
    let changed = 0
    let enriched = 0
    let chain = 0

    const nextPlaces = places.map((place) => {
      const result = enrich(place)
      if (result.changed) changed += 1
      if (result.enriched) enriched += 1
      if (result.chain) chain += 1
      return result.place
    })

    if (changed) await writeJson(file, nextPlaces)
    totalChanged += changed
    totalEnriched += enriched
    totalChain += chain
    console.log(`${file}: changed ${changed}, fallback images ${enriched}, chain matches ${chain}`)
  }

  console.log(`Total changed: ${totalChanged}`)
  console.log(`Total fallback images: ${totalEnriched}`)
  console.log(`Total chain matches: ${totalChain}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
