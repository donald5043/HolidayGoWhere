import { useEffect, useMemo, useState } from 'react'
import {
  Baby,
  CalendarDays,
  Clock3,
  Database,
  Heart,
  LocateFixed,
  MapPin,
  Navigation,
  Star,
  Umbrella,
} from 'lucide-react'
import type { Place } from '../data'
import { BAD_PLACEHOLDER_IMAGES, FALLBACK_IMAGE } from '../imageUtils'
import { compactNumber } from '../lib/format'

export function PlaceImage({
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

export function MichelinBadge({ award }: { award: string }) {
  if (award === '3star') return <span className="michelin-badge michelin-star">★★★ 三星</span>
  if (award === '2star') return <span className="michelin-badge michelin-star">★★ 二星</span>
  if (award === '1star') return <span className="michelin-badge michelin-star">★ 一星</span>
  if (award === 'bib_gourmand') return <span className="michelin-badge michelin-bib">必比登</span>
  return null
}

export function PlaceCard({
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
          {place.michelinAward && <MichelinBadge award={place.michelinAward} />}
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
