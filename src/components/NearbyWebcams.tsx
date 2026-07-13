import { useEffect, useMemo, useRef, useState } from 'react'
import { Cctv, ExternalLink, Play, RefreshCw, Square } from 'lucide-react'
import type { Place, Webcam } from '../data'
import { haversineKm, isRoadCam, loadWebcams } from '../lib/webcams'
import { CollapsibleSection } from './CollapsibleSection'

// 「現場」必須名符其實:只收真的在景點同一區的鏡頭
const SCENIC_RADIUS_KM = 3
// 俯瞰型鏡頭(象山看臺北、硬漢嶺這類)照的是整個盆地/平原,遠一點仍能看天氣,
// 用大半徑當補位,但排在現場鏡頭後面且最多 1 支;室內景點不需要看區域天氣,不套用
const PANORAMA_RADIUS_KM = 12
const MAX_PANORAMA_SHOWN = 1
const ROAD_RADIUS_KM = 4
const MAX_SHOWN = 3
const MAX_ROAD_SHOWN = 2
const SNAPSHOT_REFRESH_MS = 20000
const LIVE_MAX_MS = 60000

function isMjpegUrl(url: string) {
  return /bmjpg|mjpg|mjpeg/i.test(url)
}

/** 靜態快照網址（單張 jpg）；mjpeg 不算 */
function snapshotUrlOf(cam: Webcam): string | null {
  if (cam.imageUrl && !isMjpegUrl(cam.imageUrl)) return cam.imageUrl
  return null
}

/** mjpeg 直播網址；舊版資料沒有 streamUrl 時從快照網址推導 */
function streamUrlOf(cam: Webcam): string | null {
  if (cam.streamUrl) return cam.streamUrl
  if (cam.imageUrl && isMjpegUrl(cam.imageUrl)) return cam.imageUrl
  if (cam.imageUrl?.endsWith('/snapshot')) return cam.imageUrl.slice(0, -'/snapshot'.length)
  return null
}

function formatDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} 公尺` : `${km.toFixed(1)} 公里`
}

function withCacheBust(url: string, tick: number) {
  return `${url}${url.includes('?') ? '&' : '?'}_t=${tick}`
}

// 沒有靜態快照、只有 mjpeg 串流的鏡頭（主要是國道）：
// 連上串流抓到第一幀就立刻斷線，畫到 canvas 當快照，避免持續吃流量
function StreamSnapshot({ url, tick, onFail }: { url: string; tick: number; onFail: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      const canvas = canvasRef.current
      if (canvas && img.naturalWidth > 0) {
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        canvas.getContext('2d')?.drawImage(img, 0, 0)
      }
      img.onload = null
      img.onerror = null
      img.src = ''
    }
    img.onerror = () => {
      img.onload = null
      img.onerror = null
      onFail()
    }
    img.src = withCacheBust(url, tick)
    return () => {
      img.onload = null
      img.onerror = null
      img.src = ''
    }
    // onFail 不進依賴：只在網址或刷新節拍改變時重抓
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick])

  return <canvas ref={canvasRef} className="webcam-frame" aria-label="即時影像快照" />
}

type FrameProps = {
  webcam: Webcam
  tick: number
  isLive: boolean
  liveStartedAt: number
  onToggleLive: () => void
  onFail: () => void
}

function WebcamFrame({ webcam, tick, isLive, liveStartedAt, onToggleLive, onFail }: FrameProps) {
  const [playingYoutube, setPlayingYoutube] = useState(false)

  if (webcam.kind === 'youtube' && webcam.youtubeId) {
    if (!playingYoutube) {
      return (
        <button
          className="webcam-frame webcam-youtube-poster"
          style={{ backgroundImage: `url(https://i.ytimg.com/vi/${webcam.youtubeId}/hqdefault.jpg)` }}
          onClick={() => setPlayingYoutube(true)}
          aria-label={`播放 ${webcam.name} 直播`}
        >
          <span className="webcam-play-badge"><Play size={18} fill="currentColor" /> 官方直播</span>
        </button>
      )
    }
    return (
      <iframe
        className="webcam-frame"
        src={`https://www.youtube-nocookie.com/embed/${webcam.youtubeId}?autoplay=1&mute=1`}
        title={`${webcam.name} 即時影像`}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    )
  }

  if (webcam.kind === 'link') {
    return webcam.pageUrl ? (
      <a className="webcam-frame webcam-link-card" href={webcam.pageUrl} target="_blank" rel="noreferrer">
        <Cctv size={20} />
        <span>開啟官方即時影像頁</span>
        <ExternalLink size={14} />
      </a>
    ) : null
  }

  const snapshotUrl = snapshotUrlOf(webcam)
  const streamUrl = streamUrlOf(webcam)
  if (!snapshotUrl && !streamUrl) return null

  const frame = isLive && streamUrl ? (
    <img
      className="webcam-frame"
      src={withCacheBust(streamUrl, liveStartedAt)}
      alt={`${webcam.name} 即時直播`}
      onError={onFail}
    />
  ) : snapshotUrl ? (
    <img
      className="webcam-frame"
      src={withCacheBust(snapshotUrl, tick)}
      alt={`${webcam.name} 即時影像`}
      onError={onFail}
    />
  ) : (
    <StreamSnapshot url={streamUrl!} tick={tick} onFail={onFail} />
  )

  if (!streamUrl) return frame

  return (
    <button
      className="webcam-frame-toggle"
      onClick={onToggleLive}
      aria-label={isLive ? `停止 ${webcam.name} 直播` : `播放 ${webcam.name} 直播`}
    >
      {frame}
      <span className={`webcam-live-badge${isLive ? ' is-live' : ''}`}>
        {isLive ? <><Square size={10} fill="currentColor" /> LIVE・點擊停止</> : <><Play size={10} fill="currentColor" /> 看直播</>}
      </span>
    </button>
  )
}

export type WebcamListItem = {
  cam: Webcam
  dist: number
  road: boolean
  /** 俯瞰型鏡頭,標成「遠眺」 */
  panorama?: boolean
  /** 取代「距離約 X」的自訂說明（塞車警示用：路段名與車速） */
  note?: string
  /** 標成紅色「壅塞」標籤 */
  alert?: boolean
}

export function WebcamList({ items }: { items: WebcamListItem[] }) {
  const [tick, setTick] = useState(() => Date.now())
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set())
  const [liveId, setLiveId] = useState<string | null>(null)
  const [liveStartedAt, setLiveStartedAt] = useState(0)

  // 快照每 20 秒自動更新；頁面在背景時暫停，也順便停掉直播
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') setTick(Date.now())
    }, SNAPSHOT_REFRESH_MS)
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') setLiveId(null)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // 直播最多 60 秒，自動停回快照，避免忘記關掉一直吃流量
  useEffect(() => {
    if (!liveId) return
    const timer = setTimeout(() => setLiveId(null), LIVE_MAX_MS)
    return () => clearTimeout(timer)
  }, [liveId, liveStartedAt])

  const toggleLive = (id: string) => {
    setLiveStartedAt(Date.now())
    setLiveId((current) => (current === id ? null : id))
  }

  const markFailed = (id: string) => {
    setFailedIds((current) => {
      const next = new Set(current)
      next.add(id)
      return next
    })
  }

  const refresh = () => {
    setFailedIds(new Set())
    setTick(Date.now())
  }

  const visible = items.filter(({ cam }) => !failedIds.has(cam.id))
  if (!visible.length) {
    return <p className="webcam-empty">影像來源暫時無法連線，稍後再試試。</p>
  }

  return (
    <>
      <div className="webcam-toolbar">
        <span>快照每 {SNAPSHOT_REFRESH_MS / 1000} 秒自動更新</span>
        <button className="webcam-refresh" onClick={refresh} aria-label="立即重新整理影像">
          <RefreshCw size={14} /> 立即更新
        </button>
      </div>
      <div className="webcam-list">
        {visible.map(({ cam, dist, road, panorama, note, alert }) => (
          <figure key={cam.id} className="webcam-card">
            <WebcamFrame
              webcam={cam}
              tick={tick}
              isLive={liveId === cam.id}
              liveStartedAt={liveStartedAt}
              onToggleLive={() => toggleLive(cam.id)}
              onFail={() => markFailed(cam.id)}
            />
            <figcaption>
              <strong>{cam.name}</strong>
              <span>
                <em className={`webcam-tag${alert ? ' is-jam' : road ? ' is-road' : panorama ? ' is-panorama' : ''}`}>
                  {alert ? '壅塞' : road ? '路況' : panorama ? '遠眺' : '現場'}
                </em>
                {note ?? `距離約 ${formatDistance(dist)}`}・{cam.source}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
      <small className="webcam-disclaimer">
        「現場」為景點 3 公里內的官方直播、「遠眺」為可看到整片區域天氣的俯瞰鏡頭、
        「路況」為附近公路監視器（照的是路面，僅供出發前參考車流）；
        可能短暫斷線或延遲，直播播放 60 秒後自動停止以節省流量。實際狀況以現場為準。
      </small>
    </>
  )
}

type Props = {
  anchor: Place
}

export function NearbyWebcams({ anchor }: Props) {
  const [webcams, setWebcams] = useState<Webcam[]>([])

  useEffect(() => {
    let active = true
    void loadWebcams().then((list) => {
      if (active) setWebcams(list)
    })
    return () => {
      active = false
    }
  }, [])

  const nearby = useMemo(() => {
    const scored = webcams.map((cam) => ({
      cam,
      dist: haversineKm(anchor, cam),
      road: isRoadCam(cam),
      panorama: cam.view === 'panorama',
    }))
    const byDist = (a: { dist: number }, b: { dist: number }) => a.dist - b.dist
    const scenic = scored.filter((e) => !e.road && e.dist <= SCENIC_RADIUS_KM).sort(byDist)
    const panorama =
      anchor.setting === '室內'
        ? []
        : scored
            .filter((e) => e.panorama && e.dist > SCENIC_RADIUS_KM && e.dist <= PANORAMA_RADIUS_KM)
            .sort(byDist)
            .slice(0, MAX_PANORAMA_SHOWN)
    const road = scored.filter((e) => e.road && e.dist <= ROAD_RADIUS_KM).sort(byDist)
    return [...scenic, ...panorama, ...road.slice(0, MAX_ROAD_SHOWN)].slice(0, MAX_SHOWN)
  }, [webcams, anchor])

  if (!nearby.length) return null

  const hasScenic = nearby.some((e) => !e.road)
  return (
    <CollapsibleSection
      icon={<Cctv size={16} />}
      title={hasScenic ? '現場天氣即時影像' : '沿途路況即時影像'}
      hint={`${nearby.length} 支・最近 ${formatDistance(nearby[0].dist)}`}
    >
      <WebcamList items={nearby} />
    </CollapsibleSection>
  )
}
