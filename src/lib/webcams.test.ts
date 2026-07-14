import { describe, expect, it } from 'vitest'
import type { CongestedSection, Webcam } from '../data'
import { haversineKm, matchCongestionToRoadCams, selectNearbyWebcams } from './webcams'

// 中和恐龍園區(華中橋下),用來重現曾經回報過的兩個 bug
const DINO_PARK = { lat: 25.00819, lng: 121.4951, setting: '室外' as const }

function cam(overrides: Partial<Webcam> & Pick<Webcam, 'id' | 'lat' | 'lng'>): Webcam {
  return {
    name: overrides.id,
    kind: 'image',
    imageUrl: 'https://example.com/snapshot.jpg',
    source: '測試來源',
    ...overrides,
  }
}

describe('selectNearbyWebcams', () => {
  it('田野回歸測試:俯瞰鏡頭不佔用現場名額,即使距離比路況鏡頭近', () => {
    // 烘爐地(俯瞰,2.1km)曾經因為落在舊版 10km「現場」半徑內佔滿名額,
    // 把台64 的路況鏡頭(1.2km)完全擠出去
    const webcams: Webcam[] = [
      cam({ id: 'seed-hongludi', lat: 25.02, lng: 121.51, view: 'panorama' }),
      cam({ id: 'highway-64-near', lat: 25.0085, lng: 121.4955 }), // ~0.1km
      cam({ id: 'highway-64-far', lat: 25.02, lng: 121.5 }), // ~1.7km,仍在 4km 內但明顯較遠
    ]

    const result = selectNearbyWebcams(DINO_PARK, webcams)
    const panorama = result.filter((e) => e.panorama)
    const road = result.filter((e) => e.road)

    expect(panorama).toHaveLength(1)
    expect(panorama[0].cam.id).toBe('seed-hongludi')
    expect(road.map((e) => e.cam.id)).toEqual(['highway-64-near', 'highway-64-far'])
  })

  it('室內景點不顯示遠眺鏡頭(看不到區域天氣沒有意義)', () => {
    const webcams: Webcam[] = [cam({ id: 'seed-panorama', lat: 25.02, lng: 121.51, view: 'panorama' })]
    const indoorPlace = { ...DINO_PARK, setting: '室內' }

    const result = selectNearbyWebcams(indoorPlace, webcams)

    expect(result.some((e) => e.panorama)).toBe(false)
  })

  it('現場半徑收緊到 3km:超過的一般景點鏡頭不算現場', () => {
    const webcams: Webcam[] = [
      cam({ id: 'seed-far-scenic', lat: 25.05, lng: 121.5 }), // ~5km,超過 3km 門檻
      cam({ id: 'seed-near-scenic', lat: 25.009, lng: 121.496 }), // <1km
    ]

    const result = selectNearbyWebcams(DINO_PARK, webcams)
    const ids = result.map((e) => e.cam.id)

    expect(ids).toContain('seed-near-scenic')
    expect(ids).not.toContain('seed-far-scenic')
  })

  it('路況鏡頭有備援名額,快照優先於 link 播放頁', () => {
    const webcams: Webcam[] = [
      cam({ id: 'city-link-close', lat: 25.0085, lng: 121.4955, kind: 'link', pageUrl: 'https://x.gov.tw' }),
      cam({ id: 'highway-snapshot-farther', lat: 25.015, lng: 121.49 }),
    ]

    const result = selectNearbyWebcams(DINO_PARK, webcams)
    const road = result.filter((e) => e.road)

    // link 卡片距離更近，但快照鏡頭排前面，因為 link 只能外開、不能直接看到畫面
    expect(road[0].cam.id).toBe('highway-snapshot-farther')
    expect(road[1].cam.id).toBe('city-link-close')
  })

  it('現場鏡頭依距離排序,最近的在最前面(顯示端由 WebcamList 依 MAX_SHOWN 裁切,故意保留多筆讓失效時可遞補)', () => {
    const webcams: Webcam[] = [
      cam({ id: 'seed-far', lat: 25.0086, lng: 121.4952 }),
      cam({ id: 'seed-near', lat: 25.00821, lng: 121.49512 }),
      cam({ id: 'seed-mid', lat: 25.0084, lng: 121.4952 }),
    ]

    const result = selectNearbyWebcams(DINO_PARK, webcams)
    const scenicIds = result.filter((e) => !e.road && !e.panorama).map((e) => e.cam.id)

    expect(scenicIds).toEqual(['seed-near', 'seed-mid', 'seed-far'])
  })
})

describe('haversineKm', () => {
  it('相同座標距離為 0', () => {
    expect(haversineKm({ lat: 25, lng: 121 }, { lat: 25, lng: 121 })).toBe(0)
  })

  it('已知距離的合理性(台北車站到板橋車站約 6-7km)', () => {
    const taipei = { lat: 25.0478, lng: 121.517 }
    const banqiao = { lat: 25.0142, lng: 121.4625 }
    const km = haversineKm(taipei, banqiao)
    expect(km).toBeGreaterThan(5)
    expect(km).toBeLessThan(8)
  })
})

describe('matchCongestionToRoadCams', () => {
  const section = (overrides: Partial<CongestedSection> & Pick<CongestedSection, 'id' | 'lat' | 'lng'>): CongestedSection => ({
    road: '國道測試',
    name: '測試路段',
    speed: 30,
    ...overrides,
  })

  it('直線走廊會漏掉繞行國道,必須用路由折線比對', () => {
    // 模擬台北→台中的弧形路線(經新竹外海一帶繞),壅塞點在路線中段
    const routes: [number, number][][] = [
      [
        [121.5, 25.05],
        [121.0, 24.8],
        [120.9, 24.5],
        [120.68, 24.15],
      ],
    ]
    const congestedOnRoute = section({ id: 'a', lat: 24.8, lng: 121.0, speed: 20 })
    const congestedOffRoute = section({ id: 'b', lat: 24.75, lng: 121.75, speed: 10 }) // 宜蘭方向,不在路線上

    const roadCams: Webcam[] = [cam({ id: 'highway-near-a', lat: 24.8, lng: 121.0 })]

    const result = matchCongestionToRoadCams([congestedOnRoute, congestedOffRoute], routes, roadCams, {
      corridorKm: 2,
      camMatchKm: 3,
      maxAlerts: 3,
    })

    expect(result).toHaveLength(1)
    expect(result[0].section.id).toBe('a')
  })

  it('壅塞路段車速由低到高排序、且遵守 maxAlerts 上限', () => {
    const routes: [number, number][][] = [[[121.0, 25.0], [121.0, 24.0]]]
    const sections = [
      section({ id: 'slow', lat: 24.5, lng: 121.0, speed: 15 }),
      section({ id: 'fast', lat: 24.7, lng: 121.0, speed: 38 }),
      section({ id: 'mid', lat: 24.3, lng: 121.0, speed: 25 }),
    ]
    const roadCams: Webcam[] = sections.map((s) => cam({ id: `cam-${s.id}`, lat: s.lat, lng: s.lng }))

    const result = matchCongestionToRoadCams(sections, routes, roadCams, {
      corridorKm: 5,
      camMatchKm: 3,
      maxAlerts: 2,
    })

    expect(result).toHaveLength(2)
    expect(result.map((r) => r.section.id)).toEqual(['slow', 'mid'])
  })

  it('每支鏡頭只配一次,不會重複配給多個壅塞路段', () => {
    const routes: [number, number][][] = [[[121.0, 25.0], [121.0, 24.0]]]
    const sections = [
      section({ id: 'a', lat: 24.5, lng: 121.0, speed: 20 }),
      section({ id: 'b', lat: 24.501, lng: 121.0, speed: 25 }),
    ]
    // 只有一支鏡頭,離兩個壅塞路段都很近
    const roadCams: Webcam[] = [cam({ id: 'shared-cam', lat: 24.5005, lng: 121.0 })]

    const result = matchCongestionToRoadCams(sections, routes, roadCams, {
      corridorKm: 5,
      camMatchKm: 3,
      maxAlerts: 3,
    })

    expect(result).toHaveLength(1)
  })
})
