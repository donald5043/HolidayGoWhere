import { describe, expect, it } from 'vitest'
import type { Place } from '../data'
import { buildGoogleMapsRouteUrl, buildItinerary, estimateDriveMinutes, optimizePlaceOrder, parseTime } from './itinerary'

function place(id: string, lat: number, lng: number): Place {
  return {
    id,
    name: id,
    region: '北部',
    city: '臺北市',
    district: '',
    ageMin: 0,
    ageMax: 12,
    setting: '室內外',
    duration: '半日',
    category: '景點',
    rating: null,
    reviews: 0,
    priceLabel: '',
    address: '',
    hours: '',
    lat,
    lng,
    image: '',
    accent: '',
    description: '',
    highlights: [],
    facilities: [],
    mapsUrl: '',
    sources: [],
    dataSource: '',
    sourceId: id,
    qualityScore: 0,
    updatedAt: '',
  }
}

describe('itinerary', () => {
  const start = { lat: 25.04, lng: 121.52 }
  const near = place('near', 25.045, 121.525)
  const far = place('far', 25.2, 121.7)

  it('uses slower short-trip estimates and never returns zero minutes', () => {
    expect(estimateDriveMinutes(start, near)).toBeGreaterThanOrEqual(5)
    expect(estimateDriveMinutes(start, far)).toBeGreaterThan(estimateDriveMinutes(start, near))
  })

  it('orders the nearest stop first', () => {
    expect(optimizePlaceOrder([far, near], start).map((item) => item.id)).toEqual(['near', 'far'])
  })

  it('adds a transition buffer between stops', () => {
    const result = buildItinerary([near, far], {
      start,
      startMin: parseTime('09:00'),
      stayMinutes: { near: 60, far: 90 },
      transitionBufferMin: 15,
    })
    expect(result[0].bufferMin).toBe(0)
    expect(result[1].bufferMin).toBe(15)
    expect(result[1].arriveMin).toBeGreaterThan(result[0].departMin)
  })

  it('creates a multi-stop Google Maps route', () => {
    const url = buildGoogleMapsRouteUrl([near, far], start)
    expect(url).toContain('origin=25.04%2C121.52')
    expect(url).toContain('waypoints=25.045%2C121.525')
  })
})
