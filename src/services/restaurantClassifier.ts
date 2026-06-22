import type { Place } from '../data'

export type RestaurantScore = {
  familyScore: number
  tags: string[]
}

const FAMILY_KW = ['親子', '兒童', '寶寶', '嬰兒', '哺乳', '育嬰', '孩子', '家庭', '兒童餐']
const HIGHCHAIR_KW = ['兒童座椅', '高腳椅', '兒童餐椅', '寶寶座椅']
const SPACE_KW = ['包廂', '寬敞', '空間大', '獨立空間', '包場']
const OUTDOOR_KW = ['戶外', '露台', '花園', '草地', '庭院']

export function classifyRestaurant(place: Place): RestaurantScore {
  const text = `${place.name} ${place.description ?? ''} ${place.highlights.join(' ')} ${place.facilities.join(' ')}`
  let score = 20
  const tags: string[] = []

  const a = place.familyAmenities as Record<string, unknown> | undefined
  if (a?.nursingRoom === 'confirmed') { score += 25; tags.push('哺乳室') }
  if (a?.diaperTable === 'confirmed') { score += 20; tags.push('尿布台') }
  if (a?.strollerFriendly === 'confirmed') { score += 15; tags.push('推車友善') }
  if (a?.parking === 'confirmed') { score += 10; tags.push('停車') }

  const familyHits = FAMILY_KW.filter((k) => text.includes(k)).length
  score += familyHits * 6
  if (familyHits > 0) tags.push('親子友善')

  if (HIGHCHAIR_KW.some((k) => text.includes(k))) { score += 15; tags.push('兒童座椅') }
  if (SPACE_KW.some((k) => text.includes(k))) { score += 8; tags.push('空間寬敞') }
  if (OUTDOOR_KW.some((k) => text.includes(k))) { score += 8; tags.push('戶外座位') }
  if (place.rainyDay) score += 10
  if (place.setting === '室內') score += 5

  return { familyScore: Math.min(100, score), tags: [...new Set(tags)] }
}
