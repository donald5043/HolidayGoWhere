import { useEffect, useMemo, useState } from 'react'
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

const RADIUS_OPTIONS = [3, 5, 10] as const
type RadiusKm = (typeof RADIUS_OPTIONS)[number]

type Props = {
  allPlaces: Place[]
  anchor: Place
  onOpen: (place: Place) => void
}

export function NearbyRestaurants({ allPlaces, anchor, onOpen }: Props) {
  const [featured, setFeatured] = useState<Place[]>([])
  const [osm, setOsm] = useState<Place[]>([])
  const [radiusKm, setRadiusKm] = useState<RadiusKm>(5)

  useEffect(() => {
    import('../generated/restaurants-featured.json')
      .then((m) => setFeatured(m.default as Place[]))
      .catch(() => {/* silent */})
    import('../generated/restaurants-osm.json')
      .then((m) => setOsm(m.default as Place[]))
      .catch(() => {/* silent */})
  }, [])

  const restaurants = useMemo(() => {
    const seen = new Set(allPlaces.filter((p) => p.placeType === '餐飲').map((p) => p.id))
    const combined = [
      ...allPlaces.filter((p) => p.placeType === '餐飲'),
      ...featured.filter((p) => !seen.has(p.id)),
      ...osm.filter((p) => !seen.has(p.id) && !featured.some((f) => f.id === p.id)),
    ]
    return combined
      .filter((p) => p.id !== anchor.id)
      .map((p) => ({ place: p, dist: haversineKm(anchor, p), score: classifyRestaurant(p) }))
      .filter(({ dist }) => dist <= radiusKm)
      .sort((a, b) => {
        const diff = b.score.familyScore - a.score.familyScore
        return Math.abs(diff) > 10 ? diff : a.dist - b.dist
      })
      .slice(0, 5)
  }, [allPlaces, featured, osm, anchor, radiusKm])

  if (restaurants.length === 0 && (featured.length > 0 || osm.length > 0)) {
    return (
      <div className="detail-section nearby-restaurants-section">
        <h3>🍴 附近餐廳</h3>
        <div className="nearby-radius-row">
          {RADIUS_OPTIONS.map((r) => (
            <button key={r} className={radiusKm === r ? 'active' : ''} onClick={() => setRadiusKm(r)}>
              {r} km
            </button>
          ))}
        </div>
        <p className="nearby-restaurants-hint">{radiusKm} 公里內暫無資料，試試擴大搜尋範圍</p>
      </div>
    )
  }

  if (restaurants.length === 0) return null

  return (
    <div className="detail-section nearby-restaurants-section">
      <h3>🍴 附近餐廳</h3>
      <div className="nearby-radius-row">
        {RADIUS_OPTIONS.map((r) => (
          <button key={r} className={radiusKm === r ? 'active' : ''} onClick={() => setRadiusKm(r)}>
            {r} km
          </button>
        ))}
      </div>
      <p className="nearby-restaurants-hint">找到 {restaurants.length} 間 {radiusKm} 公里內的餐廳</p>
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
