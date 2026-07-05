import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  Baby,
  Car,
  ChevronRight,
  CloudRain,
  Coffee,
  Heart,
  LifeBuoy,
  MapPin,
  ShieldCheck,
  Sparkles,
  SunMedium,
  TreePine,
  Umbrella,
} from 'lucide-react'
import type { HealthAdvisory, Place, WeatherSummary } from '../data'
import { Mascot } from './Mascot'
import { PlaceImage } from './PlaceCard'
import type { CdcStatus } from './QMomHealthAdvisory'

const WeekendInteractionHub = lazy(() =>
  import('./WeekendInteractionHub').then((module) => ({ default: module.WeekendInteractionHub })),
)
const QMomHealthAdvisory = lazy(() =>
  import('./QMomHealthAdvisory').then((module) => ({ default: module.QMomHealthAdvisory })),
)

type ScenarioKey = 'rainy' | 'energy' | 'stroller' | 'parents'

type Props = {
  places: Place[]
  weather: WeatherSummary | null
  userLocation: { lat: number; lng: number } | null
  favorites: string[]
  healthAdvisories: HealthAdvisory[]
  healthCdcStatus?: CdcStatus | null
  healthAdvisoryGeneratedAt?: string | null
  selectedAge?: string
  onOpenPlace: (place: Place) => void
  onFavorite: (id: string) => void
  onScenario: (scenario: ScenarioKey) => void
  onExplore: () => void
  onNearby: () => void
  onRescue: () => void
}

const scenarioCopy: Record<ScenarioKey, { label: string; icon: typeof Umbrella; hint: string; mascot: 'head' | 'qBao' | 'qMom' }> = {
  rainy: { label: '雨天也安心', icon: Umbrella, hint: '室內、餐飲、停車優先', mascot: 'qMom' },
  energy: { label: '孩子要放電', icon: TreePine, hint: '戶外空間與半日行程', mascot: 'qBao' },
  stroller: { label: '推車友善', icon: Baby, hint: '少樓梯、補給方便', mascot: 'qMom' },
  parents: { label: '爸媽想喘口氣', icon: Coffee, hint: '咖啡、商場、餐廳備案', mascot: 'head' },
}

const HOME_DEFER_MS = 650

function amenityScore(place: Place) {
  const amenities = place.familyAmenities
  if (!amenities) return 42
  const keys = ['parking', 'strollerFriendly', 'nursingRoom', 'diaperTable'] as const
  const confirmed = keys.filter((key) => amenities[key] === 'confirmed').length
  return Math.max(38, Math.round((confirmed / keys.length) * 100))
}

function rainyScore(place: Place) {
  if (place.rainyDay) return 92
  if (String(place.setting).includes('室內')) return 78
  return 48
}

function parentEaseScore(place: Place) {
  const amenities = place.familyAmenities
  let score = 48
  if (amenities?.parking === 'confirmed') score += 18
  if (amenities?.strollerFriendly === 'confirmed') score += 14
  if (place.placeType === '餐飲') score += 14
  if (place.priceLabel?.includes('免費')) score += 6
  return Math.min(score, 96)
}

function reasonFor(place: Place, weather: WeatherSummary | null) {
  if (weather && weather.precipitationProbability >= 45 && place.rainyDay) {
    return 'Q胖覺得今天雨勢不穩，這裡比較適合作為不狼狽的親子備案。'
  }
  if (place.familyAmenities?.parking === 'confirmed') {
    return 'Q媽加分：停車資訊較明確，臨時出門比較不用賭運氣。'
  }
  if (place.ageMin <= 2) {
    return 'Q寶視角：年齡門檻友善，小小孩也比較容易跟上節奏。'
  }
  return '適合想要半日出門、不要把爸媽體力一次燒光的家庭。'
}

export function TodayInspiration({
  places,
  weather,
  userLocation,
  favorites,
  healthAdvisories,
  healthCdcStatus,
  healthAdvisoryGeneratedAt,
  selectedAge = 'all',
  onOpenPlace,
  onFavorite,
  onScenario,
  onExplore,
  onNearby,
  onRescue,
}: Props) {
  const heroPlaces = places.slice(0, 3)
  const primaryPlace = heroPlaces[0]
  const [showDeferredSections, setShowDeferredSections] = useState(false)
  const isRainy = Boolean(weather && (weather.precipitationProbability >= 45 || weather.weatherCode >= 51))
  const weatherText = weather
    ? `${weather.label}・${Math.round(weather.temperature)}°C・近1小時降雨 ${weather.precipitationProbability}%`
    : userLocation
      ? '正在整理你附近適合親子的選擇'
      : '開啟定位後，會依距離與天氣推薦'
  const heroTitle = useMemo(
    () => isRainy
      ? ['雨天出門，', '也能', '不狼狽。']
      : ['今天去哪玩，', '讓 Q胖', '先幫你想好。'],
    [isRainy],
  )

  useEffect(() => {
    let cancelled = false
    const reveal = () => {
      if (!cancelled) setShowDeferredSections(true)
    }

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(reveal, { timeout: 1300 })
      return () => {
        cancelled = true
        window.cancelIdleCallback(idleId)
      }
    }

    const timeoutId = setTimeout(reveal, HOME_DEFER_MS)
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [])

  return (
    <div className="phase-preview">
      <section className="phase-hero">
        <div className="phase-hero-glow" aria-hidden="true" />
        <div className="phase-hero-copy">
          <span className="phase-kicker"><Sparkles size={15} /> 親子假日靈感入口</span>
          <h1>
            {heroTitle.map((line) => <span key={line}>{line}</span>)}
          </h1>
          <p>
            依照孩子年齡、天氣、距離、停車與臨時補給，快速整理適合今天出門的景點、
            餐廳與雨天備案。
          </p>
          <div className="phase-weather-pill">
            {isRainy ? <CloudRain size={18} /> : <SunMedium size={18} />}
            <span>{weatherText}</span>
          </div>
          <div className="phase-hero-actions">
            <button onClick={onExplore}>
              開始探索 <ChevronRight size={16} />
            </button>
            <button className="phase-secondary-action" onClick={onNearby}>
              附近景點 <MapPin size={16} />
            </button>
            <button className="phase-secondary-action" onClick={onRescue}>
              親子救援 <LifeBuoy size={16} />
            </button>
          </div>
        </div>
        <div className="phase-hero-card" onClick={() => primaryPlace && onOpenPlace(primaryPlace)}>
          <span className="phase-hero-sticker" aria-hidden="true">
            <Mascot variant="head" className="phase-hero-sticker-img" loading="eager" />
            <span>Q胖選</span>
          </span>
          {primaryPlace ? (
            <>
              <PlaceImage place={primaryPlace} className="phase-hero-photo" eager />
              <div className="phase-hero-place">
                <span>Q胖今天首選</span>
                <strong>{primaryPlace.name}</strong>
                <small>{reasonFor(primaryPlace, weather)}</small>
              </div>
            </>
          ) : (
            <div className="phase-hero-place phase-hero-place--empty">
              <span>資料載入中</span>
              <strong>正在替你整理週末靈感</strong>
            </div>
          )}
        </div>
      </section>

      <section className="phase-scenarios" aria-label="親子情境快速選擇">
        {(Object.entries(scenarioCopy) as [ScenarioKey, typeof scenarioCopy[ScenarioKey]][]).map(([key, item]) => {
          const Icon = item.icon
          return (
            <button key={key} onClick={() => onScenario(key)}>
              <span className="phase-scenario-mascot" aria-hidden="true">
                <Mascot variant={item.mascot} loading="eager" />
              </span>
              <Icon size={21} />
              <span>{item.label}</span>
              <small>{item.hint}</small>
            </button>
          )
        })}
      </section>

      {showDeferredSections ? (
        <Suspense fallback={<HomeDeferredSkeleton />}>
          <WeekendInteractionHub
            places={places}
            placesReady={places.length > 0}
            userLocation={userLocation}
            favorites={favorites}
            onFavorite={onFavorite}
            onOpenPlace={onOpenPlace}
          />

          <section className="phase-section">
            <div className="phase-section-head">
              <span><ShieldCheck size={16} /> 親子安心雷達</span>
              <h2>先看距離、雨天、推車與停車，再決定要不要出門。</h2>
              <div className="phase-family-cues" aria-label="Q胖家族提醒">
                <span><Mascot variant="head" /> Q胖看距離</span>
                <span><Mascot variant="qBao" /> Q寶看孩子</span>
                <span><Mascot variant="qMom" /> Q媽看安心</span>
              </div>
            </div>
            <div className="phase-plan-grid">
              {heroPlaces.map((place, index) => {
                const liked = favorites.includes(place.id)
                return (
                  <article key={place.id} className="phase-plan-card" onClick={() => onOpenPlace(place)}>
                    <div className="phase-plan-image">
                      <PlaceImage place={place} className="phase-plan-photo" />
                      <button
                        className={`phase-heart ${liked ? 'is-favorite' : ''}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          onFavorite(place.id)
                        }}
                        aria-label={liked ? '取消收藏' : '加入收藏'}
                      >
                        <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                    <div className="phase-plan-copy">
                      <span className="phase-plan-label">{index === 0 ? '最省心' : index === 1 ? '雨天備案' : '孩子放電'}</span>
                      <h3>{place.name}</h3>
                      <p>{reasonFor(place, weather)}</p>
                      <div className="phase-plan-meta">
                        <span><MapPin size={12} />{place.city}</span>
                        <span>{place.duration}</span>
                        <span>{place.ageMin}–{place.ageMax} 歲</span>
                      </div>
                      <div className="phase-radar">
                        <div>
                          <span><Car size={12} />爸媽省力度</span>
                          <i style={{ '--score': `${parentEaseScore(place)}%` } as CSSProperties} />
                        </div>
                        <div>
                          <span><Umbrella size={12} />雨天安全感</span>
                          <i style={{ '--score': `${rainyScore(place)}%` } as CSSProperties} />
                        </div>
                        <div>
                          <span><Baby size={12} />親子設施感</span>
                          <i style={{ '--score': `${amenityScore(place)}%` } as CSSProperties} />
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          {healthAdvisories.length > 0 && (
            <section className="phase-health-note" aria-label="行前安心小提醒">
              <QMomHealthAdvisory
                advisories={healthAdvisories}
                compact
                mode="inline"
                cdcStatus={healthCdcStatus}
                generatedAt={healthAdvisoryGeneratedAt}
                selectedAge={selectedAge}
              />
            </section>
          )}

          <section className="phase-memory-card">
            <Mascot variant="family" className="phase-memory-mascot" />
            <div>
              <span>越用越懂你的家庭</span>
              <h2>收藏越多，Q胖越知道你家適合什麼樣的假日。</h2>
              <p>
                偏好雨天備案、推車友善、爸媽能休息，或臨時補給方便的地方，都會逐步變成更貼近你家的推薦線索。
              </p>
            </div>
          </section>
        </Suspense>
      ) : (
        <HomeDeferredSkeleton />
      )}
    </div>
  )
}

function HomeDeferredSkeleton() {
  return (
    <section className="home-deferred-skeleton" aria-label="正在載入更多親子推薦">
      <div>
        <span />
        <strong>正在替你整理更多週末靈感</strong>
        <p>先滑上方情境或直接開始探索，下方清單會稍後補上。</p>
      </div>
    </section>
  )
}
