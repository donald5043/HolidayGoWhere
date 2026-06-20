import { useEffect, useMemo, useState } from 'react'
import {
  Baby,
  Bookmark,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CloudRain,
  Compass,
  Database,
  Bot,
  ExternalLink,
  Heart,
  Home,
  Instagram,
  LocateFixed,
  MapPin,
  Menu,
  Navigation,
  NotebookPen,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  SunMedium,
  TentTree,
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
import { MapView } from './MapView'

const regions = ['全部', '北部', '中部', '南部', '東部', '離島'] as const
const settings = ['全部', '室內', '室外', '室內外'] as const
const durations = ['全部', '半日', '一日', '晚上'] as const
const MAX_VISIBLE_PLACES = 120
const MAX_MAP_PLACES = 50
const FALLBACK_IMAGE = `${import.meta.env.BASE_URL}place-fallback.svg`
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
    () => [...new Set([place.image, ...(place.imageCandidates || []), FALLBACK_IMAGE].filter(Boolean))],
    [place.image, place.imageCandidates],
  )
  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setIndex(0)
    setLoaded(false)
  }, [place.id])

  useEffect(() => {
    if (loaded || candidates[index] === FALLBACK_IMAGE) return
    const timeout = window.setTimeout(
      () => {
        setLoaded(false)
        setIndex((current) => Math.min(current + 1, candidates.length - 1))
      },
      3500,
    )
    return () => window.clearTimeout(timeout)
  }, [candidates, index, loaded])

  return (
    <img
      src={candidates[index]}
      alt={`${place.name}照片`}
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={(event) => {
        if (event.currentTarget.naturalWidth < 80 || event.currentTarget.naturalHeight < 80) {
          setLoaded(false)
          setIndex((current) => Math.min(current + 1, candidates.length - 1))
          return
        }
        setLoaded(true)
      }}
      onError={() => {
        setLoaded(false)
        setIndex((current) => Math.min(current + 1, candidates.length - 1))
      }}
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
      <div className="place-image-wrap" style={{ backgroundImage: `url(${FALLBACK_IMAGE})` }}>
        <PlaceImage place={place} className="place-image" />
        <span className="price-tag">{place.priceLabel}</span>
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
        <div className="eyebrow">
          <span>{place.category}</span>
          <span>・</span>
          <span>{place.setting}</span>
        </div>
        <h3>{place.name}</h3>
        <div className="decision-badges">
          {place.weekendEvent && <span className="event-badge"><CalendarDays size={12} />本週末</span>}
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
        <div className="tag-row">
          <span><Baby size={13} />{place.ageMin}–{place.ageMax} 歲</span>
          <span><Clock3 size={13} />{place.duration}</span>
          {distance !== undefined && (
            <span className="distance-tag"><LocateFixed size={13} />距離約 {distance < 10 ? distance.toFixed(1) : Math.round(distance)} km</span>
          )}
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
  const [weather, setWeather] = useState<WeatherSummary | null>(null)
  const [weatherStatus, setWeatherStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [showFilters, setShowFilters] = useState(false)
  const [selected, setSelected] = useState<Place | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [locationMessage, setLocationMessage] = useState('')
  const [activeTab, setActiveTab] = useState<'home' | 'explore' | 'favorites' | 'profile'>('home')
  const [showProfile, setShowProfile] = useState(false)
  const [showReportForm, setShowReportForm] = useState(false)
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

  const selectRegion = async (nextRegion: (typeof regions)[number]) => {
    setRegion(nextRegion)
    const cached = placeCache[nextRegion]
    if (cached) {
      setPlaces(cached)
      setPlacesStatus('ready')
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
    } catch {
      setPlacesStatus('error')
    }
  }

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
      const ageMatches = place.ageMin <= maxAge && place.ageMax >= minAge
      return (
        textMatches &&
        ageMatches &&
        (!rainyOnly || place.rainyDay === true) &&
        (!eventOnly || place.placeType === '活動') &&
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
    if (!userLocation) return sorted
    return sorted.sort((first, second) => {
      if (rainyOnly && first.placeType !== second.placeType) {
        return Number(second.placeType === '餐飲') - Number(first.placeType === '餐飲')
      }
      return distanceInKm(userLocation, first) - distanceInKm(userLocation, second)
    })
  }, [places, query, age, setting, duration, rainyOnly, eventOnly, weather, userLocation])
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
    () => displayedPlaces.slice(0, MAX_MAP_PLACES),
    [displayedPlaces],
  )

  const toggleFavorite = (id: string) => {
    setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  const clearFilters = () => {
    void selectRegion('全部')
    setAge('all')
    setSetting('全部')
    setDuration('全部')
    setRainyOnly(false)
    setEventOnly(false)
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
    setActiveTab(tab)
    setShowProfile(false)
    window.setTimeout(
      () => document.querySelector('.explore-section')?.scrollIntoView({ behavior: 'smooth' }),
      0,
    )
  }

  const openHome = () => {
    setActiveTab('home')
    setShowProfile(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openProfile = () => {
    setActiveTab('profile')
    setShowProfile(true)
  }

  const saveReport = () => {
    if (!selected) return
    const now = new Date().toISOString()
    setReports((current) => ({
      ...current,
      [selected.id]: {
        visitedAt: current[selected.id]?.visitedAt || now,
        liked: reportLiked,
        note: reportNote.trim(),
        amenities: reportAmenities,
        updatedAt: now,
      },
    }))
    setShowReportForm(false)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="假日去哪兒首頁">
          <span className="brand-mark">🐻</span>
          <span><strong>假日去哪兒</strong><small>和孩子一起發現好地方</small></span>
        </a>
        <div className="desktop-actions">
          <button className="ghost-button"><Bookmark size={18} />我的收藏</button>
          <button className="avatar-button">晴</button>
        </div>
        <button className="mobile-menu" aria-label="開啟選單"><Menu /></button>
      </header>

      <main>
        <section className="hero">
          <div className="hero-art hero-art-left">☁️</div>
          <div className="hero-art hero-art-right">🎈</div>
          <div className="hero-copy">
            <div className="hero-kicker"><Sparkles size={16} /> 今天想帶孩子去哪裡？</div>
            <h1>小小探險，<br /><span>大大回憶。</span></h1>
            <p>依孩子年齡、天氣與時間，找到全家都喜歡的好去處。</p>
          </div>
          <div className="search-panel">
            <label className="search-box">
              <Search size={20} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜尋景點、城市或想玩的活動"
              />
              {query && <button onClick={() => setQuery('')} aria-label="清除搜尋"><X size={17} /></button>}
            </label>
            <button className="filter-toggle" onClick={() => setShowFilters(!showFilters)}>
              <SlidersHorizontal size={18} />更多篩選
            </button>
          </div>
        </section>

        <section className="quick-filters" aria-label="快速篩選">
          <div className="filter-group region-tabs">
            {regions.map((item) => (
              <button key={item} className={region === item ? 'active' : ''} onClick={() => void selectRegion(item)}>
                {item}
              </button>
            ))}
          </div>
          <div className="filter-group age-tabs">
            {ageOptions.map((item) => (
              <button key={item.value} className={age === item.value ? 'active' : ''} onClick={() => setAge(item.value)}>
                <Baby size={15} />{item.label}
              </button>
            ))}
            <button className={rainyOnly ? 'active rainy-filter' : 'rainy-filter'} onClick={() => setRainyOnly((value) => !value)}>
              ☔ 雨天備案
            </button>
            <button className={eventOnly ? 'active event-filter' : 'event-filter'} onClick={() => setEventOnly((value) => !value)}>
              🎪 本週活動
            </button>
          </div>
        </section>

        {weather && (
          <section className="weather-recommendation">
            <CloudRain size={20} />
            <div>
              <strong>{weather.label}・{Math.round(weather.temperature)}°C</strong>
              <span>今日降雨機率 {weather.precipitationProbability}%・已依天氣優先排序</span>
            </div>
            {weather.precipitationProbability >= 45 && !rainyOnly && (
              <button onClick={() => setRainyOnly(true)}>只看雨備</button>
            )}
          </section>
        )}
        {weatherStatus === 'loading' && <div className="weather-loading">正在取得地區天氣…</div>}

        {showFilters && (
          <section className="advanced-filters">
            <div>
              <span className="filter-label"><SunMedium size={16} />空間類型</span>
              <div className="filter-pills">
                {settings.map((item) => <button key={item} className={setting === item ? 'active' : ''} onClick={() => setSetting(item)}>{item}</button>)}
              </div>
            </div>
            <div>
              <span className="filter-label"><Clock3 size={16} />可用時間</span>
              <div className="filter-pills">
                {durations.map((item) => <button key={item} className={duration === item ? 'active' : ''} onClick={() => setDuration(item)}>{item}</button>)}
              </div>
            </div>
            <button className="clear-button" onClick={clearFilters}>清除條件</button>
          </section>
        )}

        <section className="explore-section">
          <div className="section-heading">
            <div>
              <span className="section-kicker"><TentTree size={17} /> 為你精選</span>
              <h2>週末靈感地圖</h2>
              <p>
                {activeTab === 'favorites' ? '已收藏' : '找到'} <strong>{displayedPlaces.length}</strong> 個地點
                {displayedPlaces.length > MAX_VISIBLE_PLACES && `・先顯示前 ${MAX_VISIBLE_PLACES} 筆`}
                {region === '全部' && activeTab !== 'favorites' && '・選擇地區可查看完整景點'}
              </p>
            </div>
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
              />
              <div className="map-legend"><span /><span>點一下圖標查看景點</span></div>
            </div>
            <div className="results-panel">
              {placesStatus === 'loading' ? (
                <div className="empty-state loading-state">
                  <span>🗺️</span>
                  <h3>正在整理親子景點</h3>
                  <p>載入官方開放資料中，馬上就好。</p>
                </div>
              ) : placesStatus === 'error' ? (
                <div className="empty-state">
                  <span>🛠️</span>
                  <h3>景點資料暫時載入失敗</h3>
                  <p>請確認網路後重新整理頁面。</p>
                  <button onClick={() => window.location.reload()}>重新載入</button>
                </div>
              ) : visiblePlaces.length ? visiblePlaces.map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  onOpen={() => setSelected(place)}
                  favorite={favorites.includes(place.id)}
                  onFavorite={() => toggleFavorite(place.id)}
                  distance={userLocation ? distanceInKm(userLocation, place) : undefined}
                />
              )) : (
                <div className="empty-state">
                  <span>{activeTab === 'favorites' ? '💛' : '🧸'}</span>
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
      </main>

      <nav className="bottom-nav" aria-label="主要導覽">
        <button className={activeTab === 'home' ? 'active' : ''} onClick={openHome}><Home size={21} /><span>首頁</span></button>
        <button className={activeTab === 'explore' ? 'active' : ''} onClick={() => openExplore('explore')}><Compass size={21} /><span>探索</span></button>
        <button className={activeTab === 'favorites' ? 'active' : ''} onClick={() => openExplore('favorites')}><Heart size={21} /><span>收藏</span></button>
        <button className={activeTab === 'profile' ? 'active' : ''} onClick={openProfile}><Baby size={21} /><span>我的</span></button>
      </nav>

      {showProfile && (
        <div className="modal-backdrop profile-backdrop" onClick={() => setShowProfile(false)}>
          <aside className="profile-sheet" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowProfile(false)} aria-label="關閉"><X /></button>
            <div className="profile-bear">🐻</div>
            <h2>我的親子小檔案</h2>
            <p>你的收藏與偏好會保存在這支手機裡。</p>
            <div className="profile-stats">
              <div><strong>{favorites.length}</strong><span>收藏景點</span></div>
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
            <div className="detail-image" style={{ backgroundImage: `url(${FALLBACK_IMAGE})` }}>
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
                <div><Database /><span><small>資料來源</small>{selected.dataSource}</span></div>
              </div>
              <div className="detail-section">
                <h3>孩子會喜歡</h3>
                <div className="highlight-grid">
                  {selected.highlights.map((item) => <span key={item}>✨ {item}</span>)}
                </div>
              </div>
              <div className="detail-section">
                <h3>親子友善設施</h3>
                {selected.familyAmenities && (
                  <>
                    <div className="amenity-grid">
                      {[
                        ['accessibility', '♿', '無障礙設施／廁所', selected.familyAmenities.accessibility],
                        ['ramp', '↗️', '無障礙坡道', selected.familyAmenities.ramp],
                        ['nursingRoom', '🤱', '哺乳／育嬰室', selected.familyAmenities.nursingRoom],
                        ['diaperTable', '🧷', '尿布台', selected.familyAmenities.diaperTable],
                        ['familyRestroom', '🚻', '親子廁所', selected.familyAmenities.familyRestroom],
                        ['strollerFriendly', '🛒', '推車友善', selected.familyAmenities.strollerFriendly],
                        ['parking', '🅿️', '停車設施', selected.familyAmenities.parking],
                      ].map(([key, icon, label, status]) => {
                        const openDataConfirmed = selected.familyAmenities?.evidence?.some(
                          (item) => item.amenities.includes(key as FamilyAmenityKey),
                        )
                        return (
                          <div className={`amenity-item ${status}`} key={label}>
                            <span>{icon}</span>
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
                      <button className={reportLiked ? 'active' : ''} onClick={() => setReportLiked(true)}>👍 孩子喜歡</button>
                      <button className={!reportLiked ? 'active' : ''} onClick={() => setReportLiked(false)}>😐 體驗普通</button>
                    </div>
                    <strong>這次有看到哪些設施？</strong>
                    <div className="report-amenities">
                      {[
                        ['nursingRoom', '🤱 育嬰室'],
                        ['diaperTable', '🧷 尿布台'],
                        ['familyRestroom', '🚻 親子廁所'],
                        ['accessibility', '♿ 無障礙'],
                        ['parking', '🅿️ 停車'],
                        ['strollerFriendly', '🛒 推車友善'],
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
                      <button className="primary" onClick={saveReport}>儲存在這支手機</button>
                    </div>
                    <small>目前回報只保存在此裝置，不會公開上傳。</small>
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
