import type { Place } from '../data'

export type Coordinate = { lat: number; lng: number }

export type ItineraryStop = {
  place: Place
  arriveMin: number
  departMin: number
  stayMin: number
  travelMin: number
  bufferMin: number
}

export function haversineKm(a: Coordinate, b: Coordinate): number {
  const radiusKm = 6371
  const dLat = (b.lat - a.lat) * (Math.PI / 180)
  const dLng = (b.lng - a.lng) * (Math.PI / 180)
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * (Math.PI / 180)) * Math.cos(b.lat * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2
  return radiusKm * 2 * Math.asin(Math.sqrt(value))
}

/**
 * Offline driving estimate. It uses distance-dependent road factors and speeds,
 * so short urban hops are not unrealistically treated like highway travel.
 */
export function estimateDriveMinutes(from: Coordinate, to: Coordinate): number {
  const directKm = haversineKm(from, to)
  const roadFactor = directKm < 5 ? 1.45 : directKm < 25 ? 1.32 : 1.22
  const roadKm = directKm * roadFactor
  const speedKmh = roadKm < 7 ? 22 : roadKm < 30 ? 36 : roadKm < 80 ? 52 : 68
  return Math.max(5, Math.round((roadKm / speedKmh) * 60))
}

export function defaultStayMinutes(place: Place): number {
  if (place.duration === '晚上') return 90
  if (place.duration === '一日') return 180
  return 120
}

export function optimizePlaceOrder(places: Place[], start: Coordinate | null): Place[] {
  if (places.length < 2) return [...places]
  const remaining = [...places]
  const ordered: Place[] = []
  let cursor: Coordinate = start ?? remaining[0]

  while (remaining.length > 0) {
    let nearestIndex = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    for (let index = 0; index < remaining.length; index += 1) {
      const distance = haversineKm(cursor, remaining[index])
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = index
      }
    }
    const [next] = remaining.splice(nearestIndex, 1)
    ordered.push(next)
    cursor = next
  }
  return ordered
}

export function buildItinerary(
  places: Place[],
  options: {
    start: Coordinate | null
    startMin: number
    stayMinutes?: Record<string, number>
    transitionBufferMin?: number
  },
): ItineraryStop[] {
  const stops: ItineraryStop[] = []
  let cursor = options.startMin
  const transitionBufferMin = options.transitionBufferMin ?? 15

  places.forEach((place, index) => {
    const from = index > 0 ? places[index - 1] : options.start
    const travelMin = from ? estimateDriveMinutes(from, place) : 0
    const bufferMin = index > 0 ? transitionBufferMin : 0
    cursor += travelMin + bufferMin
    const stayMin = options.stayMinutes?.[place.id] ?? defaultStayMinutes(place)
    const arriveMin = cursor
    const departMin = arriveMin + stayMin
    stops.push({ place, arriveMin, departMin, stayMin, travelMin, bufferMin })
    cursor = departMin
  })

  return stops
}

export function parseTime(value: string, fallback = 9 * 60): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return fallback
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return fallback
  return hours * 60 + minutes
}

export function formatTime(totalMin: number): string {
  const normalized = ((totalMin % (24 * 60)) + (24 * 60)) % (24 * 60)
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function buildGoogleMapsRouteUrl(stops: Place[], start: Coordinate | null): string | null {
  if (stops.length === 0) return null
  const params = new URLSearchParams({ api: '1', travelmode: 'driving' })
  if (start) params.set('origin', `${start.lat},${start.lng}`)
  params.set('destination', `${stops[stops.length - 1].lat},${stops[stops.length - 1].lng}`)
  if (stops.length > 1) {
    params.set('waypoints', stops.slice(0, -1).map((place) => `${place.lat},${place.lng}`).join('|'))
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`
}
