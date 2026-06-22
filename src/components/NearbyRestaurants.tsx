import { useMemo } from 'react'
import type { Place } from '../data'
import { classifyRestaurant } from '../services/restaurantClassifier'
import { RestaurantCard } from './RestaurantCard'

function haversineKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
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
  allPlaces: Place[]
  anchor: Place
  onOpen: (place: Place) => void
}

export function NearbyRestaurants({ allPlaces, anchor, onOpen }: Props) {
  const restaurants = useMemo(() => {
    return allPlaces
      .filter((p) => p.placeType === '餐飲' && p.id !== anchor.id)
      .map((p) => ({ place: p, dist: haversineKm(anchor, p), score: classifyRestaurant(p) }))
      .filter(({ dist }) => dist <= 10)
      .sort((a, b) => {
        const diff = b.score.familyScore - a.score.familyScore
        return Math.abs(diff) > 10 ? diff : a.dist - b.dist
      })
      .slice(0, 3)
  }, [allPlaces, anchor])

  if (restaurants.length === 0) return null

  return (
    <div className="detail-section nearby-restaurants-section">
      <h3>🍴 附近親子餐廳</h3>
      <p className="nearby-restaurants-hint">玩累了？這裡 10 公里內的親子友善選擇</p>
      <div className="restaurant-list">
        {restaurants.map(({ place, dist, score }) => (
          <RestaurantCard
            key={place.id}
            place={place}
            distance={dist}
            score={score}
            onClick={() => onOpen(place)}
          />
        ))}
      </div>
    </div>
  )
}
