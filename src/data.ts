export type Region = '北部' | '中部' | '南部' | '東部' | '離島'
export type Setting = '室內' | '室外' | '室內外'
export type Duration = '半日' | '一日' | '晚上'
export type SourceType = '官方網站' | '部落格' | 'Instagram'
export type AmenityStatus = 'confirmed' | 'notListed'
export type FamilyAmenityKey =
  | 'accessibility'
  | 'ramp'
  | 'nursingRoom'
  | 'diaperTable'
  | 'familyRestroom'
  | 'parking'
  | 'strollerFriendly'
export type FamilyAmenities = {
  accessibility: AmenityStatus
  ramp: AmenityStatus
  nursingRoom: AmenityStatus
  diaperTable: AmenityStatus
  familyRestroom: AmenityStatus
  parking: AmenityStatus
  strollerFriendly: AmenityStatus
  parkingInfo: string
  evidence?: {
    amenities: FamilyAmenityKey[]
    source: string
    label: string
    url: string
    note: string
  }[]
}
export type AiInsight = {
  summary: string
  whyForKids: string[]
  rainyDay: '適合' | '部分適合' | '不適合' | '未知'
  stroller: '友善' | '部分友善' | '不友善' | '未知'
  tips: string[]
  confidence: number
  model: string
  generatedAt: string
}

export type RestaurantCategory =
  | 'family_chain'
  | 'mall_food_court'
  | 'family_supply_brand'
  | 'attraction_attached'
  | 'tourism_restaurant'
  | 'general_restaurant'

export type Place = {
  id: string
  name: string
  region: Region
  city: string
  district: string
  ageMin: number
  ageMax: number
  setting: Setting
  duration: Duration
  category: string
  rating: number | null
  reviews: number
  priceLabel: string
  address: string
  hours: string
  lat: number
  lng: number
  image: string
  imageCandidates?: string[]
  accent: string
  description: string
  highlights: string[]
  facilities: string[]
  familyAmenities?: FamilyAmenities
  mapsUrl: string
  sources: { type: SourceType; label: string; url: string }[]
  dataSource: string
  sourceId: string
  qualityScore: number
  updatedAt: string
  rainyDay?: boolean
  placeType?: '景點' | '餐飲' | '活動'
  restaurantCategory?: RestaurantCategory
  chain?: string
  eventStart?: string
  eventEnd?: string
  weekendEvent?: boolean
  completeness?: {
    score: number
    missing: string[]
  }
}

export type WeatherSummary = {
  temperature: number
  weatherCode: number
  precipitationProbability: number
  label: string
  fetchedAt: string
}

export type ParentReport = {
  visitedAt: string
  liked: boolean
  note: string
  amenities: Partial<Record<FamilyAmenityKey, boolean>>
  updatedAt: string
}

export const ageOptions = [
  { label: '全部年齡', value: 'all' },
  { label: '0–2 歲', value: '0-2' },
  { label: '3–5 歲', value: '3-5' },
  { label: '6–12 歲', value: '6-12' },
] as const
