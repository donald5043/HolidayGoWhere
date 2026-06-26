import { useEffect, useRef, useState } from 'react'
import { Heart, X } from 'lucide-react'
import type { Place } from '../data'
import { FALLBACK_IMAGE } from '../imageUtils'

const SWIPE_THRESHOLD = 80
const TAP_MAX_MOVE = 8  // px — below this, treat pointer-up as a tap

type Props = {
  place: Place
  stackIndex: number
  imageSrc: string
  distance?: number
  isFavorite: boolean
  ejectDirection: 'like' | 'dislike' | null
  onLike: (id: string) => void
  onDislike: (id: string) => void
  onOpen: (place: Place) => void
}

export function SwipeCard({
  place,
  stackIndex,
  imageSrc,
  distance,
  isFavorite,
  ejectDirection,
  onLike,
  onDislike,
  onOpen,
}: Props) {
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [exitX, setExitX] = useState<number | null>(null)
  const [imgSrc, setImgSrc] = useState(imageSrc)
  const startX = useRef(0)
  const hasMoved = useRef(false)

  const isTop = stackIndex === 0
  const exiting = exitX !== null

  // Trigger animation from parent button click
  useEffect(() => {
    if (!isTop || !ejectDirection) return
    setExitX(ejectDirection === 'like' ? window.innerWidth + 150 : -window.innerWidth - 150)
  }, [ejectDirection, isTop])

  // Reset image if place changes
  useEffect(() => { setImgSrc(imageSrc) }, [imageSrc])

  const currentX = exiting ? exitX! : isTop ? dragX : 0
  const rotation = currentX / 18

  const getTransform = () => {
    if (isTop) return `translateX(${currentX}px) rotate(${rotation}deg)`
    const scale = 1 - stackIndex * 0.04
    const ty = stackIndex * 12
    return `scale(${scale}) translateY(${ty}px)`
  }

  const getTransition = () => {
    if (!isTop) return 'transform 0.3s ease'
    if (dragging) return 'none'
    if (exiting) return 'transform 0.35s ease-out, opacity 0.25s ease-out'
    return 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
  }

  const likeOpacity  = Math.max(0, Math.min(1,  dragX / SWIPE_THRESHOLD))
  const skipOpacity  = Math.max(0, Math.min(1, -dragX / SWIPE_THRESHOLD))

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isTop || exiting) return
    setDragging(true)
    hasMoved.current = false
    startX.current = e.clientX
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    const dx = e.clientX - startX.current
    if (Math.abs(dx) > TAP_MAX_MOVE) hasMoved.current = true
    setDragX(dx)
  }

  const handlePointerUp = () => {
    if (!dragging) return
    setDragging(false)
    if (!hasMoved.current) {
      setDragX(0)
      onOpen(place)
      return
    }
    if (dragX > SWIPE_THRESHOLD) {
      setExitX(window.innerWidth + 150)
    } else if (dragX < -SWIPE_THRESHOLD) {
      setExitX(-window.innerWidth - 150)
    } else {
      setDragX(0)
    }
  }

  const handleTransitionEnd = (e: React.TransitionEvent) => {
    if (!exiting || e.propertyName !== 'transform') return
    if (exitX! > 0) onLike(place.id)
    else onDislike(place.id)
  }

  const distLabel = distance == null
    ? null
    : distance < 1
      ? `${Math.round(distance * 1000)} m`
      : `${distance.toFixed(1)} km`

  return (
    <div
      className={`swipe-card${isTop ? ' is-top' : ''}${dragging ? ' is-dragging' : ''}`}
      style={{
        transform: getTransform(),
        transition: getTransition(),
        zIndex: 10 - stackIndex,
        pointerEvents: isTop ? 'auto' : 'none',
        opacity: exiting && exitX !== null ? undefined : 1,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onTransitionEnd={handleTransitionEnd}
    >
      {/* Swipe overlays — only on top card while dragging */}
      {isTop && dragX > 8 && !exiting && (
        <div className="swipe-overlay swipe-overlay-like" style={{ opacity: likeOpacity }}>
          <Heart size={32} />
          <span>想去！</span>
        </div>
      )}
      {isTop && dragX < -8 && !exiting && (
        <div className="swipe-overlay swipe-overlay-skip" style={{ opacity: skipOpacity }}>
          <X size={32} />
          <span>跳過</span>
        </div>
      )}

      {/* Photo */}
      <div className="swipe-photo-wrap">
        <img
          src={imgSrc}
          alt={place.name}
          className="swipe-photo"
          draggable={false}
          onError={() => setImgSrc(FALLBACK_IMAGE)}
        />
        <div className="swipe-photo-gradient" />
        <div className="swipe-badges">
          {place.michelinAward === '3star' && <span className="swipe-badge swipe-badge-michelin">★★★ 三星</span>}
          {place.michelinAward === '2star' && <span className="swipe-badge swipe-badge-michelin">★★ 二星</span>}
          {place.michelinAward === '1star' && <span className="swipe-badge swipe-badge-michelin">★ 一星</span>}
          {place.michelinAward === 'bib_gourmand' && <span className="swipe-badge swipe-badge-michelin">必比登</span>}
          {place.rainyDay && <span className="swipe-badge">🌧️ 雨天備案</span>}
          {place.ageMin <= 2 && <span className="swipe-badge">🍼 嬰幼兒適合</span>}
          {isFavorite && <span className="swipe-badge swipe-badge-fav">❤️ 已收藏</span>}
        </div>
      </div>

      {/* Content */}
      <div className="swipe-content">
        <div className="swipe-title-row">
          <strong className="swipe-name">{place.name}</strong>
          <span className="swipe-type-pill">{place.placeType ?? '景點'}</span>
        </div>
        <div className="swipe-meta">
          <span>{place.city}</span>
          {distLabel && <span>・{distLabel}</span>}
          <span>・{place.setting}</span>
        </div>
        <div className="swipe-tags">
          <span className="swipe-tag">{place.ageMin}–{place.ageMax} 歲</span>
          <span className="swipe-tag">{place.duration}</span>
          {(place.familyAmenities as Record<string, unknown> | undefined)?.['parking'] === 'confirmed' && (
            <span className="swipe-tag">🚗 停車</span>
          )}
          {(place.familyAmenities as Record<string, unknown> | undefined)?.['strollerFriendly'] === 'confirmed' && (
            <span className="swipe-tag">👶 推車友善</span>
          )}
        </div>
      </div>
    </div>
  )
}
