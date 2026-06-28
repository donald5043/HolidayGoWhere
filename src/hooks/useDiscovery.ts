import { useCallback, useMemo, useState } from 'react'
import type { Place } from '../data'
import { getFamilyEvidence, getQualityScore } from '../placeQuality'

const LS_LIKED    = 'holiday-go-where:discovery-liked'
const LS_DISLIKED = 'holiday-go-where:discovery-disliked'

type UserLocation = { lat: number; lng: number }

function loadIds(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

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

function scoreForDiscovery(place: Place, userLocation: UserLocation | null): number {
  let score = getQualityScore(place)

  // Proximity bonus: up to 50 pts — fades to 0 at ~17 km
  if (userLocation) {
    const dist = haversineKm(userLocation, place)
    score += Math.max(0, 50 - dist * 3)
  }

  const a = place.familyAmenities as Record<string, unknown> | undefined
  if (a) {
    const n = ['nursingRoom', 'diaperTable', 'parking', 'strollerFriendly']
      .filter((k) => a[k] === 'confirmed').length
    score += n * 10
  }
  if (getFamilyEvidence(place).length) score += 8
  if (place.image) score += 8
  if (place.rainyDay) score += 5
  return score
}

function hashText(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function diversifyPlaces(places: Place[], userLocation: UserLocation | null, seed: number) {
  const pool = places.map((place) => ({
    place,
    baseScore: scoreForDiscovery(place, userLocation),
    jitter: (hashText(`${place.id}:${seed}`) % 1000) / 1000,
  }))
  const result: Place[] = []
  const cityCounts = new Map<string, number>()
  const categoryCounts = new Map<string, number>()
  const settingCounts = new Map<string, number>()

  while (pool.length && result.length < 96) {
    let bestIndex = 0
    let bestScore = -Infinity

    pool.forEach((item, index) => {
      const cityPenalty = (cityCounts.get(item.place.city) || 0) * 13
      const categoryPenalty = (categoryCounts.get(item.place.category) || 0) * 9
      const settingPenalty = (settingCounts.get(item.place.setting) || 0) * 5
      const score = item.baseScore + item.jitter * 7 - cityPenalty - categoryPenalty - settingPenalty

      if (score > bestScore) {
        bestScore = score
        bestIndex = index
      }
    })

    const [next] = pool.splice(bestIndex, 1)
    result.push(next.place)
    cityCounts.set(next.place.city, (cityCounts.get(next.place.city) || 0) + 1)
    categoryCounts.set(next.place.category, (categoryCounts.get(next.place.category) || 0) + 1)
    settingCounts.set(next.place.setting, (settingCounts.get(next.place.setting) || 0) + 1)
  }

  return result
}

export function useDiscovery(places: Place[], userLocation: UserLocation | null) {
  const [likedIds, setLikedIds] = useState<string[]>(() => loadIds(LS_LIKED))
  const [dislikedIds, setDislikedIds] = useState<string[]>(() => loadIds(LS_DISLIKED))
  const [batchSkipIds, setBatchSkipIds] = useState<string[]>([])
  const [shuffleSeed, setShuffleSeed] = useState(() => Math.floor(Date.now() / 1000))

  const queue = useMemo(() => {
    if (!places.length) return [] as Place[]
    const seen = new Set([...likedIds, ...dislikedIds, ...batchSkipIds])
    const available = places.filter((place) => !seen.has(place.id))
    const fallback = places.filter((place) => !new Set([...likedIds, ...dislikedIds]).has(place.id))

    if (available.length >= 3) return diversifyPlaces(available, userLocation, shuffleSeed)
    return diversifyPlaces(fallback, userLocation, shuffleSeed + 97)
  }, [places, likedIds, dislikedIds, batchSkipIds, userLocation, shuffleSeed])

  const isDone = places.length > 0 && queue.length === 0

  const like = useCallback((id: string) => {
    setLikedIds((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id]
      localStorage.setItem(LS_LIKED, JSON.stringify(next))
      return next
    })
  }, [])

  const dislike = useCallback((id: string) => {
    setDislikedIds((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id]
      localStorage.setItem(LS_DISLIKED, JSON.stringify(next))
      return next
    })
  }, [])

  const refreshBatch = useCallback(() => {
    setBatchSkipIds((prev) => {
      const next = [...new Set([...prev, ...queue.slice(0, 8).map((place) => place.id)])]
      const permanentSeen = new Set([...likedIds, ...dislikedIds])
      const remaining = places.filter((place) => !permanentSeen.has(place.id) && !next.includes(place.id))
      return remaining.length >= 3 ? next : []
    })
    setShuffleSeed((seed) => seed + 1)
  }, [dislikedIds, likedIds, places, queue])

  const reset = useCallback(() => {
    setLikedIds([])
    setDislikedIds([])
    setBatchSkipIds([])
    setShuffleSeed((seed) => seed + 1)
    localStorage.removeItem(LS_LIKED)
    localStorage.removeItem(LS_DISLIKED)
  }, [])

  return { queue, likedIds, isDone, like, dislike, reset, refreshBatch, availableCount: queue.length }
}
