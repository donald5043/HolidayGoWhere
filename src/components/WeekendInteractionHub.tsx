import { useEffect, useMemo, useState } from 'react'
import {
  Baby,
  CalendarDays,
  Car,
  ChevronRight,
  Clock3,
  Heart,
  MapPin,
  Navigation,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Umbrella,
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
type StartPeriod = 'morning' | 'afternoon'
type PlanPace = 'easy' | 'full'

type PlanStep = {
  place: Place
  arrive: number
  leave: number
  stay: number
  travel: number
  distance: number | null
  reason: string
  tips: string[]
  badges: string[]
}

type HalfDayPlan = {
  steps: PlanStep[]
  startAt: number
  endAt: number
  totalMinutes: number
  totalTravelMinutes: number
  totalDistanceKm: number | null
  routeLabel: string
  routeNote: string
}

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

function estimateTravel(distanceKm: number, isFirstStop: boolean) {
  if (distanceKm <= 0.4) return isFirstStop ? 0 : 8
  return Math.max(isFirstStop ? 8 : 10, Math.round((distanceKm / 28) * 60 + 6))
}

function stayMinutes(place: Place, pace: PlanPace) {
  if (place.placeType === '餐飲' || place.restaurantCategory) return pace === 'full' ? 75 : 60
  if (place.duration === '晚上') return pace === 'full' ? 95 : 80
  if (place.duration === '一日') return pace === 'full' ? 125 : 105
  if (place.duration === '半日') return pace === 'full' ? 110 : 95
  if (place.setting === '室內外') return pace === 'full' ? 105 : 90
  if (place.setting === '室外') return pace === 'full' ? 100 : 85
  return pace === 'full' ? 95 : 85
}

function formatTime(minutes: number) {
  const hour = Math.floor(minutes / 60) % 24
  const minute = minutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} 分`
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return minute ? `${hour} 小時 ${minute} 分` : `${hour} 小時`
}

function formatKm(distance: number | null) {
  if (distance === null) return '依實際路線'
  if (distance < 1) return `${Math.round(distance * 1000)} m`
  return `${distance.toFixed(1)} km`
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

function getPlanBadges(place: Place) {
  const badges: string[] = []
  if (place.rainyDay) badges.push('雨天備案')
  if (place.familyAmenities?.strollerFriendly === 'confirmed') badges.push('推車友善')
  if (place.familyAmenities?.parking === 'confirmed') badges.push('停車線索')
  if (place.familyAmenities?.nursingRoom === 'confirmed' || place.familyAmenities?.diaperTable === 'confirmed') badges.push('育兒設施')
  if (place.placeType === '餐飲') badges.push('爸媽休息')
  if (!badges.length) badges.push(place.setting)
  return badges.slice(0, 3)
}

function getPlanReason(place: Place) {
  if (place.placeType === '餐飲') return '安排在行程中段，讓大人小孩都有補給與休息時間。'
  if (place.rainyDay) return '天氣不穩時也比較好保留，不用臨時大改行程。'
  if (place.familyAmenities?.strollerFriendly === 'confirmed') return '推車友善線索較明確，適合排在孩子體力還沒掉太多的時段。'
  if (place.familyAmenities?.parking === 'confirmed') return '停車資訊相對完整，開車家庭比較好掌握。'
  if (place.setting === '室外') return '適合放電與散步，建議避開正中午日曬。'
  return '資訊完整度較高，適合作為半日行程的穩定節點。'
}

function getParentTips(place: Place, index: number) {
  const tips: string[] = []
  if (index === 0) tips.push('第一站建議先排孩子最期待的點，精神最好、也比較不容易失控。')
  if (place.duration === '一日') tips.push('這個點原本偏一日型，半日行程只建議抓重點玩，不要貪多。')
  if (place.hours.includes('請至官方網站確認')) tips.push('開放時間仍需出發前再確認一次。')
  if (place.rainyDay) tips.push('下雨時可優先保留這站，其他室外點可視天氣縮短。')
  if (place.familyAmenities?.parking === 'confirmed') tips.push('有停車線索；假日仍建議提早到或先查停車場。')
  if (place.familyAmenities?.nursingRoom === 'confirmed' || place.familyAmenities?.diaperTable === 'confirmed') tips.push('有育兒設施線索，適合安排換尿布或餵奶緩衝。')
  if (place.familyAmenities?.strollerFriendly !== 'confirmed' && place.ageMin <= 2) tips.push('推車友善尚未完全確認，嬰幼兒家庭建議先看官方資訊。')
  return tips.slice(0, 3)
}

function chooseRoute(candidates: Place[], userLocation: UserLocation | null, pace: PlanPace) {
  const maxStops = pace === 'full' ? 3 : 2
  const maxPlanMinutes = pace === 'full' ? 300 : 240
  const orderedPool = [...candidates].sort((first, second) => scoreCandidate(second, userLocation) - scoreCandidate(first, userLocation))
  const selected: Place[] = []
  const remaining = [...orderedPool]
  let anchor: UserLocation | null = userLocation
  let projectedMinutes = 0

  while (remaining.length && selected.length < maxStops) {
    const ranked = remaining
      .map((place, index) => {
        const distance = anchor ? distanceInKm(anchor, place) : 0
        return {
          index,
          place,
          distance,
          travel: anchor ? estimateTravel(distance, selected.length === 0) : selected.length === 0 ? 0 : 18,
          score: scoreCandidate(place, userLocation),
        }
      })
      .sort((first, second) => {
        if (anchor) return first.distance - second.distance || second.score - first.score
        return second.score - first.score
      })

    const next = ranked.find((item) => {
      if (selected.length === 0) return true
      const nextMinutes = projectedMinutes + item.travel + stayMinutes(item.place, pace)
      return nextMinutes <= maxPlanMinutes
    }) || ranked[0]

    if (selected.length >= 2 && projectedMinutes + next.travel + stayMinutes(next.place, pace) > maxPlanMinutes) break

    const [place] = remaining.splice(next.index, 1)
    selected.push(place)
    projectedMinutes += next.travel + stayMinutes(place, pace)
    anchor = place
  }

  return selected
}

function buildHalfDayPlan(
  candidates: Place[],
  userLocation: UserLocation | null,
  startPeriod: StartPeriod,
  pace: PlanPace,
): HalfDayPlan | null {
  if (candidates.length < 2) return null

  const startAt = startPeriod === 'morning' ? 9 * 60 + 30 : 14 * 60
  const selected = chooseRoute(candidates, userLocation, pace)
  let cursor = startAt
  let previous: UserLocation | null = userLocation
  let totalTravelMinutes = 0
  let totalDistanceKm = 0
  let hasDistance = Boolean(userLocation)

  const steps = selected.map((place, index) => {
    const distance = previous ? distanceInKm(previous, place) : null
    const travel = distance === null ? index === 0 ? 0 : 18 : estimateTravel(distance, index === 0)
    const stay = Math.min(stayMinutes(place, pace), index === selected.length - 1 ? 110 : 125)
    cursor += travel
    const arrive = cursor
    const leave = arrive + stay
    cursor = leave
    previous = place
    totalTravelMinutes += travel
    if (distance !== null) totalDistanceKm += distance
    if (distance === null && index > 0) hasDistance = false

    return {
      place,
      arrive,
      leave,
      stay,
      travel,
      distance,
      reason: getPlanReason(place),
      tips: getParentTips(place, index),
      badges: getPlanBadges(place),
    }
  })

  const totalMinutes = Math.max(0, cursor - startAt)
  const routeLabel = totalMinutes > 310 || totalTravelMinutes > 80
    ? '不建議硬排半日'
    : totalTravelMinutes <= 35
      ? '移動輕鬆'
      : totalTravelMinutes <= 65
        ? '節奏剛好'
        : '移動偏多'
  const routeNote = totalMinutes > 310 || totalTravelMinutes > 80
    ? '候選點距離或停留時間偏長，建議刪掉一站、改選附近地點，或直接升級成整日行程。'
    : totalTravelMinutes <= 35
      ? '路線相對集中，適合帶幼兒或推車慢慢走。'
      : totalTravelMinutes <= 65
        ? '移動時間可接受，建議每站預留 10 分鐘彈性。'
        : '點位稍微分散，若孩子年紀小，建議把其中一站改成附近餐飲或短暫休息點。'

  return {
    steps,
    startAt,
    endAt: cursor,
    totalMinutes,
    totalTravelMinutes,
    totalDistanceKm: hasDistance ? totalDistanceKm : null,
    routeLabel,
    routeNote,
  }
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
  const [startPeriod, setStartPeriod] = useState<StartPeriod>('morning')
  const [pace, setPace] = useState<PlanPace>('easy')

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
  const halfDayPlan = buildHalfDayPlan(candidates, userLocation, startPeriod, pace)

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
    <section className="weekend-hub" aria-label="週末行程小幫手">
      <div className="weekend-hub-head">
        <span><Sparkles size={16} /> 週末行程小幫手</span>
        <h2>先挑想去的地方，再讓 Q胖整理成可出門的半日行程。</h2>
        <p>不用一開始就規劃路線。先把喜歡的景點放進清單，Q胖會依照距離、停留時間與親子友善線索，整理成比較不趕的小旅行安排。</p>
      </div>

      <div className="weekend-hub-grid">
        <div className="weekend-swipe-panel">
          <div className="weekend-panel-head">
            <div>
              <strong>挑選想去的地方</strong>
              <small>{likedIds.length ? `已加入 ${likedIds.length} 個靈感` : '看到喜歡的地點就先收進清單'}</small>
            </div>
            <button onClick={resetAll} aria-label="清空並重新挑選">
              <RotateCcw size={15} />
            </button>
          </div>

          {!placesReady ? (
            <div className="weekend-empty-card">正在載入適合週末的地點...</div>
          ) : isDone ? (
            <div className="weekend-empty-card">
              <strong>這輪地點都看完了</strong>
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
                  <X size={20} /> 先略過
                </button>
                <button className="weekend-like" onClick={() => topThree[0] && setEjecting({ id: topThree[0].id, direction: 'like' })}>
                  <Heart size={20} /> 加入想去
                </button>
              </div>
            </>
          )}
        </div>

        <div className="weekend-candidates-panel">
          <div className="weekend-panel-head">
            <div>
              <strong>想去清單</strong>
              <small>{candidates.length ? `${candidates.length} 個地點可安排` : '至少加入 2 個地點，才能整理成路線'}</small>
            </div>
            <button
              className="weekend-plan-button"
              disabled={candidates.length < 2}
              onClick={() => setShowPlan(true)}
            >
              <Wand2 size={15} /> 整理半日行程
            </button>
          </div>

          {candidates.length ? (
            <>
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
                      <button onClick={() => removeCandidate(place.id)} aria-label="移除想去地點">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <div className="weekend-plan-controls" aria-label="行程偏好">
                <div>
                  <span>出發時段</span>
                  <div className="weekend-segment">
                    <button className={startPeriod === 'morning' ? 'is-active' : ''} onClick={() => { setStartPeriod('morning'); setShowPlan(false) }}>上午</button>
                    <button className={startPeriod === 'afternoon' ? 'is-active' : ''} onClick={() => { setStartPeriod('afternoon'); setShowPlan(false) }}>下午</button>
                  </div>
                </div>
                <div>
                  <span>行程節奏</span>
                  <div className="weekend-segment">
                    <button className={pace === 'easy' ? 'is-active' : ''} onClick={() => { setPace('easy'); setShowPlan(false) }}>輕鬆</button>
                    <button className={pace === 'full' ? 'is-active' : ''} onClick={() => { setPace('full'); setShowPlan(false) }}>充實</button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="weekend-candidate-empty">
              <CalendarDays size={30} />
              <strong>還沒有想去清單</strong>
              <p>先挑幾個有興趣的地方，Q胖會幫你整理成比較順路的半日安排。</p>
            </div>
          )}

          {showPlan && halfDayPlan && halfDayPlan.steps.length >= 2 && (
            <div className="weekend-plan">
              <div className="weekend-plan-title">
                <Clock3 size={15} />
                <strong>{halfDayPlan.routeLabel === '不建議硬排半日' ? '這組不適合半日硬排' : '半日行程建議'}</strong>
                <span>{formatTime(halfDayPlan.startAt)} 出發・{formatTime(halfDayPlan.endAt)} 左右結束</span>
              </div>

              <div className="weekend-plan-summary">
                <span><Clock3 size={14} /> 全程約 {formatMinutes(halfDayPlan.totalMinutes)}</span>
                <span><Navigation size={14} /> 移動約 {formatMinutes(halfDayPlan.totalTravelMinutes)}</span>
                <span><MapPin size={14} /> 距離 {formatKm(halfDayPlan.totalDistanceKm)}</span>
              </div>

              <div className="weekend-route-note">
                <ShieldCheck size={16} />
                <div>
                  <strong>{halfDayPlan.routeLabel}</strong>
                  <p>{halfDayPlan.routeNote}</p>
                </div>
              </div>

              <ol>
                {halfDayPlan.steps.map(({ place, arrive, leave, stay, travel, distance, reason, tips, badges }, index) => (
                  <li key={place.id}>
                    {index > 0 && (
                      <span className="weekend-travel"><Navigation size={11} />移動約 {travel} 分・{formatKm(distance)}</span>
                    )}
                    <button onClick={() => onOpenPlace(place)}>
                      <time>{formatTime(arrive)}</time>
                      <span>
                        <strong>{place.name}</strong>
                        <small>停留 {formatMinutes(stay)}・{formatTime(leave)} 離開</small>
                      </span>
                      <ChevronRight size={15} />
                    </button>
                    <div className="weekend-plan-detail">
                      <div className="weekend-plan-badges">
                        {badges.map((badge) => (
                          <span key={badge}>
                            {badge.includes('雨') && <Umbrella size={12} />}
                            {badge.includes('車') && <Car size={12} />}
                            {badge.includes('育') && <Baby size={12} />}
                            {badge}
                          </span>
                        ))}
                      </div>
                      <p>{reason}</p>
                      {tips.length > 0 && (
                        <ul>
                          {tips.map((tip) => <li key={tip}>{tip}</li>)}
                        </ul>
                      )}
                    </div>
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
