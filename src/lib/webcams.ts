import type { Webcam, WebcamDataset } from '../data'
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

/** 高公局／公路局的路況鏡頭；其餘（seed 風景區、離島縣市）視為現場實況 */
export function isRoadCam(cam: Webcam) {
  return cam.id.startsWith('freeway-') || cam.id.startsWith('highway-')
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
