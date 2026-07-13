export type Region = '北部' | '中部' | '南部' | '東部' | '離島'
export type Setting = '室內' | '室外' | '室內外'
export type Duration = '半日' | '一日' | '晚上'
export type SourceType = '官方網站' | '部落格' | 'Instagram' | 'Wikipedia'
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

export type FamilyEvidence = {
  type: FamilyAmenityKey
  status: 'confirmed' | 'nearby'
  distanceMeters?: number
  source: string
  label: string
  url: string
  note: string
}
export type AiInsight = {
  summary?: string
  whyForKids?: string[]
  rainyDay?: '適合' | '部分適合' | '不適合' | '未知'
  stroller?: '友善' | '部分友善' | '不友善' | '未知'
  tips?: string[]
  confidence?: number
  familySummary?: string
  rainyDayTip?: string
  recommendedAge?: string
  visitDuration?: string
  parentFriendlyTags?: string[]
  model: string
  sourceHash?: string
  generatedAt: string
  migrated?: boolean
}

export type RestaurantCategory =
  | 'family_chain'
  | 'mall_food_court'
  | 'family_supply_brand'
  | 'attraction_attached'
  | 'tourism_restaurant'
  | 'general_restaurant'

export type RestaurantTier =
  | 'family_verified'
  | 'mall_food_court'
  | 'cafe_rainy_backup'
  | 'tourism_restaurant'
  | 'general_nearby'

export type RescueSupplyCategory =
  | 'baby_supply'
  | 'pharmacy'
  | 'hospital_emergency'
  | 'family_facility'

export type RescueSupplyConfidence = 'high' | 'medium' | 'low'

export type RescueSupplyEvidence = {
  candidateDiscovery?: {
    method: 'brand_registry' | 'government_keyword' | 'osm_keyword' | 'manual_seed'
    matchedKeywords: string[]
    sourceLabels: string[]
  }
  officialVerification?: {
    status: 'verified' | 'candidate_only'
    sourceUrl?: string
    adapter?: string
  }
  geocoding?: {
    status: 'exact' | 'map_center' | 'missing'
    provider: 'official_google_maps_redirect' | 'manual' | 'none'
  }
}

export type RescueSupply = {
  id: string
  name: string
  brand: string
  category: RescueSupplyCategory
  city: string
  district: string
  address: string
  phone: string
  hours: string
  lat: number | null
  lng: number | null
  mapsUrl: string
  source: {
    type: 'official' | 'open_data' | 'osm' | 'curated'
    label: string
    url: string
    checkedAt: string
  }
  confidence: RescueSupplyConfidence
  tags: string[]
  evidence?: RescueSupplyEvidence
  notes?: string
}

export type RescueSupplyDatasetMeta = {
  summary?: {
    total: number
    withCoordinates: number
    highConfidence: number
    mediumConfidence: number
    activeBrands: number
    candidateBrands: number
    brands: Record<string, number>
  }
  pipeline?: {
    version: number
    generatedAt: string
    philosophy: string
    layers: {
      id: string
      label: string
      status: string
      description: string
    }[]
  }
  discovery?: {
    activeBrands: {
      id: string
      name: string
      adapter: string
      officialUrl: string
      regions: string[]
    }[]
    candidateBrands: {
      id: string
      name: string
      category: RescueSupplyCategory
      regions: string[]
      aliases: string[]
      status: string
      nextStep: string
    }[]
  }
}

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
  qualityScoreV2?: number
  updatedAt: string
  rainyDay?: boolean
  michelinAward?: '3star' | '2star' | '1star' | 'bib_gourmand'
  cuisine?: string
  placeType?: '景點' | '餐飲' | '活動'
  restaurantCategory?: RestaurantCategory
  restaurantTier?: RestaurantTier
  chain?: string
  familyEvidence?: FamilyEvidence[]
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
  dailyPrecipitationProbabilityMax?: number
  /** 接下來 6 小時的最高降雨機率 — 出遊決策用這個，別用全日最大值（夏天午後雷陣雨會天天 100%） */
  upcomingPrecipitationProbabilityMax?: number
  precipitationProbabilitySource?: 'current-hour' | 'daily-max'
  label: string
  fetchedAt: string
}

export type WebcamKind = 'image' | 'youtube' | 'link'

export type Webcam = {
  id: string
  name: string
  lat: number
  lng: number
  kind: WebcamKind
  /** kind = image：靜態快照網址（單張 jpg） */
  imageUrl?: string
  /** kind = image：mjpeg 即時串流網址（點擊看直播用） */
  streamUrl?: string
  /** kind = youtube：官方直播影片 ID */
  youtubeId?: string
  /** 官方頁面連結（youtube / link 的備援與外開入口） */
  pageUrl?: string
  road?: string
  source: string
}

export type WebcamDataset = {
  schemaVersion: number
  generatedAt: string
  attribution: string
  count: number
  webcams: Webcam[]
}

export type CongestedSection = {
  id: string
  road: string
  name: string
  dir?: string
  /** 目前路段車速 km/h */
  speed: number
  lat: number
  lng: number
}

export type TrafficDataset = {
  schemaVersion: number
  generatedAt: string
  attribution: string
  congestedSpeedKmh: number
  count: number
  congested: CongestedSection[]
}

export type HealthAdvisorySource = {
  name: string
  agency: '衛生福利部國民健康署' | '衛生福利部疾病管制署'
  url: string
  fetchedAt: string
  dataPeriod?: string
}

export type HealthAdvisory = {
  id: string
  category: 'development' | 'disease' | 'safety' | 'nutrition'
  severity: 'info' | 'notice' | 'elevated'
  mascot: 'qMom'
  title: string
  summary: string
  action: string
  applicableAges: {
    label: string
    minMonths: number
    maxMonths: number
  }[]
  regions: string[]
  source: HealthAdvisorySource
  evidence: string
  disclaimer: string
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
