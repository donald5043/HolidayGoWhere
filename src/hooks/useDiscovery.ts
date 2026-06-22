import { useCallback, useMemo, useState } from 'react'
import type { Place } from '../data'

const LS_LIKED    = 'holiday-go-where:discovery-liked'
const LS_DISLIKED = 'holiday-go-where:discovery-disliked'

function loadIds(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}

function scoreForDiscovery(place: Place): number {
  let score = place.qualityScore ?? 0
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

export function useDiscovery(places: Place[]) {
  const [likedIds, setLikedIds] = useState<string[]>(() => loadIds(LS_LIKED))
  const [dislikedIds, setDislikedIds] = useState<string[]>(() => loadIds(LS_DISLIKED))

  const queue = useMemo(() => {
    if (!places.length) return [] as Place[]
    const seen = new Set([...likedIds, ...dislikedIds])
    return places
      .filter((p) => !seen.has(p.id))
      .sort((a, b) => scoreForDiscovery(b) - scoreForDiscovery(a))
  }, [places, likedIds, dislikedIds])

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
