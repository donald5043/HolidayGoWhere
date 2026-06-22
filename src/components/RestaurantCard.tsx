import { useState } from 'react'
import { ChevronRight, MapPin } from 'lucide-react'
import type { Place } from '../data'
import { bestImageSrc, FALLBACK_IMAGE } from '../imageUtils'
import type { RestaurantScore } from '../services/restaurantClassifier'

type Props = {
  place: Place
  distance: number
  score: RestaurantScore
  onClick: () => void
}

export function RestaurantCard({ place, distance, score, onClick }: Props) {
  const [imgSrc, setImgSrc] = useState(() => bestImageSrc(place.image, place.imageCandidates))
  const distLabel = distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`

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
        <strong className="restaurant-name">{place.name}</strong>
        <div className="restaurant-meta">
          <span><MapPin size={11} />{distLabel}</span>
          <span>・{place.city}</span>
        </div>
        {score.tags.length > 0 && (
          <div className="restaurant-tags">
            {score.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="restaurant-tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
      <ChevronRight size={16} className="restaurant-arrow" />
    </article>
  )
}
