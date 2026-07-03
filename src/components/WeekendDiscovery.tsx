import { useState } from 'react'
import { Heart, PartyPopper, RotateCcw, X } from 'lucide-react'
import type { Place } from '../data'
import { bestImageSrc, FALLBACK_IMAGE } from '../imageUtils'
import { useDiscovery } from '../hooks/useDiscovery'
import { SwipeCard } from './SwipeCard'

type UserLocation = { lat: number; lng: number }

function haversineKm(from: UserLocation, to: UserLocation): number {
  const R = 6371
  const dLat = (to.lat - from.lat) * (Math.PI / 180)
  const dLng = (to.lng - from.lng) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(from.lat * (Math.PI / 180)) *
      Math.cos(to.lat * (Math.PI / 180)) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

type Props = {
  places: Place[]
  placesReady: boolean
  userLocation: UserLocation | null
  favorites: string[]
  onFavorite: (id: string) => void
  onOpenPlace: (place: Place) => void
}

export function WeekendDiscovery({ places, placesReady, userLocation, favorites, onFavorite, onOpenPlace }: Props) {
  const { queue, likedIds, isDone, like, dislike, reset } = useDiscovery(places, userLocation)
  const [ejecting, setEjecting] = useState<{ id: string; direction: 'like' | 'dislike' } | null>(null)

  const topThree = queue.slice(0, 3)

  const handleLike = (id: string) => {
    like(id)
    setEjecting(null)
    if (!favorites.includes(id)) onFavorite(id)
  }

  const handleDislike = (id: string) => {
    dislike(id)
    setEjecting(null)
  }

  const handleButtonLike = () => {
    if (!topThree[0]) return
    setEjecting({ id: topThree[0].id, direction: 'like' })
  }

  const handleButtonDislike = () => {
    if (!topThree[0]) return
    setEjecting({ id: topThree[0].id, direction: 'dislike' })
  }

  return (
    <div className="discovery-wrap">
      {/* Header */}
      <div className="discovery-header">
        <div>
          <h3 className="discovery-title">今天沒靈感？</h3>
          <p className="discovery-subtitle">滑幾張卡片，幫你找到這個週末的好去處</p>
        </div>
        {likedIds.length > 0 && (
          <button className="discovery-reset-icon" onClick={reset} aria-label="重新探索">
            <RotateCcw size={16} />
          </button>
        )}
      </div>

      {/* Content */}
      {!placesReady ? (
        <div className="discovery-loading">
          <div className="discovery-skeleton" />
        </div>
      ) : isDone ? (
        <div className="discovery-done">
          <span className="discovery-done-emoji"><PartyPopper size={30} /></span>
          <strong>今天的景點都看完了！</strong>
          <p>你已標記 <em>{likedIds.length}</em> 個想去的景點</p>
          <button className="discovery-reset-btn" onClick={reset}>
            <RotateCcw size={15} />重新探索
          </button>
        </div>
      ) : (
        <>
          {/* Card stack */}
          <div className="discovery-stack">
            {topThree.map((place, i) => (
              <SwipeCard
                key={place.id}
                place={place}
                stackIndex={i}
                imageSrc={bestImageSrc(place.image, place.imageCandidates)}
                distance={userLocation ? haversineKm(userLocation, place) : undefined}
                isFavorite={favorites.includes(place.id)}
                ejectDirection={ejecting?.id === place.id ? ejecting.direction : null}
                onLike={handleLike}
                onDislike={handleDislike}
                onOpen={onOpenPlace}
              />
            ))}
            {/* Placeholder card shown when only 1–2 cards remain */}
            {topThree.length === 0 && (
              <div className="swipe-card swipe-card-placeholder">
                <img src={FALLBACK_IMAGE} alt="" className="swipe-photo" />
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="discovery-actions">
            <button
              className="disc-btn disc-btn-skip"
              onClick={handleButtonDislike}
              aria-label="跳過"
            >
              <X size={22} />
            </button>
            <div className="disc-hints">
              <span>跳過</span>
              <span>收藏</span>
            </div>
            <button
              className="disc-btn disc-btn-like"
              onClick={handleButtonLike}
              aria-label="想去"
            >
              <Heart size={22} />
            </button>
          </div>

          {/* Liked count hint */}
          {likedIds.length >= 2 && (
            <p className="discovery-liked-hint">
              <Heart size={13} fill="currentColor" /> 已標記 {likedIds.length} 個想去的景點，已加入收藏
            </p>
          )}
        </>
      )}
    </div>
  )
}
