import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Accessibility,
  Anchor,
  ArrowUpRight,
  Baby,
  Bell,
  Bot,
  Building2,
  CalendarCheck,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CloudRain,
  Compass,
  Database,
  ExternalLink,
  Heart,
  Home,
  Instagram,
  Layers,
  LocateFixed,
  MapPin,
  Mountain,
  Navigation,
  NotebookPen,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Star,
  SunMedium,
  TentTree,
  Ticket,
  TreePine,
  Umbrella,
  Users,
  Utensils,
  Volume2,
  VolumeX,
  Waves,
  Wrench,
  X,
} from 'lucide-react'
import {
  ageOptions,
  type FamilyAmenityKey,
  type ParentReport,
  type Place,
  type WeatherSummary,
} from './data'
import { MapView, type MapViewport } from './MapView'
import { WeekendDiscovery } from './components/WeekendDiscovery'
import { supabase } from './lib/supabase'
import { getDeviceId } from './lib/deviceId'
import { NearbyRestaurants } from './components/NearbyRestaurants'
import { PackingList } from './components/PackingList'
import { ItineraryPlanner } from './components/ItineraryPlanner'
import { Mascot } from './components/Mascot'
import { BrandLogo } from './components/BrandLogo'
import { getFamilyEvidence, getQualityScore } from './placeQuality'
import { useFavorites } from './hooks/useFavorites'
import { useReports } from './hooks/useReports'
import { useSound } from './hooks/useSound'
import { useClickHistory } from './hooks/useClickHistory'
import { usePlaces } from './hooks/usePlaces'
import { useWeather } from './hooks/useWeather'
import { useUserLocation } from './hooks/useUserLocation'
import { regions, useFilters } from './hooks/useFilters'
import { MichelinBadge, PlaceCard, PlaceImage } from './components/PlaceCard'
import { FilterSheet } from './components/FilterSheet'
import { ReportForm } from './components/ReportForm'
import { ProfileDrawer } from './components/ProfileDrawer'
import { TodayInspiration } from './components/TodayInspiration'
import { compactNumber } from './lib/format'

const regionIcons: Partial<Record<(typeof regions)[number], ReactNode>> = {
  北部: <Building2 size={14} />,
  中部: <Mountain size={14} />,
  南部: <Waves size={14} />,
  東部: <TreePine size={14} />,
  離島: <Anchor size={14} />,
}
const AMENITY_ICONS = {
  accessibility: Accessibility,
  ramp: ArrowUpRight,
  nursingRoom: Baby,
  diaperTable: Layers,
  familyRestroom: Users,
  strollerFriendly: ShoppingCart,
  parking: Car,
} as const
// ── Rule Engine ──────────────────────────────────────────────────────────────

type WizardAgeGroup = '0-2' | '3-5' | '6-12' | 'all'
type WizardDuration = '半日' | '一日' | 'all'
type WizardResult   = { place: Place; score: number; reason: string }

function ruleScoreDistance(place: Place, userLocation: { lat: number; lng: number } | null, maxKm: number): number {
  if (!userLocation) return 0.5
  const km = distanceInKm(userLocation, place)
  if (km > maxKm) return 0
  return 1 - km / maxKm
}

function ruleScoreWeather(place: Place, weather: WeatherSummary | null): number {
  if (!weather) return 0.5
  const rainy = weather.precipitationProbability >= 45 || weather.weatherCode >= 51
  const hot   = weather.temperature >= 32
  if (rainy) {
    if (place.rainyDay) return 1
    if (place.setting === '室內' || place.setting === '室內外') return 0.65
    return 0.15
  }
  if (hot) {
    if (place.setting === '室內') return 0.85
    if (place.setting === '室內外') return 0.75
    return 0.55
  }
  return place.setting === '室外' ? 0.90 : 0.75
}

function ruleScoreAge(place: Place, ageGroup: WizardAgeGroup): number {
  if (ageGroup === 'all') return 0.8
  const [mn, mx] = ageGroup.split('-').map(Number)
  return (place.ageMax >= mn && place.ageMin <= mx) ? 1 : 0
}

function ruleScoreFacility(place: Place): number {
  const a = place.familyAmenities as Record<string, unknown> | undefined
  if (!a) return 0.2
  const keys = ['nursingRoom', 'diaperTable', 'familyRestroom', 'parking', 'strollerFriendly']
  const confirmed = keys.filter((k) => a[k] === 'confirmed').length
  return Math.min(1, 0.2 + confirmed * 0.16)
}

function ruleScorePopularity(place: Place): number {
  return Math.min(1, getQualityScore(place) / 100)
}

function buildWizardReason(
  place: Place,
  weather: WeatherSummary | null,
  distKm: number | null,
  ageGroup: WizardAgeGroup,
): string {
  const parts: string[] = []
  if (weather) {
    const rainy = weather.precipitationProbability >= 45 || weather.weatherCode >= 51
    const temp  = Math.round(weather.temperature)
    if (rainy && place.rainyDay) {
      parts.push(`今天${weather.label}，${place.setting}景點雨天也適合`)
    } else if (rainy) {
      parts.push(`今天有雨，${place.setting === '室外' ? '記得帶雨具' : '室內空間不怕淋雨'}`)
    } else if (temp >= 32) {
      parts.push(`氣溫 ${temp}°C，${place.setting === '室內' ? '室內涼爽舒適' : '多補水防曬'}`)
    } else {
      parts.push(`今天${weather.label}`)
    }
  }
  if (distKm !== null) {
    // Use 38 km/h effective speed to approximate actual road travel time
    // (straight-line × ~1.3 road factor ÷ 50 km/h ≈ straight-line ÷ 38)
    const mins = Math.round((distKm / 38) * 60)
    parts.push(`距你約 ${mins} 分鐘車程`)
  }
  if (ageGroup !== 'all') {
    const [mn, mx] = ageGroup.split('-')
    parts.push(`適合 ${mn}–${mx} 歲`)
  }
  return (parts.join('，') || '符合親子條件') + '。'
}

function computeWizardResults(
  places: Place[],
  params: {
    ageGroup: WizardAgeGroup
    maxDistKm: number
    duration: WizardDuration
    weather: WeatherSummary | null
    userLocation: { lat: number; lng: number } | null
  },
): WizardResult[] {
  const results: WizardResult[] = []
  for (const place of places) {
    if (params.duration !== 'all' && place.duration !== params.duration) continue
    const aScore = ruleScoreAge(place, params.ageGroup)
    if (aScore === 0) continue
    const distKm = params.userLocation ? distanceInKm(params.userLocation, place) : null
    if (distKm !== null && distKm > params.maxDistKm) continue
    const score =
      ruleScoreDistance(place, params.userLocation, params.maxDistKm) * 0.35 +
      ruleScoreWeather(place, params.weather)                          * 0.25 +
      aScore                                                           * 0.20 +
      ruleScoreFacility(place)                                         * 0.12 +
      ruleScorePopularity(place)                                       * 0.08
    results.push({ place, score, reason: buildWizardReason(place, params.weather, distKm, params.ageGroup) })
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 5)
}

// ── 親子人格 ─────────────────────────────────────────────────────────────────

type PersonalityId = 'outdoor' | 'indoor' | 'animal' | 'rainy'
type PersonalityProfile = { id: PersonalityId; label: string; emoji: string; desc: string }

const PERSONALITIES: PersonalityProfile[] = [
  { id: 'outdoor', label: '戶外探索型', emoji: '🌿', desc: '愛在大自然裡奔跑冒險，公園、步道、農場都難不倒你' },
  { id: 'indoor', label: '室內學習型', emoji: '🏛️', desc: '偏愛博物館、科教館與手作體驗，寓教於樂最對味' },
  { id: 'animal', label: '動物愛好型', emoji: '🦋', desc: '對動物、海洋生態、農場牧場總是走不開' },
  { id: 'rainy', label: '雨天備案型', emoji: '☔', desc: '室內活動玩得超開心，下雨也不怕找不到去處' },
]

const ANIMAL_KW = ['動物', '水族', '海洋', '鳥', '蝴蝶', '昆蟲', '牧場', '農場', '魚', '熊', '貓', '兔', '羊', '馬', '龜', '蛇', '鱷']
const INDOOR_KW = ['博物館', '美術館', '科學', '圖書', '展覽', '手作', '體驗', '教育', '工坊', '文化', '科教', '表演', '室內遊樂']
const OUTDOOR_KW = ['公園', '山', '森林', '海灘', '溪', '瀑布', '步道', '遊樂場', '農園', '田野', '露營', '沙灘']

function scorePersonalityForPlace(place: Place): Record<PersonalityId, number> {
  const text = `${place.name} ${place.category} ${place.description ?? ''}`
  const animalHits = ANIMAL_KW.filter((k) => text.includes(k)).length
  const indoorHits = INDOOR_KW.filter((k) => text.includes(k)).length
  const outdoorHits = OUTDOOR_KW.filter((k) => text.includes(k)).length
  return {
    outdoor: (place.setting === '室外' ? 2 : 0) + outdoorHits,
    indoor:  (place.setting === '室內' ? 2 : 0) + indoorHits,
    animal:  animalHits * 2,
    rainy:   (place.rainyDay ? 3 : 0) + (place.setting === '室內' ? 1 : 0),
  }
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('zh-TW')
    .replace(/臺/g, '台')
    .replace(/[，,。./／|｜・、\-—_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildPlaceSearchText(place: Place) {
  const amenityEvidence = place.familyEvidence
    ?.map((evidence) => `${evidence.label} ${evidence.note} ${evidence.source}`)
    .join(' ')
  return normalizeSearchText([
    place.name,
    place.region,
    place.city,
    place.district,
    place.category,
    place.setting,
    place.duration,
    place.placeType,
    place.restaurantCategory,
    place.restaurantTier,
    place.chain,
    place.cuisine,
    place.priceLabel,
    place.address,
    place.hours,
    place.description,
    place.highlights?.join(' '),
    place.facilities?.join(' '),
    place.dataSource,
    place.sources?.map((source) => `${source.type} ${source.label}`).join(' '),
    amenityEvidence,
  ].filter(Boolean).join(' '))
}

function computePersonality(interactedIds: string[], places: Place[]): PersonalityId | null {
  const unique = [...new Set(interactedIds)].slice(-40)
  if (unique.length < 3) return null
  const placeMap = new Map(places.map((p) => [p.id, p]))
  const totals: Record<PersonalityId, number> = { outdoor: 0, indoor: 0, animal: 0, rainy: 0 }
  for (const id of unique) {
    const place = placeMap.get(id)
    if (!place) continue
    const s = scorePersonalityForPlace(place)
    for (const k of Object.keys(totals) as PersonalityId[]) totals[k] += s[k]
  }
  const [best] = (Object.entries(totals) as [PersonalityId, number][]).sort(([, a], [, b]) => b - a)
  return best[1] > 0 ? best[0] : null
}

// ─────────────────────────────────────────────────────────────────────────────

const MAX_VISIBLE_PLACES = 120
const MAX_MAP_PLACES = 80
const COMPACT_INITIAL_RESULTS = 8
const COMPACT_RESULTS_STEP = 8
type RegionName = Exclude<(typeof regions)[number], '全部'>
const regionCenters: Record<RegionName, { lat: number; lng: number }> = {
  北部: { lat: 25.04, lng: 121.52 },
  中部: { lat: 24.15, lng: 120.68 },
  南部: { lat: 22.99, lng: 120.25 },
  東部: { lat: 23.75, lng: 121.1 },
  離島: { lat: 23.57, lng: 119.58 },
}

const regionLoaders: Record<RegionName, () => Promise<Place[]>> = {
  北部: () => import('./generated/places-north.json').then((module) => module.default as Place[]),
  中部: () => import('./generated/places-central.json').then((module) => module.default as Place[]),
  南部: () => import('./generated/places-south.json').then((module) => module.default as Place[]),
  東部: () => import('./generated/places-east.json').then((module) => module.default as Place[]),
  離島: () => import('./generated/places-islands.json').then((module) => module.default as Place[]),
}

function distanceInKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  const earthRadius = 6371
  const toRadians = (value: number) => value * Math.PI / 180
  const latDelta = toRadians(to.lat - from.lat)
  const lngDelta = toRadians(to.lng - from.lng)
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(from.lat)) *
      Math.cos(toRadians(to.lat)) *
      Math.sin(lngDelta / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function regionFromCoordinate({ lat, lng }: { lat: number; lng: number }): RegionName | null {
  if (lat < 21.7 || lat > 26.5 || lng < 118 || lng > 122.5) return null
  if (lng < 119.9 || lat > 25.6) return '離島'
  if (lat <= 24.55 && lng >= 120.9) return '東部'
  if (lat >= 24.55) return '北部'
  if (lat >= 23.45) return '中部'
  return '南部'
}

function App() {
  const { places, setPlaces, placeCache, setPlaceCache, aiInsights, placesStatus, setPlacesStatus } = usePlaces()
  const {
    query, setQuery,
    region, setRegion,
    age, setAge,
    setting, setSetting,
    duration, setDuration,
    rainyOnly, setRainyOnly,
    eventOnly, setEventOnly,
    restaurantOnly, setRestaurantOnly,
  } = useFilters()
  const { weather, weatherStatus, loadWeather } = useWeather()
  const [showFilters, setShowFilters] = useState(false)
  const [selected, setSelected] = useState<Place | null>(null)
  const { userLocation, setUserLocation, locationStatus, setLocationStatus, locationMessage, setLocationMessage } = useUserLocation()
  const [mapViewport, setMapViewport] = useState<MapViewport | null>(null)
  const [mapFocusKey, setMapFocusKey] = useState(0)
  const [compactResultsLimit, setCompactResultsLimit] = useState(COMPACT_INITIAL_RESULTS)
  const [isCompactResultsView, setIsCompactResultsView] = useState(false)
  const [isMobilePortraitMap, setIsMobilePortraitMap] = useState(false)
  const [mobileMapInteractive, setMobileMapInteractive] = useState(false)
  const [osmRestaurants, setOsmRestaurants] = useState<Place[]>([])
  const [osmRestaurantsLoaded, setOsmRestaurantsLoaded] = useState(false)
  const viewportRequestRegion = useRef<RegionName | null>(null)
  const autoLoadedLocationRegion = useRef(false)
  const [activeTab, setActiveTab] = useState<'home' | 'explore' | 'favorites' | 'profile'>('home')
  const [showProfile, setShowProfile] = useState(false)
  const [wizardAge, setWizardAge]           = useState<WizardAgeGroup>('all')
  const [wizardDuration, setWizardDuration] = useState<WizardDuration>('all')
  const [wizardDistKm, setWizardDistKm]     = useState<10 | 20 | 40>(20)
  const [wizardResults, setWizardResults]   = useState<WizardResult[]>([])
  const [wizardRan, setWizardRan]           = useState(false)
  const [showReportForm, setShowReportForm] = useState(false)
  const [showItinerary, setShowItinerary] = useState(false)
  const { soundEnabled, playUiSound, toggleSound } = useSound()
  const [clickHistory, setClickHistory] = useClickHistory()
  const [reportLiked, setReportLiked] = useState(true)
  const [reportNote, setReportNote] = useState('')
  const [reportAmenities, setReportAmenities] = useState<Partial<Record<FamilyAmenityKey, boolean>>>({})
  const [favorites, setFavorites] = useFavorites()
  const [reports, setReports] = useReports()
  const showClassicHome = useMemo(
    () => new URLSearchParams(window.location.search).get('classic') === '1',
    [],
  )

  useEffect(() => {
    const media = window.matchMedia('(max-width: 899px), (max-height: 520px)')
    const update = () => setIsCompactResultsView(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px) and (orientation: portrait)')
    const update = () => {
      setIsMobilePortraitMap(media.matches)
      if (media.matches) setMobileMapInteractive(false)
    }
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!selected) {
      setShowReportForm(false)
      return
    }
    const report = reports[selected.id]
    setReportLiked(report?.liked ?? true)
    setReportNote(report?.note ?? '')
    setReportAmenities(report?.amenities ?? {})
  }, [selected, reports])

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserLocation({ lat: coords.latitude, lng: coords.longitude })
        setMapFocusKey((current) => current + 1)
        setLocationStatus('ready')
        setLocationMessage('已依距離重新排列景點，藍點是你的位置。')
        loadWeather(coords.latitude, coords.longitude)
      },
      () => { /* 使用者拒絕或逾時，靜默略過 */ },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30 * 60 * 1000 },
    )
  }, [loadWeather, setLocationMessage, setLocationStatus, setUserLocation])

  const selectRegion = async (nextRegion: (typeof regions)[number], options: { silent?: boolean } = {}) => {
    if (!options.silent) playUiSound()
    setRegion(nextRegion)
    setMapViewport(null)
    const cached = placeCache[nextRegion]
    if (cached) {
      setPlaces(cached)
      setPlacesStatus('ready')
      setMapFocusKey((current) => current + 1)
      if (nextRegion !== '全部') {
        loadWeather(regionCenters[nextRegion].lat, regionCenters[nextRegion].lng)
      }
      return
    }
    if (nextRegion === '全部') return

    loadWeather(regionCenters[nextRegion].lat, regionCenters[nextRegion].lng)

    setPlacesStatus('loading')
    try {
      const loaded = await regionLoaders[nextRegion]()
      setPlaces(loaded)
      setPlaceCache((current) => ({ ...current, [nextRegion]: loaded }))
      setPlacesStatus('ready')
      setMapFocusKey((current) => current + 1)
    } catch {
      setPlacesStatus('error')
    }
  }

  useEffect(() => {
    if (!userLocation || autoLoadedLocationRegion.current) return
    const nextRegion = regionFromCoordinate(userLocation)
    if (!nextRegion) return
    autoLoadedLocationRegion.current = true
    void selectRegion(nextRegion, { silent: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation])

  const loadRestaurantRegionAround = async (location: { lat: number; lng: number }) => {
    const nextRegion = regionFromCoordinate(location)
    if (!nextRegion) {
      setLocationStatus('error')
      setLocationMessage('目前位置不在臺灣資料範圍內，請手動選擇地區查看餐廳。')
      return
    }
    setMapViewport(null)
    await selectRegion(nextRegion, { silent: true })
    setLocationStatus('ready')
    setLocationMessage(`已依你的位置載入${nextRegion}餐廳，並優先顯示附近地點。`)
  }

  const loadRestaurantsNearUser = () => {
    if (userLocation) {
      void loadRestaurantRegionAround(userLocation)
      return
    }
    if (!navigator.geolocation) {
      setLocationStatus('error')
      setLocationMessage('這個瀏覽器不支援定位，請手動選擇地區查看餐廳。')
      return
    }

    setLocationStatus('loading')
    setLocationMessage('正在取得你的位置，準備載入附近餐廳…')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const nextLocation = { lat: coords.latitude, lng: coords.longitude }
        setUserLocation(nextLocation)
        void loadRestaurantRegionAround(nextLocation)
      },
      (error) => {
        const messages: Record<number, string> = {
          1: '定位權限被關閉了，請手動選擇地區查看餐廳。',
          2: '目前無法取得位置，請確認手機定位服務與網路，或手動選擇地區。',
          3: '定位等待太久，請再試一次或手動選擇地區。',
        }
        setLocationStatus('error')
        setLocationMessage(messages[error.code] || '無法取得位置，請手動選擇地區查看餐廳。')
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 5 * 60 * 1000,
      },
    )
  }

  const enableRestaurantMode = () => {
    setRestaurantOnly(true)
    setEventOnly(false)
    setRainyOnly(false)
    if (region === '全部') loadRestaurantsNearUser()
  }

  const toggleRestaurantMode = () => {
    playUiSound()
    if (restaurantOnly) {
      setRestaurantOnly(false)
      return
    }
    enableRestaurantMode()
  }

  const handleMapViewportChange = useCallback((nextViewport: MapViewport) => {
    setMapViewport(nextViewport)
    setCompactResultsLimit(COMPACT_INITIAL_RESULTS)
    const nextRegion = regionFromCoordinate(nextViewport.center)
    if (!nextRegion) {
      setLocationMessage('地圖已移到資料範圍外，請移回臺灣附近。')
      return
    }

    viewportRequestRegion.current = nextRegion
    setRegion(nextRegion)
    setLocationMessage(`已依地圖中心載入${nextRegion}景點，拖曳或縮放可繼續探索。`)
    loadWeather(nextViewport.center.lat, nextViewport.center.lng, () => viewportRequestRegion.current === nextRegion)

    const cached = placeCache[nextRegion]
    if (cached) {
      setPlaces(cached)
      setPlacesStatus('ready')
      return
    }

    setPlacesStatus('loading')
    void regionLoaders[nextRegion]()
      .then((loaded) => {
        setPlaceCache((current) => ({ ...current, [nextRegion]: loaded }))
        if (viewportRequestRegion.current !== nextRegion) return
        setPlaces(loaded)
        setPlacesStatus('ready')
      })
      .catch(() => {
        if (viewportRequestRegion.current === nextRegion) setPlacesStatus('error')
      })
  }, [placeCache, loadWeather, setLocationMessage, setPlaceCache, setPlaces, setPlacesStatus, setRegion])

  useEffect(() => {
    if (!restaurantOnly || osmRestaurantsLoaded) return
    import('./generated/restaurants-osm.json')
      .then((module) => {
        setOsmRestaurants(module.default as Place[])
        setOsmRestaurantsLoaded(true)
      })
      .catch(() => {
        setOsmRestaurants([])
        setOsmRestaurantsLoaded(true)
      })
  }, [restaurantOnly, osmRestaurantsLoaded])

  const scopedOsmRestaurants = useMemo(() => {
    if (!restaurantOnly || !osmRestaurants.length) return [] as Place[]
    const existingIds = new Set(places.map((place) => place.id))
    const existingNames = new Set(
      places
        .filter((place) => place.placeType === '餐飲')
        .map((place) => `${place.name}-${place.city}-${place.district}`),
    )

    const inViewport = (place: Place) => {
      if (!mapViewport) return true
      const latPadding = Math.max((mapViewport.bounds.north - mapViewport.bounds.south) * 0.2, 0.02)
      const lngPadding = Math.max((mapViewport.bounds.east - mapViewport.bounds.west) * 0.2, 0.02)
      return (
        place.lat <= mapViewport.bounds.north + latPadding &&
        place.lat >= mapViewport.bounds.south - latPadding &&
        place.lng <= mapViewport.bounds.east + lngPadding &&
        place.lng >= mapViewport.bounds.west - lngPadding
      )
    }

    const anchor = mapViewport?.center || userLocation || (region !== '全部' ? regionCenters[region] : null)
    if (!anchor && !mapViewport) return [] as Place[]
    const maxDistanceKm = mapViewport ? 80 : userLocation ? 15 : 45

    return osmRestaurants
      .filter((place) =>
        !existingIds.has(place.id) &&
        !existingNames.has(`${place.name}-${place.city}-${place.district}`) &&
        inViewport(place) &&
        (!anchor || distanceInKm(anchor, place) <= maxDistanceKm),
      )
      .map((place) => ({
        place,
        dist: anchor ? distanceInKm(anchor, place) : 0,
      }))
      .sort((first, second) => first.dist - second.dist)
      .slice(0, 180)
      .map(({ place }) => place)
  }, [restaurantOnly, osmRestaurants, places, mapViewport, userLocation, region])

  const sourcePlaces = useMemo(
    () => restaurantOnly ? [...places, ...scopedOsmRestaurants] : places,
    [restaurantOnly, places, scopedOsmRestaurants],
  )

  const filteredPlaces = useMemo(() => {
    const [minAge, maxAge] = age === 'all' ? [0, 99] : age.split('-').map(Number)
    const queryTokens = normalizeSearchText(query).split(' ').filter(Boolean)
    const matches = sourcePlaces.filter((place) => {
      const searchText = buildPlaceSearchText(place)
      const textMatches = queryTokens.length === 0 || queryTokens.every((token) => searchText.includes(token))
      const ageMatches = age === '0-2'
        ? place.ageMin === 0
        : place.ageMin <= maxAge && place.ageMax >= minAge
      return (
        textMatches &&
        ageMatches &&
        (!rainyOnly || place.rainyDay === true) &&
        (!eventOnly || place.placeType === '活動') &&
        // Restaurants are a separate mode: show only when explicitly selected,
        // otherwise keep main list as attractions-only.
        (restaurantOnly ? place.placeType === '餐飲' : place.placeType !== '餐飲') &&
        (setting === '全部' || place.setting === setting || (setting !== '室內外' && place.setting === '室內外')) &&
        (duration === '全部' || place.duration === duration)
      )
    })
    const sorted = [...matches]
    const rainyWeather = weather && (weather.precipitationProbability >= 45 || weather.weatherCode >= 51)
    const hotWeather = weather && weather.temperature >= 32
    const sortLocation = mapViewport?.center || userLocation
    const rank = (place: Place) => {
      let score = getQualityScore(place)
      if (weather && !restaurantOnly) {
        if (rainyWeather && place.rainyDay) score += 18
        if (hotWeather && place.setting !== '室外') score += 12
        if (place.weekendEvent) score += 10
      }
      if (!eventOnly && place.placeType === '活動') score -= 20
      if (restaurantOnly && place.placeType === '餐飲') {
        score += getFamilyEvidence(place).length ? 8 : 0
      }
      if (sortLocation) {
        const distance = distanceInKm(sortLocation, place)
        score += Math.max(0, 42 - distance * 2.4)
      }
      return score
    }
    return sorted.sort((first, second) =>
      rank(second) - rank(first) ||
      (sortLocation ? distanceInKm(sortLocation, first) - distanceInKm(sortLocation, second) : 0)
    )
  }, [sourcePlaces, query, age, setting, duration, rainyOnly, eventOnly, restaurantOnly, weather, userLocation, mapViewport])
  const displayedPlaces = useMemo(
    () => activeTab === 'favorites'
      ? filteredPlaces.filter((place) => favorites.includes(place.id))
      : filteredPlaces,
    [activeTab, favorites, filteredPlaces],
  )
  useEffect(() => {
    setCompactResultsLimit(COMPACT_INITIAL_RESULTS)
  }, [activeTab, query, age, setting, duration, rainyOnly, eventOnly, restaurantOnly, region, mapViewport])
  const viewportPlaces = useMemo(
    () => {
      if (!mapViewport) return displayedPlaces
      const latPadding = Math.max((mapViewport.bounds.north - mapViewport.bounds.south) * 0.12, 0.015)
      const lngPadding = Math.max((mapViewport.bounds.east - mapViewport.bounds.west) * 0.12, 0.015)
      return displayedPlaces
        .filter((place) =>
          place.lat <= mapViewport.bounds.north + latPadding &&
          place.lat >= mapViewport.bounds.south - latPadding &&
          place.lng <= mapViewport.bounds.east + lngPadding &&
          place.lng >= mapViewport.bounds.west - lngPadding)
        .sort((first, second) =>
          distanceInKm(mapViewport.center, first) - distanceInKm(mapViewport.center, second))
    },
    [displayedPlaces, mapViewport],
  )
  const visiblePlaces = useMemo(
    () => {
      const limit = isCompactResultsView ? compactResultsLimit : MAX_VISIBLE_PLACES
      return viewportPlaces.slice(0, limit)
    },
    [viewportPlaces, isCompactResultsView, compactResultsLimit],
  )
  const mapPlaces = useMemo(
    () => {
      return viewportPlaces.slice(0, MAX_MAP_PLACES)
    },
    [viewportPlaces],
  )
  const mapAreaLabel = mapViewport
    ? `${viewportPlaces.length} 筆在目前地圖範圍`
    : `${displayedPlaces.length} 筆符合條件`
  const canLoadMoreResults = isCompactResultsView && visiblePlaces.length < viewportPlaces.length
  const mapInteractive = !isMobilePortraitMap || mobileMapInteractive

  const recommended = useMemo(() => {
    if (placesStatus !== 'ready' || !places.length) return []
    const today = new Date()
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()
    const ranked = [...places]
      .filter((place) => place.image)
      .sort((first, second) => {
        const score = (place: Place) => getQualityScore(place) - (place.placeType === '活動' ? 18 : 0)
        return score(second) - score(first)
      })
      .slice(0, 24)
    const offset = seed % Math.max(ranked.length, 1)
    return [...ranked.slice(offset), ...ranked.slice(0, offset)].slice(0, 10)
  }, [places, placesStatus])
  const todayInspirationPlaces = useMemo(() => {
    const source = recommended.length ? recommended : places
    return [...source]
      .sort((first, second) => (
        (userLocation ? distanceInKm(userLocation, first) - distanceInKm(userLocation, second) : 0) ||
        Number(Boolean(second.rainyDay)) - Number(Boolean(first.rainyDay)) ||
        Number(Boolean(second.familyAmenities)) - Number(Boolean(first.familyAmenities)) ||
        getQualityScore(second) - getQualityScore(first)
      ))
      .slice(0, 6)
  }, [recommended, places, userLocation])

  const nearbyPlaces = useMemo(() => {
    if (!userLocation || placesStatus !== 'ready') return [] as { place: Place; dist: number }[]
    return places
      .map((p) => ({ place: p, dist: distanceInKm(userLocation, p) }))
      .filter(({ dist }) => dist <= 15)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 6)
  }, [places, userLocation, placesStatus])

  const personality = useMemo(
    () => computePersonality([...favorites, ...clickHistory], places),
    [favorites, clickHistory, places],
  )
  const personalityProfile = personality ? PERSONALITIES.find((p) => p.id === personality) ?? null : null

  const openPlace = useCallback((place: Place) => {
    playUiSound('open')
    setSelected(place)
    setClickHistory((prev) => [...prev.slice(-99), place.id])
  }, [playUiSound, setClickHistory])

  const toggleFavorite = (id: string) => {
    playUiSound('favorite')
    setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  const clearFilters = () => {
    void selectRegion('全部')
    setAge('all')
    setSetting('全部')
    setDuration('全部')
    setRainyOnly(false)
    setEventOnly(false)
    setRestaurantOnly(false)
  }

  const findNearbyPlaces = () => {
    if (!navigator.geolocation) {
      setLocationStatus('error')
      setLocationMessage('這個瀏覽器不支援定位，請改用 Safari 或 Chrome。')
      return
    }

    setLocationStatus('loading')
    setLocationMessage('正在取得你的位置…')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserLocation({ lat: coords.latitude, lng: coords.longitude })
        setMapViewport(null)
        setMapFocusKey((current) => current + 1)
        setLocationStatus('ready')
        setLocationMessage('已依距離重新排列景點，藍點是你的位置。')
        loadWeather(coords.latitude, coords.longitude)
        document.querySelector('.explore-section')?.scrollIntoView({ behavior: 'smooth' })
      },
      (error) => {
        const messages: Record<number, string> = {
          1: '定位權限被關閉了，請到瀏覽器設定允許此網站使用位置。',
          2: '目前無法取得位置，請確認手機定位服務與網路。',
          3: '定位等待太久，請再試一次。',
        }
        setLocationStatus('error')
        setLocationMessage(messages[error.code] || '無法取得位置，請稍後再試。')
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 5 * 60 * 1000,
      },
    )
  }

  const openExplore = (tab: 'explore' | 'favorites') => {
    playUiSound('tap')
    setActiveTab(tab)
    setShowProfile(false)
    window.setTimeout(
      () => {
        const compactLandscape = window.matchMedia('(orientation: landscape) and (max-height: 520px)').matches
        document.querySelector(compactLandscape ? '.explore-grid' : '.explore-section')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      },
      0,
    )
  }

  const openHome = () => {
    playUiSound('tap')
    setActiveTab('home')
    setShowProfile(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openProfile = () => {
    playUiSound('open')
    setShowProfile(true)
  }

  const saveReport = () => {
    if (!selected) return
    const now = new Date().toISOString()
    setReports((current) => {
      const visitedAt = current[selected.id]?.visitedAt || now
      const report: ParentReport = {
        visitedAt,
        liked: reportLiked,
        note: reportNote.trim(),
        amenities: reportAmenities,
        updatedAt: now,
      }
      if (supabase) {
        const deviceId = getDeviceId()
        supabase.from('reports').upsert({
          place_id: selected.id,
          device_id: deviceId,
          visited_at: visitedAt,
          liked: reportLiked,
          note: reportNote.trim(),
          amenities: reportAmenities,
          updated_at: now,
        }, { onConflict: 'place_id,device_id' })
      }
      return { ...current, [selected.id]: report }
    })
    setShowReportForm(false)
  }

  const runWizard = () => {
    if (!places.length) return
    playUiSound('open')
    const results = computeWizardResults(places, {
      ageGroup: wizardAge,
      maxDistKm: wizardDistKm,
      duration: wizardDuration,
      weather,
      userLocation,
    })
    setWizardResults(results)
    setWizardRan(true)
  }

  const goExplore = (apply?: () => void) => {
    apply?.()
    openExplore('explore')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="假日去哪兒首頁" onClick={(event) => { event.preventDefault(); openHome() }}>
          <BrandLogo />
        </a>
        <div className="topbar-actions">
          <button className="icon-button" onClick={toggleSound} aria-label={soundEnabled ? '關閉介面音效' : '開啟介面音效'}>
            {soundEnabled ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </button>
          <button className="icon-button" onClick={openProfile} aria-label="通知與我的">
            <Bell size={19} />
          </button>
        </div>
      </header>

      <main>
        {activeTab === 'home' && (
          !showClassicHome ? (
            <TodayInspiration
              places={todayInspirationPlaces}
              weather={weather}
              userLocation={userLocation}
              favorites={favorites}
              onOpenPlace={openPlace}
              onFavorite={toggleFavorite}
              onExplore={() => goExplore()}
              onNearby={() => goExplore(findNearbyPlaces)}
              onScenario={(scenario) => {
                if (scenario === 'rainy') {
                  goExplore(() => { setAge('all'); setSetting('全部'); setRainyOnly(true); setEventOnly(false); setRestaurantOnly(false) })
                  return
                }
                if (scenario === 'stroller') {
                  goExplore(() => { setAge('0-2'); setRainyOnly(false); setEventOnly(false) })
                  return
                }
                if (scenario === 'parents') {
                  goExplore(() => { setAge('all'); setSetting('全部'); setRainyOnly(false); setEventOnly(false); enableRestaurantMode() })
                  return
                }
                goExplore(() => { setAge('all'); setSetting('室外'); setRainyOnly(false); setEventOnly(false); setRestaurantOnly(false) })
              }}
            />
          ) : (
          <div className="home-view">
            <section className="hero-card">
              <img
                src={`${import.meta.env.BASE_URL}hero-family.svg`}
                alt=""
                className="hero-card-bg"
                aria-hidden="true"
              />
              <div className="hero-card-overlay" />
              <Mascot variant="waving" className="hero-mascot" loading="eager" />
              <div className="hero-card-content">
                <span className="hero-tag"><Sparkles size={13} /> 親子週末靈感</span>
                <h1>下一個週末，<br />一起創造<br /><span>美好回憶</span></h1>
                <p>天氣、年齡、親子設施與即時活動，一次替你整理好。</p>
              </div>
              <div className="hero-search">
                <label className="search-box">
                  <Search size={19} />
                  <input
                    type="search"
                    enterKeyHint="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        goExplore(() => {
                          setAge('all')
                          setSetting('全部')
                          setDuration('全部')
                          setRainyOnly(false)
                          setEventOnly(false)
                          setRestaurantOnly(false)
                        })
                      }
                    }}
                    placeholder="搜尋景點、城市或想玩的活動"
                  />
                  {query && <button onClick={() => setQuery('')} aria-label="清除搜尋"><X size={16} /></button>}
                </label>
                <button className="filter-toggle" onClick={() => goExplore(() => setShowFilters(true))} aria-label="開啟篩選">
                  <SlidersHorizontal size={18} /><span>篩選</span>
                </button>
              </div>
            </section>

            <section className="brand-family-card" aria-labelledby="brand-family-title">
              <div className="brand-family-copy">
                <span className="eyebrow"><Users size={14} /> Q胖家族陪你找地方</span>
                <h2 id="brand-family-title">不是只有景點清單，是爸媽可以信任的週末嚮導</h2>
                <p>Q胖負責找靈感，Q寶提醒孩子需求，Q媽幫你留意雨天、推車、停車與育嬰室。</p>
                <div className="brand-family-roles" aria-label="角色家族">
                  <span><strong>Q胖</strong> 探索靈感</span>
                  <span><strong>Q寶</strong> 孩子視角</span>
                  <span><strong>Q媽</strong> 爸媽安心</span>
                </div>
              </div>
              <Mascot variant="family" className="brand-family-image" alt="Q胖、Q寶與Q媽角色家族" loading="eager" />
            </section>

            <section className="quick-entries" aria-label="快速入口">
              <button className="entry-tile" onClick={() => goExplore(() => { setSetting('室外'); setRainyOnly(false); setEventOnly(false) })}>
                <span className="entry-icon tile-green"><TreePine size={24} /></span>
                <small>戶外踏青</small>
              </button>
              <button className="entry-tile" onClick={() => goExplore(() => { setRainyOnly(true); setEventOnly(false) })}>
                <span className="entry-icon tile-blue"><Umbrella size={24} /></span>
                <small>雨天備案</small>
              </button>
              <button className="entry-tile" onClick={() => goExplore(() => { setAge('0-2'); setRainyOnly(false); setEventOnly(false) })}>
                <span className="entry-icon tile-coral"><Baby size={24} /></span>
                <small>親子友善</small>
              </button>
              <button className="entry-tile" onClick={() => goExplore(() => { setEventOnly(true); setRainyOnly(false) })}>
                <span className="entry-icon tile-yellow"><CalendarCheck size={24} /></span>
                <small>近期活動</small>
              </button>
              <button className="entry-tile" onClick={() => goExplore(findNearbyPlaces)}>
                <span className="entry-icon tile-violet"><LocateFixed size={24} /></span>
                <small>附近景點</small>
              </button>
              <button className="entry-tile" onClick={() => goExplore(enableRestaurantMode)}>
                <span className="entry-icon tile-coral"><Utensils size={24} /></span>
                <small>親子餐廳</small>
              </button>
            </section>

            {/* ── 天氣主動提示 ── */}
            {weatherStatus === 'ready' && weather && (() => {
              const isRainy = weather.precipitationProbability >= 45 || weather.weatherCode >= 51
              const isHot   = weather.temperature >= 32
              if (!isRainy && !isHot) return null
              return (
                <section
                  className={`home-section weather-nudge ${isRainy ? 'weather-nudge--rain' : 'weather-nudge--heat'}`}
                  onClick={() => isRainy ? goExplore(() => setRainyOnly(true)) : goExplore(() => setSetting('室內'))}
                >
                  {isRainy ? (
                    <Mascot variant="rainy" className="weather-nudge-mascot" />
                  ) : (
                    <SunMedium size={22} />
                  )}
                  <div className="weather-nudge-copy">
                    <strong>{isRainy ? `今天降雨機率 ${weather.precipitationProbability}%` : `今天高達 ${Math.round(weather.temperature)}°C`}</strong>
                    <span>{isRainy ? '幫你整理好雨天室內景點' : '推薦涼快的室內景點'}</span>
                  </div>
                  <span className="weather-nudge-cta">看景點 <ChevronRight size={13} /></span>
                </section>
              )
            })()}

            {/* ── 今天去哪玩 wizard ── */}
            <section className="wizard-card">
              <div className="wizard-head">
                <span className="wizard-badge"><Sparkles size={17} /></span>
                <div>
                  <strong>今天去哪玩？</strong>
                  <small>告訴我孩子的條件，幫你挑出最適合的景點</small>
                </div>
              </div>
              <div className="wizard-body">
                <div className="wizard-row">
                  <span className="wizard-label">孩子年齡</span>
                  <div className="wizard-pills">
                    {([['0-2', '0–2 歲'], ['3-5', '3–5 歲'], ['6-12', '6–12 歲'], ['all', '不限']] as const).map(([val, label]) => (
                      <button key={val} className={wizardAge === val ? 'active' : ''} onClick={() => setWizardAge(val)}>{label}</button>
                    ))}
                  </div>
                </div>
                <div className="wizard-row">
                  <span className="wizard-label">可用時間</span>
                  <div className="wizard-pills">
                    {([['半日', '半天'], ['一日', '一天'], ['all', '不限']] as const).map(([val, label]) => (
                      <button key={val} className={wizardDuration === val ? 'active' : ''} onClick={() => setWizardDuration(val)}>{label}</button>
                    ))}
                  </div>
                </div>
                <div className="wizard-row">
                  <span className="wizard-label">可接受距離</span>
                  <div className="wizard-pills">
                    {([10, 20, 40] as const).map((km) => (
                      <button key={km} className={wizardDistKm === km ? 'active' : ''} onClick={() => setWizardDistKm(km)}>
                        {km === 10 ? '15 分鐘' : km === 20 ? '30 分鐘' : '1 小時'}
                      </button>
                    ))}
                  </div>
                  {!userLocation && (
                    <p className="wizard-no-location">⚠️ 未取得定位，將略過距離篩選</p>
                  )}
                </div>
              </div>
              <button className="wizard-submit" onClick={runWizard} disabled={placesStatus !== 'ready'}>
                <Sparkles size={16} />幫我推薦
              </button>
            </section>

            {/* wizard results */}
            {wizardRan && (
              <section className="home-section wizard-results-section">
                <div className="home-section-head">
                  <h2>{wizardResults.length ? `精選 ${wizardResults.length} 個景點` : '找不到符合條件的景點'}</h2>
                  <button onClick={() => { setWizardResults([]); setWizardRan(false) }}>重新設定</button>
                </div>
                {wizardResults.length > 0 ? (
                  <div className="wizard-result-list">
                    {wizardResults.map(({ place, reason }) => (
                      <article
                        key={place.id}
                        className="wizard-result-card"
                        onClick={() => openPlace(place)}
                      >
                        <div className="wizard-result-thumb">
                          <PlaceImage place={place} className="wizard-result-photo" />
                        </div>
                        <div className="wizard-result-copy">
                          <strong>{place.name}</strong>
                          <p className="wizard-reason">{reason}</p>
                          <span className="wizard-result-meta">
                            <MapPin size={11} />{place.city}・{place.setting}・{place.duration}
                          </span>
                        </div>
                        <ChevronRight size={18} className="wizard-result-arrow" />
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="wizard-empty">試試放寬距離或年齡條件，或先選「不限」看看。</p>
                )}
              </section>
            )}

            {/* ── 附近推薦 ── */}
            {nearbyPlaces.length > 0 && (
              <section className="home-section nearby-section">
                <div className="home-section-head">
                  <h2>📍 附近推薦</h2>
                  <button onClick={() => goExplore(findNearbyPlaces)}>更多 <ChevronRight size={15} /></button>
                </div>
                <div className="nearby-scroll">
                  {nearbyPlaces.map(({ place, dist }) => (
                    <article key={place.id} className="nearby-card" onClick={() => openPlace(place)}>
                      <div className="nearby-img">
                        <PlaceImage place={place} className="nearby-photo" />
                        <span className="nearby-setting-badge">{place.setting}</span>
                      </div>
                      <div className="nearby-copy">
                        <strong>{place.name}</strong>
                        <span><MapPin size={10} />{dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="home-section">
              <div className="home-section-head">
                <h2>為你推薦</h2>
                <button onClick={() => goExplore()}>查看全部 <ChevronRight size={15} /></button>
              </div>
              {recommended.length ? (
                <div className="reco-scroll">
                  {recommended.map((place) => (
                    <article
                      key={place.id}
                      className="reco-card"
                      onClick={() => openPlace(place)}
                    >
                      <div className="reco-image">
                        <PlaceImage place={place} className="reco-photo" />
                        <span className="reco-badge">{place.placeType ?? '景點'}</span>
                        <button
                          className={`reco-heart ${favorites.includes(place.id) ? 'is-favorite' : ''}`}
                          onClick={(event) => { event.stopPropagation(); toggleFavorite(place.id) }}
                          aria-label={favorites.includes(place.id) ? '取消收藏' : '加入收藏'}
                        >
                          <Heart size={15} fill={favorites.includes(place.id) ? 'currentColor' : 'none'} />
                        </button>
                      </div>
                      <div className="reco-copy">
                        <strong>{place.name}</strong>
                        <span className="reco-meta"><MapPin size={11} />{place.city}・{place.setting}</span>
                        <div className="reco-tags">
                          <span><Clock3 size={10} />{place.duration}</span>
                          <span><Baby size={10} />{place.ageMin}–{place.ageMax}歲</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="reco-scroll">
                  {[0, 1, 2].map((index) => <div key={index} className="reco-card reco-skeleton" />)}
                </div>
              )}
            </section>

            {/* ── 親子人格 ── */}
            {personalityProfile && (
              <section className="home-section persona-section">
                <div className="home-section-head">
                  <h2>你的親子類型</h2>
                  <button onClick={() => openProfile()}>查看檔案 <ChevronRight size={15} /></button>
                </div>
                <div className="persona-card">
                  <span className="persona-emoji" aria-hidden="true">{personalityProfile.emoji}</span>
                  <div className="persona-copy">
                    <strong>{personalityProfile.label}</strong>
                    <p>{personalityProfile.desc}</p>
                  </div>
                  <span className="persona-badge">依收藏推算</span>
                </div>
              </section>
            )}

            <section className="home-section discovery-section">
              <WeekendDiscovery
                places={places}
                placesReady={placesStatus === 'ready'}
                userLocation={userLocation}
                favorites={favorites}
                onFavorite={toggleFavorite}
                onOpenPlace={openPlace}
              />
            </section>

            <section className="home-section">
              <div className="weather-tile">
                <span className="weather-tile-icon">
                  {weather && (weather.precipitationProbability >= 45 || weather.weatherCode >= 51)
                    ? <CloudRain size={24} />
                    : <SunMedium size={24} />}
                </span>
                <div className="weather-tile-copy">
                  <strong>
                    {weatherStatus === 'loading'
                      ? '正在取得天氣…'
                      : weather
                        ? `${weather.label}・${Math.round(weather.temperature)}°C`
                        : '適合出門放電'}
                  </strong>
                  <span>
                    {weather
                      ? `今日降雨機率 ${weather.precipitationProbability}%`
                      : '開啟定位即可看當地天氣'}
                  </span>
                </div>
                <button className="weather-tile-cta" onClick={() => goExplore()}>
                  查看景點 <ChevronRight size={14} />
                </button>
              </div>
            </section>
          </div>
          )
        )}

        {activeTab !== 'home' && (
        <section className="explore-section">
          <div className="explore-toolbar">
            <label className="search-box">
              <Search size={18} />
              <input
                type="search"
                enterKeyHint="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setAge('all')
                    setSetting('全部')
                    setDuration('全部')
                    setRainyOnly(false)
                    setEventOnly(false)
                    setRestaurantOnly(false)
                    event.currentTarget.blur()
                  }
                }}
                placeholder="搜尋景點、城市或活動"
              />
              {query && <button onClick={() => setQuery('')} aria-label="清除搜尋"><X size={16} /></button>}
            </label>
            <button
              className={`filter-toggle ${showFilters ? 'is-open' : ''}`}
              onClick={() => { playUiSound(); setShowFilters(!showFilters) }}
              aria-label={showFilters ? '收起精準篩選' : '開啟精準篩選'}
            >
              <SlidersHorizontal size={18} /><span>篩選</span>
            </button>
          </div>

          <div className="filter-group region-tabs">
            {regions.map((item) => (
              <button key={item} className={region === item ? 'active' : ''} onClick={() => void selectRegion(item)}>
                {regionIcons[item]}{item}
              </button>
            ))}
          </div>
          <div className="filter-group age-tabs">
            {ageOptions.map((item) => (
              <button key={item.value} className={age === item.value ? 'active' : ''} onClick={() => { playUiSound(); setAge(item.value) }}>
                <Baby size={15} />{item.label}
              </button>
            ))}
            <button className={rainyOnly ? 'active rainy-filter' : 'rainy-filter'} onClick={() => { playUiSound(); setRainyOnly((value) => { if (!value) setRestaurantOnly(false); return !value }) }}>
              <Umbrella size={14} /> 雨天備案
            </button>
            <button className={eventOnly ? 'active event-filter' : 'event-filter'} onClick={() => { playUiSound(); setEventOnly((value) => { if (!value) setRestaurantOnly(false); return !value }) }}>
              <CalendarCheck size={14} /> 本週活動
            </button>
            <button className={restaurantOnly ? 'active' : ''} onClick={toggleRestaurantMode}>
              <Utensils size={14} /> 餐廳
            </button>
          </div>

          <div className="explore-scenario-chips" aria-label="快速情境">
            <span>快速情境</span>
            <button
              className={rainyOnly ? 'active' : ''}
              onClick={() => { playUiSound(); setAge('all'); setSetting('全部'); setRainyOnly(true); setEventOnly(false); setRestaurantOnly(false) }}
            >
              <Umbrella size={14} />雨天
            </button>
            <button
              className={setting === '室外' && !rainyOnly && !restaurantOnly ? 'active' : ''}
              onClick={() => { playUiSound(); setAge('all'); setSetting('室外'); setRainyOnly(false); setEventOnly(false); setRestaurantOnly(false) }}
            >
              <TreePine size={14} />放電
            </button>
            <button
              className={age === '0-2' && !restaurantOnly ? 'active' : ''}
              onClick={() => { playUiSound(); setAge('0-2'); setRainyOnly(false); setEventOnly(false); setRestaurantOnly(false) }}
            >
              <Baby size={14} />推車
            </button>
            <button
              className={restaurantOnly ? 'active' : ''}
              onClick={() => { playUiSound(); setAge('all'); setSetting('全部'); setRainyOnly(false); setEventOnly(false); enableRestaurantMode() }}
            >
              <Utensils size={14} />爸媽想休息
            </button>
          </div>

          {weather && (
            <div className="weather-recommendation">
              <CloudRain size={20} />
              <div>
                <strong>{weather.label}・{Math.round(weather.temperature)}°C</strong>
                <span>今日降雨機率 {weather.precipitationProbability}%・已依天氣優先排序</span>
              </div>
              {weather.precipitationProbability >= 45 && !rainyOnly && (
                <button onClick={() => setRainyOnly(true)}>只看雨備</button>
              )}
            </div>
          )}
          {weatherStatus === 'loading' && <div className="weather-loading">正在取得地區天氣…</div>}

          {showFilters && (
            <FilterSheet
              setting={setting}
              duration={duration}
              onSetting={setSetting}
              onDuration={setDuration}
              onClear={clearFilters}
            />
          )}

          <div className="section-heading">
            <div>
              <span className="section-kicker"><TentTree size={17} /> {activeTab === 'favorites' ? '我的收藏' : '為你精選'}</span>
              <h2>{activeTab === 'favorites' ? '收藏的景點' : '週末靈感地圖'}</h2>
              <p>
                {activeTab === 'favorites' ? '已收藏' : '找到'} <strong>{displayedPlaces.length}</strong> 個地點
                {viewportPlaces.length > MAX_VISIBLE_PLACES && `・先顯示前 ${MAX_VISIBLE_PLACES} 筆`}
                {mapViewport && activeTab !== 'favorites' && `・目前地圖範圍 ${viewportPlaces.length} 筆`}
                {region === '全部' && activeTab !== 'favorites' && '・選擇地區可查看完整景點'}
              </p>
            </div>
            <div className="section-heading-actions">
              {activeTab === 'favorites' && displayedPlaces.length >= 2 && (
                <button
                  className={`plan-button ${showItinerary ? 'is-active' : ''}`}
                  onClick={() => setShowItinerary((v) => !v)}
                >
                  <CalendarDays size={15} />{showItinerary ? '收起行程' : '規劃行程'}
                </button>
              )}
              <button
                className={`location-button ${locationStatus === 'ready' ? 'is-active' : ''}`}
                onClick={findNearbyPlaces}
                disabled={locationStatus === 'loading'}
                aria-label={locationStatus === 'loading' ? '正在取得位置' : '顯示我的附近'}
              >
                <LocateFixed size={17} />
                {locationStatus === 'loading' ? '定位中…' : locationStatus === 'ready' ? '離我最近' : '我的附近'}
              </button>
            </div>
          </div>

          {activeTab === 'favorites' && showItinerary && (
            <ItineraryPlanner
              favoritePlaces={displayedPlaces}
              userLocation={userLocation}
              onOpenPlace={openPlace}
              onClose={() => setShowItinerary(false)}
            />
          )}

          {locationMessage && (
            <div className={`location-notice ${locationStatus}`} role="status">
              <LocateFixed size={16} />
              <span>{locationMessage}</span>
              <button
                onClick={() => setLocationMessage('')}
                aria-label="關閉定位訊息"
              >
                <X size={15} />
              </button>
            </div>
          )}

          <div className="explore-grid">
            <div className="map-panel">
              <MapView
                places={mapPlaces}
                selected={selected}
                onSelect={(place) => {
                  openPlace(place)
                }}
                userLocation={userLocation}
                focusKey={mapFocusKey}
                onViewportChange={handleMapViewportChange}
                interactive={mapInteractive}
              />
              {isMobilePortraitMap && !mobileMapInteractive && (
                <button
                  className="map-interaction-overlay"
                  onClick={() => {
                    setMobileMapInteractive(true)
                    playUiSound('tap')
                  }}
                  type="button"
                >
                  <span>點一下啟用地圖</span>
                  <small>啟用後可拖曳、縮放查看附近景點</small>
                </button>
              )}
              {isMobilePortraitMap && mobileMapInteractive && (
                <button
                  className="map-lock-button"
                  onClick={() => {
                    setMobileMapInteractive(false)
                    playUiSound('tap')
                  }}
                  type="button"
                >
                  完成
                </button>
              )}
              <div className="map-legend"><span /><span>點一下圖標查看景點</span></div>
              {mapViewport && (
                <button
                  className="map-area-button"
                  onClick={() => {
                    setCompactResultsLimit((value) => Math.max(value, COMPACT_INITIAL_RESULTS + COMPACT_RESULTS_STEP))
                    playUiSound('tap')
                    document.querySelector('.results-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                  }}
                >
                  <Search size={14} />
                  搜尋此區域・{viewportPlaces.length} 筆
                </button>
              )}
            </div>
            <div className="results-panel">
              <div className="mobile-sheet-head">
                <span className="sheet-grabber" aria-hidden="true" />
                <div>
                  <strong>{mapViewport ? '目前地圖範圍' : activeTab === 'favorites' ? '收藏清單' : '推薦清單'}</strong>
                  <small>{mapAreaLabel}{isCompactResultsView ? `・已顯示 ${visiblePlaces.length} / ${viewportPlaces.length}` : ''}</small>
                </div>
                <span className="mobile-sheet-action-placeholder" aria-hidden="true" />
              </div>
              {placesStatus === 'loading' ? (
                <div className="empty-state loading-state">
                  <MapPin size={40} />
                  <h3>正在整理親子景點</h3>
                  <p>載入官方開放資料中，馬上就好。</p>
                </div>
              ) : placesStatus === 'error' ? (
                <div className="empty-state">
                  <Wrench size={40} />
                  <h3>景點資料暫時載入失敗</h3>
                  <p>請確認網路後重新整理頁面。</p>
                  <button onClick={() => window.location.reload()}>重新載入</button>
                </div>
              ) : visiblePlaces.length ? (
                <>
                  {visiblePlaces.map((place) => (
                    <PlaceCard
                      key={place.id}
                      place={place}
                      onOpen={() => openPlace(place)}
                      favorite={favorites.includes(place.id)}
                      onFavorite={() => toggleFavorite(place.id)}
                      distance={userLocation ? distanceInKm(userLocation, place) : undefined}
                    />
                  ))}
                  {canLoadMoreResults && (
                    <div className="load-more-panel">
                      <p>{visiblePlaces.length} / {viewportPlaces.length}</p>
                      <button
                        className="load-more-button"
                        onClick={() => {
                          setCompactResultsLimit((value) => Math.min(value + COMPACT_RESULTS_STEP, viewportPlaces.length))
                          playUiSound('tap')
                        }}
                      >
                        載入更多
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-state">
                  <Mascot variant={activeTab === 'favorites' ? 'camera' : 'thinking'} className="empty-mascot" />
                  <h3>{activeTab === 'favorites' ? '還沒有收藏景點' : '這組條件還沒有景點'}</h3>
                  <p>{activeTab === 'favorites' ? '看到喜歡的地點時，點愛心就能放進這裡。' : '換個地區或放寬孩子年齡試試看。'}</p>
                  <button onClick={activeTab === 'favorites' ? () => openExplore('explore') : clearFilters}>
                    {activeTab === 'favorites' ? '去探索景點' : '查看全部景點'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
        )}
      </main>

      <nav className="bottom-nav" aria-label="主要導覽">
        <button className={activeTab === 'home' && !showProfile ? 'active' : ''} onClick={openHome}><Home size={21} /><span>首頁</span></button>
        <button className={activeTab === 'explore' && !showProfile ? 'active' : ''} onClick={() => openExplore('explore')}><Compass size={21} /><span>探索</span></button>
        <button className={activeTab === 'favorites' && !showProfile ? 'active' : ''} onClick={() => openExplore('favorites')}><Heart size={21} /><span>收藏</span></button>
        <button className={showProfile ? 'active' : ''} onClick={openProfile}><Baby size={21} /><span>我的</span></button>
        <span className="nav-indicator" style={{ '--nav-index': showProfile ? 3 : activeTab === 'home' ? 0 : activeTab === 'explore' ? 1 : 2 } as CSSProperties} />
      </nav>

      {showProfile && (
        <ProfileDrawer
          onClose={() => setShowProfile(false)}
          personalityProfile={personalityProfile}
          favoritesCount={favorites.length}
          clickHistoryCount={clickHistory.length}
          age={age}
          onViewFavorites={() => { setShowProfile(false); openExplore('favorites') }}
          onAdjustPreferences={() => { setShowProfile(false); setShowFilters(true); openExplore('explore') }}
        />
      )}

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <aside className="place-detail" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelected(null)} aria-label="關閉"><X /></button>
            <div className="detail-image">
              <PlaceImage place={selected} className="detail-photo" eager />
              <span>{selected.category}</span>
            </div>
            <div className="detail-content">
              <div className="detail-title">
                <div>
                  <span className="eyebrow">{selected.city}・{selected.district}</span>
                  <h2>{selected.name}</h2>
                </div>
                <button className={`heart-button detail-heart ${favorites.includes(selected.id) ? 'is-favorite' : ''}`} onClick={() => toggleFavorite(selected.id)}>
                  <Heart fill={favorites.includes(selected.id) ? 'currentColor' : 'none'} />
                </button>
              </div>
              {selected.rating !== null ? (
                <div className="rating-line"><Star size={17} fill="currentColor" /> <strong>{selected.rating}</strong> Google 評分・{compactNumber(selected.reviews)} 則評論</div>
              ) : (
                <div className="rating-line official-line"><Database size={17} />交通部觀光署官方開放資料</div>
              )}
              {selected.michelinAward && (
                <div className="michelin-banner">
                  <MichelinBadge award={selected.michelinAward} />
                  <span className="michelin-banner-text">
                    {selected.michelinAward === '3star' && '米其林三星・每一口都值得專程前往'}
                    {selected.michelinAward === '2star' && '米其林二星・出色料理值得繞道品嚐'}
                    {selected.michelinAward === '1star' && '米其林一星・同類別中特別優秀的餐廳'}
                    {selected.michelinAward === 'bib_gourmand' && '必比登推介・物超所值的好滋味'}
                  </span>
                </div>
              )}
              <p className="detail-description">{selected.description}</p>
              {(selected.weekendEvent || selected.placeType === '活動') && (
                <div className="event-info-bar">
                  <CalendarDays size={15} />
                  {selected.weekendEvent ? '本週末限定活動' : '期間限定活動'}
                  {selected.eventStart && ` ${new Date(selected.eventStart).toLocaleDateString('zh-TW')} 起`}
                  {selected.eventEnd && ` 至 ${new Date(selected.eventEnd).toLocaleDateString('zh-TW')}`}
                </div>
              )}
              {selected.placeType !== '餐飲' && (
                <NearbyRestaurants allPlaces={places} anchor={selected} onOpen={openPlace} />
              )}
              {selected.completeness && (
                <div className="completeness-panel">
                  <div>
                    <strong>資訊完整度 {selected.completeness.score}%</strong>
                    <span>資料更新：{selected.updatedAt ? new Date(selected.updatedAt).toLocaleDateString('zh-TW') : '未提供'}</span>
                  </div>
                  {selected.completeness.missing.length > 0 && (
                    <small>尚缺：{selected.completeness.missing.join('、')}</small>
                  )}
                </div>
              )}
              {aiInsights[selected.id] && (
                <div className="ai-insight">
                  <div className="ai-heading">
                    <span><Bot size={18} />AI 親子摘要</span>
                    <small>本機 AI 整理</small>
                  </div>
                  <p>{aiInsights[selected.id].summary || aiInsights[selected.id].familySummary}</p>
                  <div className="ai-badges">
                    <span>雨天：{aiInsights[selected.id].rainyDay || aiInsights[selected.id].rainyDayTip || '未確認'}</span>
                    <span>推車：{aiInsights[selected.id].stroller || '未確認'}</span>
                  </div>
                  <ul>
                    {(aiInsights[selected.id].whyForKids || aiInsights[selected.id].parentFriendlyTags || []).map((item) => <li key={item}>{item}</li>)}
                  </ul>
                  {(aiInsights[selected.id].tips?.length || 0) > 0 && (
                    <div className="ai-tip">行前提醒：{aiInsights[selected.id].tips?.join('；')}</div>
                  )}
                  <small className="ai-disclaimer">AI 根據官方開放資料整理，實際資訊請以官方網站為準。</small>
                </div>
              )}
              <div className="info-list">
                <div><MapPin /><span><small>地址</small>{selected.address}</span></div>
                <div><Clock3 /><span><small>開放時間</small>{selected.hours}</span></div>
                <div><Baby /><span><small>適合年齡</small>{selected.ageMin}–{selected.ageMax} 歲・{selected.setting}・{selected.duration}</span></div>
                <div><Ticket /><span><small>票價</small>{selected.priceLabel}</span></div>
                <div><Database /><span><small>資料來源</small>{selected.dataSource}</span></div>
              </div>
              <div className="detail-section">
                <h3>孩子會喜歡</h3>
                <div className="highlight-grid">
                  {selected.highlights.map((item) => <span key={item}><Star size={10} /> {item}</span>)}
                </div>
              </div>
              <PackingList place={selected} weather={weather} />
              <div className="detail-section">
                <h3>親子友善設施</h3>
                {selected.familyAmenities && (
                  <>
                    <div className="amenity-grid">
                      {([
                        ['accessibility', '無障礙設施／廁所', selected.familyAmenities.accessibility],
                        ['ramp', '無障礙坡道', selected.familyAmenities.ramp],
                        ['nursingRoom', '哺乳／育嬰室', selected.familyAmenities.nursingRoom],
                        ['diaperTable', '尿布台', selected.familyAmenities.diaperTable],
                        ['familyRestroom', '親子廁所', selected.familyAmenities.familyRestroom],
                        ['strollerFriendly', '推車友善', selected.familyAmenities.strollerFriendly],
                        ['parking', '停車設施', selected.familyAmenities.parking],
                      ] as [string, string, string | null | undefined][]).map(([key, label, status]) => {
                        const AmenityIcon = AMENITY_ICONS[key as keyof typeof AMENITY_ICONS]
                        const evidenceItems = getFamilyEvidence(selected)
                        const openDataConfirmed = evidenceItems.some((item) => item.type === key)
                        return (
                          <div className={`amenity-item ${status}`} key={label}>
                            <span>{AmenityIcon && <AmenityIcon size={18} />}</span>
                            <div>
                              <strong>{label}</strong>
                              <small>
                                {status === 'confirmed'
                                  ? openDataConfirmed ? '官方設施資料確認' : '官方資料有提及'
                                  : '官方資料未提供'}
                              </small>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {selected.familyAmenities.evidence && selected.familyAmenities.evidence.length > 0 && (
                      <div className="amenity-evidence">
                        <strong>官方設施資料比對</strong>
                        {selected.familyAmenities.evidence.map((item) => (
                          <a href={item.url} target="_blank" rel="noreferrer" key={`${item.source}-${item.label}`}>
                            <span><b>{item.label}</b><small>{item.source}</small></span>
                            <em>{item.note}</em>
                            <ExternalLink size={14} />
                          </a>
                        ))}
                      </div>
                    )}
                  </>
                )}
                <div className="facility-row">
                  {selected.facilities.map((item) => <span key={item}>{item}</span>)}
                </div>
                {selected.familyAmenities?.parkingInfo && (
                  <div className="parking-note">
                    <strong>停車說明</strong>
                    <span>{selected.familyAmenities.parkingInfo}</span>
                  </div>
                )}
              </div>
              <div className="detail-section">
                <h3>爸媽最近回報</h3>
                {reports[selected.id] ? (
                  <div className="parent-report-summary">
                    <div>
                      <CheckCircle2 size={18} />
                      <span>
                        <strong>{new Date(reports[selected.id].visitedAt).toLocaleDateString('zh-TW')} 去過</strong>
                        <small>{reports[selected.id].liked ? '孩子喜歡這裡' : '體驗普通'}</small>
                      </span>
                    </div>
                    {reports[selected.id].note && <p>{reports[selected.id].note}</p>}
                    <button onClick={() => setShowReportForm(true)}>更新回報</button>
                  </div>
                ) : (
                  <button className="report-start" onClick={() => setShowReportForm(true)}>
                    <NotebookPen size={17} />我最近去過，補充現場資訊
                  </button>
                )}
                {showReportForm && (
                  <ReportForm
                    reportLiked={reportLiked}
                    setReportLiked={setReportLiked}
                    reportAmenities={reportAmenities}
                    setReportAmenities={setReportAmenities}
                    reportNote={reportNote}
                    setReportNote={setReportNote}
                    synced={Boolean(supabase)}
                    onCancel={() => setShowReportForm(false)}
                    onSave={saveReport}
                  />
                )}
              </div>
              <div className="detail-section">
                <h3>爸媽真實分享</h3>
                <div className="source-list">
                  {selected.sources.map((source) => (
                    <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                      {source.type === 'Instagram' ? <Instagram /> : <ExternalLink />}
                      <span><small>{source.type}</small>{source.label}</span>
                      <ExternalLink size={15} />
                    </a>
                  ))}
                </div>
              </div>
              <a className="maps-cta" href={selected.mapsUrl} target="_blank" rel="noreferrer">
                <Navigation size={19} />在 Google 地圖查看路線
              </a>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

export default App
