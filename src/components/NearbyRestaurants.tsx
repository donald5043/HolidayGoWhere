import { useEffect, useMemo, useState } from 'react'
import type { Place, RestaurantCategory } from '../data'
import { fetchPublicJson } from '../lib/fetchPublicJson'
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

const MAX_DIVERSE = 5   // default cap with diversity
const MAX_PER_CAT = 2   // max per category in diverse view
const MAX_EXPANDED = 10 // cap when user expands

export function NearbyRestaurants({ allPlaces, anchor, onOpen }: Props) {
  const [featured, setFeatured] = useState<Place[]>([])
  const [osm, setOsm] = useState<Place[]>([])
  const [radiusKm, setRadiusKm] = useState<RadiusKm>(3)
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [showAll, setShowAll] = useState(false)

  const handleSetCategory = (v: CategoryFilter) => { setCategoryFilter(v); setShowAll(false) }
  const handleSetRadius = (r: RadiusKm) => { setRadiusKm(r); setShowAll(false) }

  useEffect(() => {
    fetchPublicJson<Place[]>('data/restaurants-featured.json')
      .then((restaurants) => setFeatured(restaurants))
      .catch(() => {/* silent */})
    fetchPublicJson<Place[]>('data/restaurants-osm.json')
      .then((restaurants) => setOsm(restaurants))
      .catch(() => {/* silent */})
  }, [])

  const { restaurants, totalCount } = useMemo(() => {
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

    const sorted = filtered.sort((a, b) => b.sortScore - a.sortScore || a.dist - b.dist)
    const totalCount = sorted.length

    if (showAll) {
      return { restaurants: sorted.slice(0, MAX_EXPANDED), totalCount }
    }

    // Diversity cap when showing all categories: max MAX_PER_CAT per category
    if (categoryFilter === 'all') {
      const catCount: Record<string, number> = {}
      const diverse: typeof sorted = []
      for (const item of sorted) {
        const cat = item.score.restaurantCategory ?? 'general_restaurant'
        catCount[cat] = (catCount[cat] ?? 0) + 1
        if (catCount[cat] <= MAX_PER_CAT) {
          diverse.push(item)
          if (diverse.length >= MAX_DIVERSE) break
        }
      }
      return { restaurants: diverse, totalCount }
    }

    // Specific category selected: just top 5
    return { restaurants: sorted.slice(0, MAX_DIVERSE), totalCount }
  }, [allPlaces, featured, osm, anchor, radiusKm, categoryFilter, showAll])

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
          onClick={() => handleSetCategory(value)}
        >
          {label}
        </button>
      ))}
    </div>
  )

  const radiusRow = (
    <div className="nearby-radius-row" role="group" aria-label="搜尋半徑">
      {RADIUS_OPTIONS.map((r) => (
        <button key={r} className={radiusKm === r ? 'active' : ''} onClick={() => handleSetRadius(r)}>
          {r} km
        </button>
      ))}
    </div>
  )

  const categoryLabel =
    categoryFilter === 'all' ? '' : CATEGORY_LABEL[categoryFilter as RestaurantCategory] + '・'

  const hiddenCount = totalCount - restaurants.length

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
            {categoryLabel}找到 {totalCount} 間・{radiusKm} km 內
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
          {!showAll && hiddenCount > 0 && (
            <button className="nearby-show-more" onClick={() => setShowAll(true)}>
              查看更多 {hiddenCount} 間
            </button>
          )}
        </>
      )}
    </div>
  )
}
