import { useState } from 'react'
import { ChevronRight, MapPin } from 'lucide-react'
import type { Place } from '../data'
import { bestImageSrc, FALLBACK_IMAGE } from '../imageUtils'
import {
  type RestaurantScore,
  CATEGORY_LABEL,
  CATEGORY_COLOR,
  CATEGORY_TEXT_COLOR,
} from '../services/restaurantClassifier'

type Props = {
  place: Place
  distance: number
  score: RestaurantScore
  onClick: () => void
}

export function RestaurantCard({ place, distance, score, onClick }: Props) {
  const [imgSrc, setImgSrc] = useState(() => bestImageSrc(place.image, place.imageCandidates))
  const distLabel = distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`
  const catLabel = CATEGORY_LABEL[score.restaurantCategory]
  const catBg = CATEGORY_COLOR[score.restaurantCategory]
  const catFg = CATEGORY_TEXT_COLOR[score.restaurantCategory]

  return (
    <article className="restaurant-card" onClick={onClick}>
      <div className="restaurant-photo-wrap">
        <img
          src={imgSrc}
          alt={place.name}
          className="restaurant-photo"
          draggable={false}
          onError={() => setImgSrc(FALLBACK_IMAGE)}
        />
      </div>
      <div className="restaurant-info">
        <div className="restaurant-name-row">
          <strong className="restaurant-name">{place.name}</strong>
          <span
            className="restaurant-cat-badge"
            style={{ background: catBg, color: catFg }}
          >
            {catLabel}
          </span>
        </div>
        <div className="restaurant-meta">
          <span><MapPin size={11} />{distLabel}</span>
          <span>・{place.city}</span>
        </div>
        {score.tags.length > 0 && (
          <div className="restaurant-tags">
            {score.tags.slice(0, 5).map((tag) => (
              <span key={tag} className="restaurant-tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
      <ChevronRight size={16} className="restaurant-arrow" />
    </article>
  )
}
