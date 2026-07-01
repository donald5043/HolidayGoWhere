import { useEffect, useMemo, useState } from 'react'
import type { Place, RescueSupply } from '../data'
import { fetchPublicJson } from '../lib/fetchPublicJson'

const rescueAccent = '#789B8D'

function regionFromCity(city: string): Place['region'] {
  if (/台北|臺北|新北|桃園|新竹|基隆|宜蘭/.test(city)) return '北部'
  if (/苗栗|台中|臺中|彰化|南投|雲林/.test(city)) return '中部'
  if (/嘉義|台南|臺南|高雄|屏東/.test(city)) return '南部'
  if (/花蓮|台東|臺東/.test(city)) return '東部'
  return '離島'
}

function rescueDescription(supply: RescueSupply): string {
  const stockHint = supply.tags.includes('尿布') || supply.tags.includes('奶粉')
    ? '適合臨時補尿布、奶粉、濕紙巾、奶瓶奶嘴或外出用品。'
    : '適合臨時補給親子外出用品，出發前建議先電話確認庫存與營業時間。'
  return `${supply.brand}官方門市資料整理，${stockHint}`
}

export function rescueSupplyToPlace(supply: RescueSupply): Place | null {
  if (typeof supply.lat !== 'number' || typeof supply.lng !== 'number') return null

  const tags = supply.tags.length ? supply.tags : ['尿布', '奶粉', '推車']
  return {
    id: supply.id,
    name: supply.name,
    region: regionFromCity(supply.city),
    city: supply.city || '臺灣',
    district: supply.district || '',
    ageMin: 0,
    ageMax: 12,
    setting: '室內',
    duration: '半日',
    category: '臨時補給',
    rating: null,
    reviews: 0,
    priceLabel: '補給',
    address: supply.address,
    hours: supply.hours || '請先電話確認',
    lat: supply.lat,
    lng: supply.lng,
    image: '',
    imageCandidates: [],
    accent: rescueAccent,
    description: rescueDescription(supply),
    highlights: tags.slice(0, 4),
    facilities: ['官方門市', ...tags.slice(0, 3)],
    familyAmenities: {
      accessibility: 'notListed',
      ramp: 'notListed',
      nursingRoom: 'notListed',
      diaperTable: 'notListed',
      familyRestroom: 'notListed',
      parking: 'notListed',
      strollerFriendly: 'confirmed',
      parkingInfo: '官方門市資料未提供停車資訊，建議出發前電話確認。',
    },
    mapsUrl: supply.mapsUrl,
    sources: [{ type: '官方網站', label: supply.source.label, url: supply.source.url }],
    dataSource: `親子救援資料・${supply.source.label}`,
    sourceId: supply.id,
    qualityScore: supply.confidence === 'high' ? 88 : supply.confidence === 'medium' ? 72 : 56,
    qualityScoreV2: supply.confidence === 'high' ? 88 : supply.confidence === 'medium' ? 72 : 56,
    updatedAt: supply.source.checkedAt,
    rainyDay: true,
    placeType: '景點',
    completeness: {
      score: supply.confidence === 'high' ? 85 : 68,
      missing: supply.confidence === 'high' ? [] : ['座標或門市細節尚待確認'],
    },
  }
}

export function useRescueSupplies(enabled: boolean) {
  const [supplies, setSupplies] = useState<RescueSupply[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  useEffect(() => {
    if (!enabled || status === 'loading' || status === 'ready') return
    setStatus('loading')
    fetchPublicJson<{ supplies: RescueSupply[] }>('data/rescue-supplies.json')
      .then((data) => {
        setSupplies(Array.isArray(data.supplies) ? data.supplies : [])
        setStatus('ready')
      })
      .catch(() => {
        setSupplies([])
        setStatus('error')
      })
  }, [enabled, status])

  const places = useMemo(
    () => supplies.map(rescueSupplyToPlace).filter((place): place is Place => Boolean(place)),
    [supplies],
  )

  return { rescueSupplies: supplies, rescuePlaces: places, rescueStatus: status }
}
