import type { CongestedSection, Webcam, WebcamDataset } from '../data'
import { fetchPublicJson } from './fetchPublicJson'

export function haversineKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
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

/** 高公局／公路局／縣市政府的道路監視器；照的是路面，其餘（seed 風景區官方影像）才是現場實況 */
export function isRoadCam(cam: Webcam) {
  return cam.id.startsWith('freeway-') || cam.id.startsWith('highway-') || cam.id.startsWith('city-')
}

// 「現場」必須名符其實:只收真的在景點同一區的鏡頭
export const SCENIC_RADIUS_KM = 3
// 俯瞰型鏡頭(象山看臺北、硬漢嶺這類)照的是整個盆地/平原,遠一點仍能看天氣,
// 用大半徑當補位,但排在現場鏡頭後面且最多 1 支;室內景點不需要看區域天氣,不套用
export const PANORAMA_RADIUS_KM = 12
export const MAX_PANORAMA_SHOWN = 1
export const ROAD_RADIUS_KM = 4
export const MAX_SHOWN = 3
export const MAX_ROAD_SHOWN = 2
// 額外保留的路況備援:鏡頭常有斷線,列表顯示前 MAX_SHOWN 支「載得出來」的
export const ROAD_BACKUPS = 4

export type ScoredWebcam = { cam: Webcam; dist: number; road: boolean; panorama: boolean }

/**
 * 三層鏡頭挑選邏輯(現場 3km → 遠眺 12km 最多 1 支 → 路況 4km 含備援)。
 * 抽成純函式,不依賴 React,方便針對曾經出過的 bug(遠眺佔用現場名額、
 * 室內景點看到遠方風景)寫回歸測試。
 */
export function selectNearbyWebcams(
  anchor: { lat: number; lng: number; setting?: string | null },
  webcams: Webcam[],
): ScoredWebcam[] {
  const scored: ScoredWebcam[] = webcams.map((cam) => ({
    cam,
    dist: haversineKm(anchor, cam),
    road: isRoadCam(cam),
    panorama: cam.view === 'panorama',
  }))
  const byDist = (a: { dist: number }, b: { dist: number }) => a.dist - b.dist

  // 俯瞰型鏡頭照的是遠景,再近也不是「現場」(例:烘爐地距中和恐龍園區 2km,
  // 但畫面是山腰俯瞰),一律歸「遠眺」類,避免佔掉現場名額、擠掉真正有用的路況鏡頭
  const scenic = scored.filter((e) => !e.road && !e.panorama && e.dist <= SCENIC_RADIUS_KM).sort(byDist)

  const panorama =
    anchor.setting === '室內'
      ? []
      : scored
          .filter((e) => e.panorama && e.dist <= PANORAMA_RADIUS_KM)
          .sort(byDist)
          .slice(0, MAX_PANORAMA_SHOWN)

  // 路況鏡頭:有快照的(可直接顯示畫面)優先,link 播放頁其次;
  // 多留幾支備援,顯示時鏡頭失效可自動遞補,不會 3 支只剩 1 支
  const road = scored
    .filter((e) => e.road && e.dist <= ROAD_RADIUS_KM)
    .sort((a, b) => Number(a.cam.kind === 'link') - Number(b.cam.kind === 'link') || a.dist - b.dist)
    .slice(0, MAX_ROAD_SHOWN + ROAD_BACKUPS)

  return [...scenic, ...panorama, ...road]
}

export type RoutePoint = [number, number] // [lng, lat](GeoJSON 順序)

/** 點到路由折線的最短距離(km);等距圓柱近似,台灣尺度誤差可忽略 */
export function distanceToRoutesKm(point: { lat: number; lng: number }, routes: RoutePoint[][]): number {
  const ky = 110.57
  const kx = Math.cos(point.lat * (Math.PI / 180)) * 111.32
  let best = Infinity
  for (const route of routes) {
    for (let i = 1; i < route.length; i += 1) {
      const ax = (route[i - 1][0] - point.lng) * kx
      const ay = (route[i - 1][1] - point.lat) * ky
      const bx = (route[i][0] - point.lng) * kx
      const by = (route[i][1] - point.lat) * ky
      const dx = bx - ax
      const dy = by - ay
      const lenSq = dx * dx + dy * dy
      const t = lenSq > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq)) : 0
      const km = Math.hypot(ax + dx * t, ay + dy * t)
      if (km < best) best = km
    }
  }
  return best
}

export type CongestionAlert = {
  cam: Webcam
  dist: number
  section: CongestedSection
  note: string
}

/**
 * 把壅塞路段比對到路線走廊、再各自配上最近的高公局/公路局鏡頭。
 * 抽成純函式方便測試:曾經漏抓過「直線走廊漏掉繞行國道」「縣市路口鏡頭
 * 誤配到高架路段」這類問題,回歸測試比每次手動模擬可靠。
 */
export function matchCongestionToRoadCams(
  congested: CongestedSection[],
  routes: RoutePoint[][],
  roadCams: Webcam[],
  options: { corridorKm: number; camMatchKm: number; maxAlerts: number },
): CongestionAlert[] {
  const onCorridor = congested
    .map((section) => ({ section, km: distanceToRoutesKm(section, routes) }))
    .filter(({ km }) => km <= options.corridorKm)
    .sort((a, b) => a.section.speed - b.section.speed)

  const usedCams = new Set<string>()
  const items: CongestionAlert[] = []
  for (const { section } of onCorridor) {
    if (items.length >= options.maxAlerts) break
    let best: { cam: Webcam; dist: number } | null = null
    for (const cam of roadCams) {
      if (usedCams.has(cam.id)) continue
      const dist = haversineKm(section, cam)
      if (dist <= options.camMatchKm && (!best || dist < best.dist)) best = { cam, dist }
    }
    if (!best) continue
    usedCams.add(best.cam.id)
    const dirLabel = section.dir ? `(${section.dir})` : ''
    items.push({
      ...best,
      section,
      note: `${section.road}${dirLabel} ${section.name}・目前車速約 ${section.speed} km/h`,
    })
  }
  return items
}

// 監視器清單一個 session 只抓一次，之後開任何景點詳情都直接重用
let webcamsPromise: Promise<Webcam[]> | null = null
export function loadWebcams(): Promise<Webcam[]> {
  if (!webcamsPromise) {
    // 清單每天更新、串流網址會失效，不能用 force-cache 無限期快取
    webcamsPromise = fetchPublicJson<WebcamDataset>('data/webcams.json', { cache: 'default' })
      .then((dataset) => dataset.webcams ?? [])
      .catch(() => {
        webcamsPromise = null
        return []
      })
  }
  return webcamsPromise
}
