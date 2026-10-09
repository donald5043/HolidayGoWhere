import { describe, expect, it } from 'vitest'
import type { Place } from '../data'
import { getFreshnessInfo, isOfficialSource, normalizeSearchText, scorePlaceSearch } from './placeSearch'

function place(overrides: Partial<Place> = {}): Place {
  return {
    id: 'test-place',
    name: '台北親子館',
    region: '北部',
    city: '臺北市',
    district: '中正區',
    ageMin: 0,
    ageMax: 12,
    setting: '室內',
    duration: '半日',
    category: '親子館',
    rating: null,
    reviews: 0,
    priceLabel: '免費',
    address: '臺北市中正區測試路 1 號',
    hours: '09:00-17:00',
    lat: 25.04,
    lng: 121.52,
    image: '',
    accent: '#000',
    description: '設有育嬰室與兒童遊戲空間',
    highlights: ['雨天備案'],
    facilities: ['哺乳室', '尿布台'],
    mapsUrl: '',
    sources: [{ type: '官方網站', label: '官方頁面', url: 'https://example.com' }],
    dataSource: '政府開放資料',
    sourceId: 'test',
    qualityScore: 80,
    updatedAt: '2026-09-01T00:00:00.000Z',
    placeType: '景點',
    ...overrides,
  }
}

describe('place search', () => {
  it('normalizes Taiwan character and punctuation variants', () => {
    expect(normalizeSearchText('臺北／親子・景點')).toBe('台北 親子 景點')
  })

  it('matches family-friendly synonyms across structured fields', () => {
    expect(scorePlaceSearch(place(), '寶寶 換尿布').matches).toBe(true)
    expect(scorePlaceSearch(place(), '高雄 戶外').matches).toBe(false)
  })

  it('ranks an exact name above a description-only match', () => {
    const exact = scorePlaceSearch(place(), '台北親子館').score
    const description = scorePlaceSearch(place({ name: '城市空間' }), '親子').score
    expect(exact).toBeGreaterThan(description)
  })

  it('does not present OpenStreetMap records as official sources', () => {
    expect(isOfficialSource(place({
      dataSource: 'osm',
      sources: [{ type: '官方網站', label: 'OpenStreetMap', url: 'https://www.openstreetmap.org/node/1' }],
    }))).toBe(false)
    expect(isOfficialSource(place())).toBe(true)
  })
})

describe('freshness classification', () => {
  const now = new Date('2026-10-09T00:00:00.000Z')

  it('separates recent, aging, stale, and unknown dates', () => {
    expect(getFreshnessInfo('2026-09-01', now).level).toBe('recent')
    expect(getFreshnessInfo('2026-01-01', now).level).toBe('aging')
    expect(getFreshnessInfo('2024-01-01', now).level).toBe('stale')
    expect(getFreshnessInfo('', now).level).toBe('unknown')
  })
})
