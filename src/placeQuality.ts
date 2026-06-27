import type { FamilyAmenityKey, FamilyEvidence, Place, RestaurantTier } from './data'

const AMENITY_KEYS: FamilyAmenityKey[] = [
  'accessibility',
  'ramp',
  'nursingRoom',
  'diaperTable',
  'familyRestroom',
  'parking',
  'strollerFriendly',
]

const WEAK_IMAGE_PATTERNS = [
  'images.unsplash.com',
  'place-fallback',
  'no-image',
  'default-image',
]

function hasUsefulImage(place: Place): boolean {
  const candidates = [place.image, ...(place.imageCandidates || [])].filter(Boolean)
  return candidates.some((url) => !WEAK_IMAGE_PATTERNS.some((pattern) => url.toLowerCase().includes(pattern)))
}

function hasHours(place: Place): boolean {
  return Boolean(place.hours && !/請至官方|確認|未提供|詳見/.test(place.hours))
}

function confirmedAmenityCount(place: Place): number {
  const amenities = place.familyAmenities
  if (!amenities) return 0
  return AMENITY_KEYS.filter((key) => amenities[key] === 'confirmed').length
}

export function getFamilyEvidence(place: Place): FamilyEvidence[] {
  if (place.familyEvidence?.length) return place.familyEvidence
  const evidence = place.familyAmenities?.evidence || []
  return evidence.flatMap((item) => item.amenities.map((type) => {
    const distance = item.note.match(/約\s*(\d+)\s*公尺/)
    return {
      type,
      status: distance ? 'nearby' : 'confirmed',
      distanceMeters: distance ? Number(distance[1]) : undefined,
      source: item.source,
      label: item.label,
      url: item.url,
      note: item.note,
    } satisfies FamilyEvidence
  }))
}

export function getRestaurantTier(place: Place): RestaurantTier {
  if (place.restaurantTier) return place.restaurantTier
  const text = `${place.name} ${place.category} ${place.description} ${place.highlights.join(' ')} ${place.facilities.join(' ')}`
  if (place.restaurantCategory === 'mall_food_court' || /百貨|商場|購物中心|美食街|food court/i.test(text)) {
    return 'mall_food_court'
  }
  if (/咖啡|下午茶|甜點|冰品|親子補給/.test(text) || place.restaurantCategory === 'family_supply_brand') {
    return 'cafe_rainy_backup'
  }
  if (
    place.restaurantCategory === 'family_chain' ||
    /親子|兒童|小朋友|寶寶|幼兒|遊戲區|兒童椅/.test(text) ||
    confirmedAmenityCount(place) >= 2
  ) {
    return 'family_verified'
  }
  if (place.restaurantCategory === 'tourism_restaurant' || place.restaurantCategory === 'attraction_attached') {
    return 'tourism_restaurant'
  }
  return 'general_nearby'
}

export function getQualityScore(place: Place): number {
  if (Number.isFinite(place.qualityScoreV2)) return Math.max(0, Math.min(100, Number(place.qualityScoreV2)))

  let score = Math.min(42, Math.max(0, (place.qualityScore || 0) * 4))
  if (hasUsefulImage(place)) score += 15
  if (hasHours(place)) score += 10
  if (place.address && place.city && Number.isFinite(place.lat) && Number.isFinite(place.lng)) score += 10
  if (place.sources?.some((source) => source.type === '官方網站')) score += 8
  if ((place.description || '').length >= 100) score += 8
  score += Math.min(24, confirmedAmenityCount(place) * 6)
  score += Math.min(16, getFamilyEvidence(place).length * 8)
  if (place.rainyDay) score += 4
  if (place.weekendEvent) score += 6

  if (place.placeType === '餐飲') {
    const tierBonus: Record<RestaurantTier, number> = {
      family_verified: 14,
      mall_food_court: 12,
      cafe_rainy_backup: 8,
      tourism_restaurant: 5,
      general_nearby: 0,
    }
    score += tierBonus[getRestaurantTier(place)]
  }

  return Math.round(Math.max(0, Math.min(100, score)))
}

