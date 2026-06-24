import { useEffect, useMemo, useState } from 'react'
import type { Place, RestaurantCategory } from '../data'
import { classifyRestaurant, categoryPriority, CATEGORY_LABEL } from '../services/restaurantClassifier'
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

const RADIUS_OPTIONS = [1, 3, 5] as const
type RadiusKm = (typeof RADIUS_OPTIONS)[number]

type CategoryFilter = 'all' | RestaurantCategory

const CATEGORY_FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'family_chain', label: '親子連鎖' },
  { value: 'mall_food_court', label: '商場美食街' },
  { value: 'family_supply_brand', label: '親子補給品牌' },
  { value: 'attraction_attached', label: '景點附設' },
  { value: 'general_restaurant', label: '一般餐廳' },
]

type Props = {
  allPlaces: Place[]
  anchor: Place
  onOpen: (place: Place) => void
}

export function NearbyRestaurants({ allPlaces, anchor, onOpen }: Props) {
  const [featured, setFeatured] = useState<Place[]>([])
  const [osm, setOsm] = useState<Place[]>([])
  const [radiusKm, setRadiusKm] = useState<RadiusKm>(3)
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')

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

    const scored = combined
      .filter((p) => p.id !== anchor.id)
      .map((p) => {
        const dist = haversineKm(anchor, p)
        const score = classifyRestaurant(p)
        const distBonus = dist <= 1 ? 20 : dist <= 3 ? 10 : 0
        const catPriority = categoryPriority(score.restaurantCategory)
        const sortScore = score.familyScore + distBonus + catPriority
        return { place: p, dist, score, sortScore }
      })
      .filter(({ dist }) => dist <= radiusKm)

    const filtered =
      categoryFilter === 'all'
        ? scored
        : categoryFilter === 'general_restaurant'
          ? scored.filter(({ score }) =>
              score.restaurantCategory === 'general_restaurant' ||
              score.restaurantCategory === 'tourism_restaurant',
            )
          : scored.filter(({ score }) => score.restaurantCategory === categoryFilter)

    return filtered
      .sort((a, b) => b.sortScore - a.sortScore || a.dist - b.dist)
      .slice(0, 3)
  }, [allPlaces, featured, osm, anchor, radiusKm, categoryFilter])

  // Count available restaurants regardless of category filter (for empty state decision)
  const hasAny = useMemo(() => {
    const seen = new Set(allPlaces.filter((p) => p.placeType === '餐飲').map((p) => p.id))
    return (
      allPlaces.some((p) => p.placeType === '餐飲' && p.id !== anchor.id) ||
      featured.some((p) => !seen.has(p.id)) ||
      osm.some((p) => !seen.has(p.id))
    )
  }, [allPlaces, featured, osm, anchor.id])

  if (!hasAny) return null

  const filterRow = (
    <div className="nearby-filter-row" role="group" aria-label="篩選類別">
      {CATEGORY_FILTERS.map(({ value, label }) => (
        <button
          key={value}
          className={categoryFilter === value ? 'active' : ''}
          onClick={() => setCategoryFilter(value)}
        >
          {label}
        </button>
      ))}
    </div>
  )

  const radiusRow = (
    <div className="nearby-radius-row" role="group" aria-label="搜尋半徑">
      {RADIUS_OPTIONS.map((r) => (
        <button key={r} className={radiusKm === r ? 'active' : ''} onClick={() => setRadiusKm(r)}>
          {r} km
        </button>
      ))}
    </div>
  )

  const categoryLabel =
    categoryFilter === 'all' ? '' : CATEGORY_LABEL[categoryFilter as RestaurantCategory] + '・'

  return (
    <div className="detail-section nearby-restaurants-section">
      <h3>🍴 附近餐廳</h3>
      {filterRow}
      {radiusRow}
      {restaurants.length === 0 ? (
        <p className="nearby-restaurants-hint">
          {categoryLabel}{radiusKm} km 內暫無資料，試試擴大範圍或切換類別
        </p>
      ) : (
        <>
          <p className="nearby-restaurants-hint">
            {categoryLabel}找到 {restaurants.length} 間・{radiusKm} km 內
          </p>
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
        </>
      )}
    </div>
  )
}
