import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  ChevronRight,
  Clock3,
  Heart,
  MapPin,
  Navigation,
  RotateCcw,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react'
import type { Place } from '../data'
import { bestImageSrc, FALLBACK_IMAGE } from '../imageUtils'
import { getFamilyEvidence, getQualityScore } from '../placeQuality'
import { useDiscovery } from '../hooks/useDiscovery'
import { SwipeCard } from './SwipeCard'
import { PlaceImage } from './PlaceCard'

type UserLocation = { lat: number; lng: number }

const CANDIDATE_KEY = 'holiday-go-where:weekend-candidates'
const MAX_CANDIDATES = 12

function loadCandidateIds() {
  try {
    const value = JSON.parse(localStorage.getItem(CANDIDATE_KEY) || '[]')
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function distanceInKm(from: UserLocation, to: UserLocation): number {
  const earthRadius = 6371
  const toRad = (value: number) => value * (Math.PI / 180)
  const latDelta = toRad(to.lat - from.lat)
  const lngDelta = toRad(to.lng - from.lng)
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.sin(lngDelta / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function stayMinutes(place: Place) {
  if (place.duration === '半日') return 150
  if (place.duration === '一日') return 210
  return 90
}

function formatTime(minutes: number) {
  const hour = Math.floor(minutes / 60) % 24
  const minute = minutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function scoreCandidate(place: Place, userLocation: UserLocation | null) {
  let score = getQualityScore(place)
  if (place.rainyDay) score += 8
  if (place.familyAmenities?.parking === 'confirmed') score += 10
  if (place.familyAmenities?.strollerFriendly === 'confirmed') score += 8
  if (getFamilyEvidence(place).length) score += 8
  if (userLocation) score += Math.max(0, 38 - distanceInKm(userLocation, place) * 2.8)
  return score
}

function buildHalfDayPlan(candidates: Place[], userLocation: UserLocation | null) {
  const orderedPool = [...candidates].sort((first, second) => scoreCandidate(second, userLocation) - scoreCandidate(first, userLocation))
  if (!orderedPool.length) return []

  const selected: Place[] = []
  const remaining = [...orderedPool]
  let anchor: UserLocation | null = userLocation

  while (remaining.length && selected.length < 3) {
    let nextIndex = 0
    if (anchor) {
      nextIndex = remaining
        .map((place, index) => ({ place, index, distance: distanceInKm(anchor!, place) }))
        .sort((first, second) => first.distance - second.distance || scoreCandidate(second.place, userLocation) - scoreCandidate(first.place, userLocation))[0].index
    }
    const [next] = remaining.splice(nextIndex, 1)
    selected.push(next)
    anchor = next
  }

  const start = 9 * 60 + 30
  let cursor = start
  let previous: UserLocation | null = userLocation

  return selected.map((place, index) => {
    const travel = previous ? Math.max(index === 0 ? 0 : 10, Math.round((distanceInKm(previous, place) / 32) * 60)) : index === 0 ? 0 : 18
    cursor += travel
    const arrive = cursor
    const stay = Math.min(stayMinutes(place), index === selected.length - 1 ? 120 : 150)
    cursor += stay
    previous = place
    return { place, arrive, stay, travel }
  })
}

type Props = {
  places: Place[]
  placesReady: boolean
  userLocation: UserLocation | null
  favorites: string[]
  onFavorite: (id: string) => void
  onOpenPlace: (place: Place) => void
}

export function WeekendInteractionHub({
  places,
  placesReady,
  userLocation,
  favorites,
  onFavorite,
  onOpenPlace,
}: Props) {
  const { queue, likedIds, isDone, like, dislike, reset } = useDiscovery(places, userLocation)
  const [candidateIds, setCandidateIds] = useState<string[]>(loadCandidateIds)
  const [ejecting, setEjecting] = useState<{ id: string; direction: 'like' | 'dislike' } | null>(null)
  const [showPlan, setShowPlan] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(CANDIDATE_KEY, JSON.stringify(candidateIds))
    } catch {
      // localStorage may be unavailable in private mode.
    }
  }, [candidateIds])

  const placeMap = useMemo(() => new Map(places.map((place) => [place.id, place])), [places])
  const candidates = candidateIds.map((id) => placeMap.get(id)).filter((place): place is Place => Boolean(place))
  const topThree = queue.slice(0, 3)
  const halfDayPlan = buildHalfDayPlan(candidates, userLocation)

  const addCandidate = (id: string) => {
    setCandidateIds((current) => [id, ...current.filter((item) => item !== id)].slice(0, MAX_CANDIDATES))
    setShowPlan(false)
  }

  const removeCandidate = (id: string) => {
    setCandidateIds((current) => current.filter((item) => item !== id))
    setShowPlan(false)
  }

  const handleLike = (id: string) => {
    like(id)
    addCandidate(id)
    setEjecting(null)
  }

  const handleDislike = (id: string) => {
    dislike(id)
    setEjecting(null)
  }

  const resetAll = () => {
    reset()
    setCandidateIds([])
    setShowPlan(false)
  }

  return (
    <section className="weekend-hub" aria-label="週末互動靈感">
      <div className="weekend-hub-head">
        <span><Sparkles size={16} /> 第二階段互動感</span>
        <h2>滑幾張卡，Q胖幫你排出半日小旅行。</h2>
        <p>像挑照片一樣把想去的地方加入週末候選，累積 2 個以上就能一鍵整理成輕鬆不趕路的半日行程。</p>
      </div>

      <div className="weekend-hub-grid">
        <div className="weekend-swipe-panel">
          <div className="weekend-panel-head">
            <div>
              <strong>Swipe 靈感卡</strong>
              <small>{likedIds.length ? `已喜歡 ${likedIds.length} 個靈感` : '左右挑選今天的親子心情'}</small>
            </div>
            <button onClick={resetAll} aria-label="重置靈感與候選清單">
              <RotateCcw size={15} />
            </button>
          </div>

          {!placesReady ? (
            <div className="weekend-empty-card">正在載入週末靈感...</div>
          ) : isDone ? (
            <div className="weekend-empty-card">
              <strong>這輪靈感都看完了</strong>
              <button onClick={resetAll}>重新挑一次</button>
            </div>
          ) : (
            <>
              <div className="discovery-stack weekend-stack">
                {topThree.map((place, index) => (
                  <SwipeCard
                    key={place.id}
                    place={place}
                    stackIndex={index}
                    imageSrc={bestImageSrc(place.image, place.imageCandidates)}
                    distance={userLocation ? distanceInKm(userLocation, place) : undefined}
                    isFavorite={favorites.includes(place.id)}
                    ejectDirection={ejecting?.id === place.id ? ejecting.direction : null}
                    onLike={handleLike}
                    onDislike={handleDislike}
                    onOpen={onOpenPlace}
                  />
                ))}
                {topThree.length === 0 && (
                  <div className="swipe-card swipe-card-placeholder">
                    <img src={FALLBACK_IMAGE} alt="" className="swipe-photo" />
                  </div>
                )}
              </div>
              <div className="weekend-swipe-actions">
                <button className="weekend-skip" onClick={() => topThree[0] && setEjecting({ id: topThree[0].id, direction: 'dislike' })}>
                  <X size={20} /> 略過
                </button>
                <button className="weekend-like" onClick={() => topThree[0] && setEjecting({ id: topThree[0].id, direction: 'like' })}>
                  <Heart size={20} /> 加入候選
                </button>
              </div>
            </>
          )}
        </div>

        <div className="weekend-candidates-panel">
          <div className="weekend-panel-head">
            <div>
              <strong>週末候選清單</strong>
              <small>{candidates.length ? `${candidates.length} 個地點準備排程` : '先加入幾個想去的地方'}</small>
            </div>
            <button
              className="weekend-plan-button"
              disabled={candidates.length < 2}
              onClick={() => setShowPlan(true)}
            >
              <Wand2 size={15} /> 產生半日行程
            </button>
          </div>

          {candidates.length ? (
            <div className="weekend-candidate-list">
              {candidates.map((place) => (
                <article key={place.id} className="weekend-candidate-card">
                  <PlaceImage place={place} className="weekend-candidate-photo" />
                  <div onClick={() => onOpenPlace(place)}>
                    <strong>{place.name}</strong>
                    <span><MapPin size={11} />{place.city}・{place.duration}</span>
                    <small>{place.rainyDay ? '雨天友善' : place.setting}・{place.ageMin}–{place.ageMax} 歲</small>
                  </div>
                  <div className="weekend-candidate-actions">
                    <button
                      className={favorites.includes(place.id) ? 'is-favorite' : ''}
                      onClick={() => onFavorite(place.id)}
                      aria-label={favorites.includes(place.id) ? '移除收藏' : '加入收藏'}
                    >
                      <Heart size={15} fill={favorites.includes(place.id) ? 'currentColor' : 'none'} />
                    </button>
                    <button onClick={() => removeCandidate(place.id)} aria-label="移除候選">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="weekend-candidate-empty">
              <CalendarDays size={30} />
              <strong>還沒有週末候選</strong>
              <p>先滑幾張靈感卡，讓 Q胖幫你把想法收進小旅行清單。</p>
            </div>
          )}

          {showPlan && halfDayPlan.length >= 2 && (
            <div className="weekend-plan">
              <div className="weekend-plan-title">
                <Clock3 size={15} />
                <strong>Q胖的半日建議</strong>
                <span>{formatTime(halfDayPlan[0].arrive)} 開始比較剛好</span>
              </div>
              <ol>
                {halfDayPlan.map(({ place, arrive, stay, travel }, index) => (
                  <li key={place.id}>
                    {index > 0 && (
                      <span className="weekend-travel"><Navigation size={11} />移動約 {travel} 分</span>
                    )}
                    <button onClick={() => onOpenPlace(place)}>
                      <time>{formatTime(arrive)}</time>
                      <span>
                        <strong>{place.name}</strong>
                        <small>{Math.round(stay / 60 * 10) / 10} 小時・{place.city}</small>
                      </span>
                      <ChevronRight size={15} />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
