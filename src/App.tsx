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
  Moon,
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
  ThumbsDown,
  ThumbsUp,
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
  type AiInsight,
  type FamilyAmenityKey,
  type ParentReport,
  type Place,
  type WeatherSummary,
} from './data'
import { MapView, type MapViewport } from './MapView'
import { BAD_PLACEHOLDER_IMAGES, FALLBACK_IMAGE } from './imageUtils'
import { WeekendDiscovery } from './components/WeekendDiscovery'
import { supabase } from './lib/supabase'
import { getDeviceId } from './lib/deviceId'
import { NearbyRestaurants } from './components/NearbyRestaurants'
import { PackingList } from './components/PackingList'
import { ItineraryPlanner } from './components/ItineraryPlanner'

const regions = ['全部', '北部', '中部', '南部', '東部', '離島'] as const
const settings = ['全部', '室內', '室外', '室內外'] as const
const durations = ['全部', '半日', '一日', '晚上'] as const
const regionIcons: Partial<Record<(typeof regions)[number], ReactNode>> = {
  北部: <Building2 size={14} />,
  中部: <Mountain size={14} />,
  南部: <Waves size={14} />,
  東部: <TreePine size={14} />,
  離島: <Anchor size={14} />,
}
const settingIcons: Partial<Record<(typeof settings)[number], ReactNode>> = {
  室內: <Home size={14} />,
  室外: <SunMedium size={14} />,
  室內外: <Layers size={14} />,
}
const durationIcons: Partial<Record<(typeof durations)[number], ReactNode>> = {
  半日: <Clock3 size={14} />,
  一日: <CalendarDays size={14} />,
  晚上: <Moon size={14} />,
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
  return Math.min(1, (place.qualityScore ?? 0) / 100)
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

function compactNumber(value: number) {
  return value >= 10000 ? `${(value / 10000).toFixed(1)}萬` : value.toLocaleString('zh-TW')
}

function regionFromCoordinate({ lat, lng }: { lat: number; lng: number }): RegionName | null {
  if (lat < 21.7 || lat > 26.5 || lng < 118 || lng > 122.5) return null
  if (lng < 120.35 || lat > 25.6) return '離島'
  if (lat <= 24.55 && lng >= 120.9) return '東部'
  if (lat >= 24.55) return '北部'
  if (lat >= 23.45) return '中部'
  return '南部'
}

function weatherLabel(code: number) {
  if (code === 0) return '晴朗'
  if (code <= 3) return '多雲'
  if (code <= 48) return '有霧'
  if (code <= 67 || code >= 80) return '有雨'
  return '天氣不穩'
}

async function fetchWeather(lat: number, lng: number): Promise<WeatherSummary> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('current', 'temperature_2m,weather_code')
  url.searchParams.set('daily', 'precipitation_probability_max')
  url.searchParams.set('timezone', 'Asia/Taipei')
  url.searchParams.set('forecast_days', '1')
  const response = await fetch(url)
  if (!response.ok) throw new Error('weather')
  const payload = await response.json()
  return {
    temperature: Number(payload.current?.temperature_2m || 0),
    weatherCode: Number(payload.current?.weather_code || 0),
    precipitationProbability: Number(payload.daily?.precipitation_probability_max?.[0] || 0),
    label: weatherLabel(Number(payload.current?.weather_code || 0)),
    fetchedAt: new Date().toISOString(),
  }
}

function PlaceImage({
  place,
  className,
  eager = false,
}: {
  place: Place
  className: string
  eager?: boolean
}) {
  const candidates = useMemo(
    () => [...new Set(
      [place.image, ...(place.imageCandidates || []), FALLBACK_IMAGE]
        .filter((url): url is string => Boolean(url) && !BAD_PLACEHOLDER_IMAGES.has(url))
        .concat(FALLBACK_IMAGE),
    )],
    [place.image, place.imageCandidates],
  )
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(0)
  }, [place.id])

  const advanceImage = () => {
    setIndex((current) => Math.min(current + 1, candidates.length - 1))
  }

  return (
    <img
      key={`${place.id}:${index}`}
      src={candidates[index]}
      alt={`${place.name}照片`}
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      data-image-fallback={candidates[index] === FALLBACK_IMAGE ? 'true' : 'false'}
      onLoad={(event) => {
        if (
          candidates[index] !== FALLBACK_IMAGE &&
          (event.currentTarget.naturalWidth < 80 || event.currentTarget.naturalHeight < 80)
        ) {
          advanceImage()
        }
      }}
      onError={advanceImage}
    />
  )
}

function PlaceCard({
  place,
  onOpen,
  favorite,
  onFavorite,
  distance,
}: {
  place: Place
  onOpen: () => void
  favorite: boolean
  onFavorite: () => void
  distance?: number
}) {
  return (
    <article className="place-card" onClick={onOpen}>
      <div className="place-image-wrap">
        <PlaceImage place={place} className="place-image" />
        <span className="place-image-scrim" />
        <span className={`price-tag${place.priceLabel === '免費' ? ' price-free' : ''}`}>{place.priceLabel}</span>
        <button
          className={`heart-button ${favorite ? 'is-favorite' : ''}`}
          onClick={(event) => {
            event.stopPropagation()
            onFavorite()
          }}
          aria-label={favorite ? '取消收藏' : '加入收藏'}
        >
          <Heart size={18} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="place-copy">
        <h3>{place.name}</h3>
        <div className="eyebrow">
          <span>{place.category}</span>
          <span>・</span>
          <span>{place.setting}</span>
        </div>
        <div className="decision-badges">
          {place.weekendEvent && <span className="event-badge"><CalendarDays size={12} />本週末</span>}
          {place.priceLabel === '免費' && <span className="tag-pill-free">免費入場</span>}
          {place.rainyDay && <span className="tag-pill-rain"><Umbrella size={11} />雨天備案</span>}
          {place.completeness && (
            <span className={`completeness-badge score-${Math.floor(place.completeness.score / 25)}`}>
              資訊 {place.completeness.score}%
            </span>
          )}
        </div>
        <div className="meta-row">
          <span><MapPin size={14} />{place.city} {place.district}</span>
          {place.rating !== null ? (
            <>
              <span><Star size={14} fill="currentColor" />{place.rating}</span>
              <span className="reviews">({compactNumber(place.reviews)})</span>
            </>
          ) : (
            <span className="official-data"><Database size={13} />官方資料</span>
          )}
        </div>
        <p>{place.description}</p>
        <div className="card-footer">
          <div className="tag-row">
            <span className="tag-pill-age"><Baby size={13} />{place.ageMin}–{place.ageMax} 歲</span>
            <span><Clock3 size={13} />{place.duration}</span>
            {distance !== undefined && (
              <span className="distance-tag"><LocateFixed size={13} />距離約 {distance < 10 ? distance.toFixed(1) : Math.round(distance)} km</span>
            )}
          </div>
          <span className="card-cta">查看詳情 <Navigation size={13} /></span>
        </div>
      </div>
    </article>
  )
}

function App() {
  const [places, setPlaces] = useState<Place[]>([])
  const [placeCache, setPlaceCache] = useState<Partial<Record<(typeof regions)[number], Place[]>>>({})
  const [aiInsights, setAiInsights] = useState<Record<string, AiInsight>>({})
  const [placesStatus, setPlacesStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<(typeof regions)[number]>('全部')
  const [age, setAge] = useState<(typeof ageOptions)[number]['value']>('all')
  const [setting, setSetting] = useState<(typeof settings)[number]>('全部')
  const [duration, setDuration] = useState<(typeof durations)[number]>('全部')
  const [rainyOnly, setRainyOnly] = useState(false)
  const [eventOnly, setEventOnly] = useState(false)
  const [restaurantOnly, setRestaurantOnly] = useState(false)
  const [weather, setWeather] = useState<WeatherSummary | null>(null)
  const [weatherStatus, setWeatherStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [showFilters, setShowFilters] = useState(false)
  const [selected, setSelected] = useState<Place | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [mapViewport, setMapViewport] = useState<MapViewport | null>(null)
  const [mapFocusKey, setMapFocusKey] = useState(0)
  const viewportRequestRegion = useRef<RegionName | null>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [locationMessage, setLocationMessage] = useState('')
  const [activeTab, setActiveTab] = useState<'home' | 'explore' | 'favorites' | 'profile'>('home')
  const [showProfile, setShowProfile] = useState(false)
  const [wizardAge, setWizardAge]           = useState<WizardAgeGroup>('all')
  const [wizardDuration, setWizardDuration] = useState<WizardDuration>('all')
  const [wizardDistKm, setWizardDistKm]     = useState<10 | 20 | 40>(20)
  const [wizardResults, setWizardResults]   = useState<WizardResult[]>([])
  const [wizardRan, setWizardRan]           = useState(false)
  const [showReportForm, setShowReportForm] = useState(false)
  const [showItinerary, setShowItinerary] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('holiday-go-where:sound') === 'on')
  const [clickHistory, setClickHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('holiday-go-where:click-history') || '[]') } catch { return [] }
  })
  const audioContextRef = useRef<AudioContext | null>(null)
  const [reportLiked, setReportLiked] = useState(true)
  const [reportNote, setReportNote] = useState('')
  const [reportAmenities, setReportAmenities] = useState<Partial<Record<FamilyAmenityKey, boolean>>>({})
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('holiday-go-where:favorites') || '[]')
    } catch {
      return []
    }
  })
  const [reports, setReports] = useState<Record<string, ParentReport>>(() => {
    try {
      return JSON.parse(localStorage.getItem('holiday-go-where:reports') || '{}')
    } catch {
      return {}
    }
  })

  useEffect(() => {
    localStorage.setItem('holiday-go-where:favorites', JSON.stringify(favorites))
  }, [favorites])

  useEffect(() => {
    localStorage.setItem('holiday-go-where:reports', JSON.stringify(reports))
  }, [reports])

  useEffect(() => {
    if (!supabase) return
    const deviceId = getDeviceId()
    supabase.from('reports').select('*').eq('device_id', deviceId).then(({ data }) => {
      if (!data || data.length === 0) return
      setReports((current) => {
        const merged = { ...current }
        for (const row of data) {
          merged[row.place_id] = {
            visitedAt: row.visited_at,
            liked: row.liked,
            note: row.note,
            amenities: row.amenities ?? {},
            updatedAt: row.updated_at,
          }
        }
        return merged
      })
    })
  }, [])

  useEffect(() => {
    localStorage.setItem('holiday-go-where:sound', soundEnabled ? 'on' : 'off')
  }, [soundEnabled])

  useEffect(() => {
    localStorage.setItem('holiday-go-where:click-history', JSON.stringify(clickHistory))
  }, [clickHistory])

  const playUiSound = useCallback((kind: 'tap' | 'favorite' | 'open' = 'tap', force = false) => {
    if (!soundEnabled && !force) return
    const AudioContextClass = window.AudioContext || (window as typeof window & {
      webkitAudioContext?: typeof AudioContext
    }).webkitAudioContext
    if (!AudioContextClass) return
    const context = audioContextRef.current || new AudioContextClass()
    audioContextRef.current = context
    const now = context.currentTime
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const frequencies = kind === 'favorite' ? [523, 659] : kind === 'open' ? [392, 523] : [440]
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequencies[0], now)
    if (frequencies[1]) oscillator.frequency.exponentialRampToValueAtTime(frequencies[1], now + 0.09)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.15)
  }, [soundEnabled])

  const toggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    if (next) playUiSound('open', true)
  }

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
    let active = true
    import('./generated/places-featured.json')
      .then((module) => {
        if (!active) return
        const featured = module.default as Place[]
        setPlaces(featured)
        setPlaceCache({ 全部: featured })
        setPlacesStatus('ready')
      })
      .catch(() => {
        if (active) setPlacesStatus('error')
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserLocation({ lat: coords.latitude, lng: coords.longitude })
        setMapFocusKey((current) => current + 1)
        setLocationStatus('ready')
        setLocationMessage('已依距離重新排列景點，藍點是你的位置。')
        setWeatherStatus('loading')
        void fetchWeather(coords.latitude, coords.longitude)
          .then((summary) => { setWeather(summary); setWeatherStatus('ready') })
          .catch(() => setWeatherStatus('error'))
      },
      () => { /* 使用者拒絕或逾時，靜默略過 */ },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30 * 60 * 1000 },
    )
  }, [])

  const selectRegion = async (nextRegion: (typeof regions)[number]) => {
    playUiSound()
    setRegion(nextRegion)
    setMapViewport(null)
    const cached = placeCache[nextRegion]
    if (cached) {
      setPlaces(cached)
      setPlacesStatus('ready')
      setMapFocusKey((current) => current + 1)
      if (nextRegion !== '全部') {
        setWeatherStatus('loading')
        void fetchWeather(regionCenters[nextRegion].lat, regionCenters[nextRegion].lng)
          .then((summary) => {
            setWeather(summary)
            setWeatherStatus('ready')
          })
          .catch(() => setWeatherStatus('error'))
      }
      return
    }
    if (nextRegion === '全部') return

    setWeatherStatus('loading')
    void fetchWeather(regionCenters[nextRegion].lat, regionCenters[nextRegion].lng)
      .then((summary) => {
        setWeather(summary)
        setWeatherStatus('ready')
      })
      .catch(() => setWeatherStatus('error'))

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

  const handleMapViewportChange = useCallback((nextViewport: MapViewport) => {
    setMapViewport(nextViewport)
    const nextRegion = regionFromCoordinate(nextViewport.center)
    if (!nextRegion) {
      setLocationMessage('地圖已移到資料範圍外，請移回臺灣附近。')
      return
    }

    viewportRequestRegion.current = nextRegion
    setRegion(nextRegion)
    setLocationMessage(`已依地圖中心載入${nextRegion}景點，拖曳或縮放可繼續探索。`)
    setWeatherStatus('loading')
    void fetchWeather(nextViewport.center.lat, nextViewport.center.lng)
      .then((summary) => {
        if (viewportRequestRegion.current !== nextRegion) return
        setWeather(summary)
        setWeatherStatus('ready')
      })
      .catch(() => setWeatherStatus('error'))

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
  }, [placeCache])

  useEffect(() => {
    import('./generated/ai-insights.json')
      .then((module) => setAiInsights(module.default as Record<string, AiInsight>))
      .catch(() => setAiInsights({}))
  }, [])

  const filteredPlaces = useMemo(() => {
    const [minAge, maxAge] = age === 'all' ? [0, 99] : age.split('-').map(Number)
    const matches = places.filter((place) => {
      const textMatches = `${place.name}${place.city}${place.district}${place.category}`
        .toLowerCase()
        .includes(query.toLowerCase())
      const ageMatches = age === '0-2'
        ? place.ageMin === 0
        : place.ageMin <= maxAge && place.ageMax >= minAge
      return (
        textMatches &&
        ageMatches &&
        (!rainyOnly || place.rainyDay === true) &&
        (!eventOnly || place.placeType === '活動') &&
        (!restaurantOnly || place.placeType === '餐飲') &&
        (setting === '全部' || place.setting === setting || (setting !== '室內外' && place.setting === '室內外')) &&
        (duration === '全部' || place.duration === duration)
      )
    })
    const sorted = [...matches]
    const rainyWeather = weather && (weather.precipitationProbability >= 45 || weather.weatherCode >= 51)
    const hotWeather = weather && weather.temperature >= 32
    if (weather) {
      sorted.sort((first, second) => {
        const weatherScore = (place: Place) =>
          (rainyWeather && place.rainyDay ? 3 : 0) +
          (hotWeather && place.setting !== '室外' ? 2 : 0) +
          (place.weekendEvent ? 2 : 0)
        return weatherScore(second) - weatherScore(first)
      })
    }
    if (rainyOnly) {
      sorted.sort((first, second) =>
        Number(second.placeType === '餐飲') - Number(first.placeType === '餐飲'),
      )
    }
    const sortLocation = mapViewport?.center || userLocation
    if (!sortLocation) return sorted
    return sorted.sort((first, second) => {
      if (rainyOnly && first.placeType !== second.placeType) {
        return Number(second.placeType === '餐飲') - Number(first.placeType === '餐飲')
      }
      return distanceInKm(sortLocation, first) - distanceInKm(sortLocation, second)
    })
  }, [places, query, age, setting, duration, rainyOnly, eventOnly, restaurantOnly, weather, userLocation, mapViewport])
  const displayedPlaces = useMemo(
    () => activeTab === 'favorites'
      ? filteredPlaces.filter((place) => favorites.includes(place.id))
      : filteredPlaces,
    [activeTab, favorites, filteredPlaces],
  )
  const visiblePlaces = useMemo(
    () => displayedPlaces.slice(0, MAX_VISIBLE_PLACES),
    [displayedPlaces],
  )
  const mapPlaces = useMemo(
    () => {
      if (!mapViewport) return displayedPlaces.slice(0, MAX_MAP_PLACES)
      const latPadding = Math.max((mapViewport.bounds.north - mapViewport.bounds.south) * 0.18, 0.02)
      const lngPadding = Math.max((mapViewport.bounds.east - mapViewport.bounds.west) * 0.18, 0.02)
      return displayedPlaces
        .filter((place) =>
          place.lat <= mapViewport.bounds.north + latPadding &&
          place.lat >= mapViewport.bounds.south - latPadding &&
          place.lng <= mapViewport.bounds.east + lngPadding &&
          place.lng >= mapViewport.bounds.west - lngPadding)
        .sort((first, second) =>
          distanceInKm(mapViewport.center, first) - distanceInKm(mapViewport.center, second))
        .slice(0, MAX_MAP_PLACES)
    },
    [displayedPlaces, mapViewport],
  )

  const recommended = useMemo(() => {
    if (placesStatus !== 'ready' || !places.length) return []
    const today = new Date()
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()
    const ranked = [...places]
      .filter((place) => place.image)
      .sort((first, second) => (second.qualityScore ?? 0) - (first.qualityScore ?? 0))
      .slice(0, 24)
    const offset = seed % Math.max(ranked.length, 1)
    return [...ranked.slice(offset), ...ranked.slice(0, offset)].slice(0, 10)
  }, [places, placesStatus])

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
  }, [playUiSound])

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
        setWeatherStatus('loading')
        void fetchWeather(coords.latitude, coords.longitude)
          .then((summary) => {
            setWeather(summary)
            setWeatherStatus('ready')
          })
          .catch(() => setWeatherStatus('error'))
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
      () => document.querySelector('.explore-section')?.scrollIntoView({ behavior: 'smooth' }),
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
          <span className="brand-mark" aria-hidden="true">
            <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="brand-logo-img" />
          </span>
          <span className="brand-text">
            <strong>假日去哪兒</strong>
            <small>讓每個週末，都值得孩子期待</small>
          </span>
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
          <div className="home-view">
            <section className="hero-card">
              <img
                src={`${import.meta.env.BASE_URL}hero-family.svg`}
                alt=""
                className="hero-card-bg"
                aria-hidden="true"
              />
              <div className="hero-card-overlay" />
              <div className="hero-card-content">
                <span className="hero-tag"><Sparkles size={13} /> 親子週末靈感</span>
                <h1>下一個週末，<br />一起創造<br /><span>美好回憶</span></h1>
                <p>天氣、年齡、親子設施與即時活動，一次替你整理好。</p>
              </div>
              <div className="hero-search">
                <label className="search-box">
                  <Search size={19} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') goExplore() }}
                    placeholder="搜尋景點、城市或想玩的活動"
                  />
                  {query && <button onClick={() => setQuery('')} aria-label="清除搜尋"><X size={16} /></button>}
                </label>
                <button className="filter-toggle" onClick={() => goExplore(() => setShowFilters(true))} aria-label="開啟篩選">
                  <SlidersHorizontal size={18} /><span>篩選</span>
                </button>
              </div>
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
              <button className="entry-tile" onClick={() => goExplore(() => { setRestaurantOnly(true); setRainyOnly(false); setEventOnly(false) })}>
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
                  {isRainy ? <CloudRain size={22} /> : <SunMedium size={22} />}
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
        )}

        {activeTab !== 'home' && (
        <section className="explore-section">
          <div className="explore-toolbar">
            <label className="search-box">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
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
            <button className={rainyOnly ? 'active rainy-filter' : 'rainy-filter'} onClick={() => { playUiSound(); setRainyOnly((value) => !value) }}>
              <Umbrella size={14} /> 雨天備案
            </button>
            <button className={eventOnly ? 'active event-filter' : 'event-filter'} onClick={() => { playUiSound(); setEventOnly((value) => !value) }}>
              <CalendarCheck size={14} /> 本週活動
            </button>
            <button className={restaurantOnly ? 'active' : ''} onClick={() => { playUiSound(); setRestaurantOnly((value) => !value) }}>
              <Utensils size={14} /> 親子餐廳
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
            <div className="advanced-filters">
              <div>
                <span className="filter-label"><SunMedium size={16} />空間類型</span>
                <div className="filter-pills">
                  {settings.map((item) => (
                  <button key={item} className={setting === item ? 'active' : ''} onClick={() => setSetting(item)}>
                    {settingIcons[item]}{item}
                  </button>
                ))}
                </div>
              </div>
              <div>
                <span className="filter-label"><Clock3 size={16} />可用時間</span>
                <div className="filter-pills">
                  {durations.map((item) => (
                  <button key={item} className={duration === item ? 'active' : ''} onClick={() => setDuration(item)}>
                    {durationIcons[item]}{item}
                  </button>
                ))}
                </div>
              </div>
              <button className="clear-button" onClick={clearFilters}>清除條件</button>
            </div>
          )}

          <div className="section-heading">
            <div>
              <span className="section-kicker"><TentTree size={17} /> {activeTab === 'favorites' ? '我的收藏' : '為你精選'}</span>
              <h2>{activeTab === 'favorites' ? '收藏的景點' : '週末靈感地圖'}</h2>
              <p>
                {activeTab === 'favorites' ? '已收藏' : '找到'} <strong>{displayedPlaces.length}</strong> 個地點
                {displayedPlaces.length > MAX_VISIBLE_PLACES && `・先顯示前 ${MAX_VISIBLE_PLACES} 筆`}
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
                onSelect={setSelected}
                userLocation={userLocation}
                focusKey={mapFocusKey}
                onViewportChange={handleMapViewportChange}
              />
              <div className="map-legend"><span /><span>點一下圖標查看景點</span></div>
            </div>
            <div className="results-panel">
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
              ) : visiblePlaces.length ? visiblePlaces.map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  onOpen={() => openPlace(place)}
                  favorite={favorites.includes(place.id)}
                  onFavorite={() => toggleFavorite(place.id)}
                  distance={userLocation ? distanceInKm(userLocation, place) : undefined}
                />
              )) : (
                <div className="empty-state">
                  {activeTab === 'favorites' ? <Heart size={40} /> : <Baby size={40} />}
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
        <div className="modal-backdrop profile-backdrop" onClick={() => setShowProfile(false)}>
          <aside className="profile-sheet" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowProfile(false)} aria-label="關閉"><X /></button>
            <div className="profile-bear" aria-hidden="true">
              <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="profile-bear-img" />
            </div>
            <h2>我的親子小檔案</h2>
            <p>你的收藏與偏好會保存在這支手機裡。</p>
            {personalityProfile && (
              <div className="profile-persona">
                <span className="profile-persona-emoji">{personalityProfile.emoji}</span>
                <div>
                  <strong>{personalityProfile.label}</strong>
                  <span>{personalityProfile.desc}</span>
                </div>
              </div>
            )}
            <div className="profile-stats">
              <div><strong>{favorites.length}</strong><span>收藏景點</span></div>
              <div><strong>{clickHistory.length}</strong><span>探索紀錄</span></div>
              <div><strong>{age === 'all' ? '全部' : age}</strong><span>孩子年齡</span></div>
            </div>
            <button className="profile-action" onClick={() => { setShowProfile(false); openExplore('favorites') }}>
              <Heart size={18} />查看我的收藏
            </button>
            <button className="profile-action secondary" onClick={() => { setShowProfile(false); setShowFilters(true); openExplore('explore') }}>
              <SlidersHorizontal size={18} />調整家庭偏好
            </button>
          </aside>
        </div>
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
                  <p>{aiInsights[selected.id].summary}</p>
                  <div className="ai-badges">
                    <span>雨天：{aiInsights[selected.id].rainyDay}</span>
                    <span>推車：{aiInsights[selected.id].stroller}</span>
                  </div>
                  <ul>
                    {aiInsights[selected.id].whyForKids.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                  {aiInsights[selected.id].tips.length > 0 && (
                    <div className="ai-tip">行前提醒：{aiInsights[selected.id].tips.join('；')}</div>
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
                        const openDataConfirmed = selected.familyAmenities?.evidence?.some(
                          (item) => item.amenities.includes(key as FamilyAmenityKey),
                        )
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
                  <div className="report-form">
                    <div className="report-choice">
                      <button className={reportLiked ? 'active' : ''} onClick={() => setReportLiked(true)}><ThumbsUp size={13} /> 孩子喜歡</button>
                      <button className={!reportLiked ? 'active' : ''} onClick={() => setReportLiked(false)}><ThumbsDown size={13} /> 體驗普通</button>
                    </div>
                    <strong>這次有看到哪些設施？</strong>
                    <div className="report-amenities">
                      {[
                        ['nursingRoom', '育嬰室'],
                        ['diaperTable', '尿布台'],
                        ['familyRestroom', '親子廁所'],
                        ['accessibility', '無障礙'],
                        ['parking', '停車'],
                        ['strollerFriendly', '推車友善'],
                      ].map(([key, label]) => (
                        <label key={key}>
                          <input
                            type="checkbox"
                            checked={reportAmenities[key as FamilyAmenityKey] === true}
                            onChange={(event) => setReportAmenities((current) => ({
                              ...current,
                              [key]: event.target.checked,
                            }))}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <textarea
                      value={reportNote}
                      onChange={(event) => setReportNote(event.target.value)}
                      placeholder="例如：週六下午人很多、推車可走、停車等了 20 分鐘…"
                      maxLength={240}
                    />
                    <div className="report-actions">
                      <button onClick={() => setShowReportForm(false)}>取消</button>
                      <button className="primary" onClick={saveReport}>{supabase ? '儲存並同步' : '儲存在這支手機'}</button>
                    </div>
                    <small>{supabase ? '回報將同步至雲端，可跨裝置查看。' : '目前回報只保存在此裝置，不會公開上傳。'}</small>
                  </div>
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
