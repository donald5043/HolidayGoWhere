export type ActivityType =
  | 'place_open'
  | 'favorite_add'
  | 'favorite_remove'
  | 'navigate'
  | 'itinerary_share'
  | 'report_save'

export type ActivityEvent = {
  version: 1
  type: ActivityType
  at: string
  placeId?: string
}

const STORAGE_KEY = 'holiday-go-where:activity-log'
const MAX_EVENTS = 200

export function readActivityLog(): ActivityEvent[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as ActivityEvent[]
    return Array.isArray(parsed) ? parsed.filter((event) => event?.version === 1 && typeof event.type === 'string') : []
  } catch {
    return []
  }
}

/** Stores anonymous interaction history on this device only. */
export function trackActivity(type: ActivityType, placeId?: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    const next = [...readActivityLog(), { version: 1 as const, type, placeId, at: new Date().toISOString() }]
      .slice(-MAX_EVENTS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage may be unavailable in private browsing. Product behavior should continue.
  }
}
