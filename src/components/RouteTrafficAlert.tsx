import { useEffect, useMemo, useState } from 'react'
import { TrafficCone } from 'lucide-react'
import type { Place, TrafficDataset, Webcam } from '../data'
import { haversineKm, loadWebcams, matchCongestionToRoadCams, type RoutePoint } from '../lib/webcams'
import { CollapsibleSection } from './CollapsibleSection'
import { WebcamList } from './NearbyWebcams'

// 壅塞清單由 GitHub Actions 每 10 分鐘從 TDX 更新後推到 live-traffic 分支;
// raw.githubusercontent.com 有 CORS * 且快取 5 分鐘,靜態站不需要任何後端
const TRAFFIC_URL = 'https://raw.githubusercontent.com/donald5043/HolidayGoWhere/live-traffic/traffic.json'
// 資料太舊代表同步停擺,寧可不顯示也不給過期路況
const MAX_AGE_MS = 30 * 60 * 1000
// 行程太短沒有上國道的意義、太長 OSRM 路由與資料量都吃緊
const MIN_TRIP_KM = 15
const MAX_TRIP_KM = 250
// 沿「實際開車路線」的走廊寬度;直線走廊會漏掉沿海岸弧行的國道(實測台北→台中
// 直線距離國1中途路段 25km),所以必須用 OSRM 路由折線來比對
const CORRIDOR_KM = 2
// 壅塞路段要在這個距離內找得到監視器才附畫面
const CAM_MATCH_KM = 3
const MAX_ALERTS = 3

// OSRM 公開示範伺服器:免金鑰、CORS *,含替代路線(同時涵蓋國1/國3 之類的選擇)
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving'

const routeCache = new Map<string, Promise<RoutePoint[][] | null>>()
function loadRoutes(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RoutePoint[][] | null> {
  // 使用者座標取到小數 2 位(約 1km)當快取鍵,避免 GPS 抖動重打路由
  const key = `${from.lat.toFixed(2)},${from.lng.toFixed(2)}:${to.lat.toFixed(5)},${to.lng.toFixed(5)}`
  let promise = routeCache.get(key)
  if (!promise) {
    const url = `${OSRM_URL}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&alternatives=true`
    promise = fetch(url, { signal: AbortSignal.timeout(10000) })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) =>
        payload?.code === 'Ok'
          ? (payload.routes as { geometry: { coordinates: RoutePoint[] } }[]).map((route) => route.geometry.coordinates)
          : null,
      )
      .catch(() => {
        routeCache.delete(key)
        return null
      })
    routeCache.set(key, promise)
  }
  return promise
}

let trafficPromise: Promise<TrafficDataset | null> | null = null
let trafficFetchedAt = 0
function loadTraffic(): Promise<TrafficDataset | null> {
  // raw 端快取 5 分鐘,本地也以 5 分鐘為週期重抓
  if (!trafficPromise || Date.now() - trafficFetchedAt > 5 * 60 * 1000) {
    trafficFetchedAt = Date.now()
    trafficPromise = fetch(TRAFFIC_URL, { cache: 'default' })
      .then((res) => (res.ok ? (res.json() as Promise<TrafficDataset>) : null))
      .catch(() => null)
  }
  return trafficPromise
}

type Props = {
  anchor: Place
  userLocation: { lat: number; lng: number } | null
}

export function RouteTrafficAlert({ anchor, userLocation }: Props) {
  const [traffic, setTraffic] = useState<TrafficDataset | null>(null)
  const [webcams, setWebcams] = useState<Webcam[]>([])
  const [routes, setRoutes] = useState<RoutePoint[][] | null>(null)

  const tripKm = userLocation ? haversineKm(userLocation, anchor) : 0
  const tripEligible = Boolean(userLocation) && tripKm >= MIN_TRIP_KM && tripKm <= MAX_TRIP_KM

  useEffect(() => {
    if (!tripEligible || !userLocation) return
    let active = true
    setRoutes(null)
    // 先確認有壅塞資料才打路由,避免對 OSRM 示範伺服器造成不必要流量
    void loadTraffic().then((data) => {
      if (!active) return
      setTraffic(data)
      if (!data?.congested?.length) return
      void loadRoutes(userLocation, anchor).then((result) => {
        if (active) setRoutes(result)
      })
    })
    void loadWebcams().then((list) => {
      if (active) setWebcams(list)
    })
    return () => {
      active = false
    }
    // userLocation 物件每次 render 可能是新參照,依賴用座標值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripEligible, anchor.id, userLocation?.lat, userLocation?.lng])

  const alerts = useMemo(() => {
    if (!tripEligible || !traffic?.congested?.length || !routes?.length) return []
    if (Date.now() - Date.parse(traffic.generatedAt) > MAX_AGE_MS) return []

    // 壅塞路段都在國道/快速公路上,佐證畫面限高公局/公路局鏡頭(縣市路口鏡頭照不到高架路面)
    const roadCams = webcams.filter(
      (cam) => cam.id.startsWith('freeway-') || cam.id.startsWith('highway-'),
    )
    const matched = matchCongestionToRoadCams(traffic.congested, routes, roadCams, {
      corridorKm: CORRIDOR_KM,
      camMatchKm: CAM_MATCH_KM,
      maxAlerts: MAX_ALERTS,
    })
    return matched.map((item) => ({ ...item, road: true, alert: true }))
  }, [tripEligible, traffic, routes, webcams])

  if (!alerts.length) return null

  return (
    <CollapsibleSection
      className="traffic-alert"
      icon={<TrafficCone size={16} />}
      title="前往路上有壅塞"
      hint={`${alerts.length} 個路段・最低 ${Math.min(...alerts.map((a) => a.section.speed))} km/h`}
      defaultOpen
    >
      <WebcamList items={alerts} />
      <small className="webcam-disclaimer">
        依你的位置規劃開車路線(含替代道路)比對沿途國道/快速公路車速,僅在偵測到壅塞時顯示;
        車速每 10 分鐘更新(TDX 高速公路局/公路局),實際路線請以導航為準。
      </small>
    </CollapsibleSection>
  )
}
