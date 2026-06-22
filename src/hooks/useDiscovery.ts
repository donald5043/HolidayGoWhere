import { useCallback, useMemo, useState } from 'react'
import type { Place } from '../data'

const LS_LIKED    = 'holiday-go-where:discovery-liked'
const LS_DISLIKED = 'holiday-go-where:discovery-disliked'

type UserLocation = { lat: number; lng: number }

function loadIds(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
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
  let score = place.qualityScore ?? 0

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
  if (place.image) score += 15
  if (place.rainyDay) score += 5
  return score
}

export function useDiscovery(places: Place[], userLocation: UserLocation | null) {
  const [likedIds, setLikedIds] = useState<string[]>(() => loadIds(LS_LIKED))
  const [dislikedIds, setDislikedIds] = useState<string[]>(() => loadIds(LS_DISLIKED))

  const queue = useMemo(() => {
    if (!places.length) return [] as Place[]
    const seen = new Set([...likedIds, ...dislikedIds])
    return places
      .filter((p) => !seen.has(p.id))
      .sort((a, b) => scoreForDiscovery(b, userLocation) - scoreForDiscovery(a, userLocation))
  }, [places, likedIds, dislikedIds, userLocation])

  const isDone = places.length > 0 && queue.length === 0

  const like = useCallback((id: string) => {
    setLikedIds((prev) => {
      const next = [...prev, id]
      localStorage.setItem(LS_LIKED, JSON.stringify(next))
      return next
    })
  }, [])

  const dislike = useCallback((id: string) => {
    setDislikedIds((prev) => {
      const next = [...prev, id]
      localStorage.setItem(LS_DISLIKED, JSON.stringify(next))
      return next
    })
  }, [])

  const reset = useCallback(() => {
    setLikedIds([])
    setDislikedIds([])
    localStorage.removeItem(LS_LIKED)
    localStorage.removeItem(LS_DISLIKED)
  }, [])

  return { queue, likedIds, isDone, like, dislike, reset }
}
