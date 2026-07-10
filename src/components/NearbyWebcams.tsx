import { useEffect, useMemo, useState } from 'react'
import { Cctv, ExternalLink, Play, RefreshCw } from 'lucide-react'
import type { Place, Webcam, WebcamDataset } from '../data'
import { fetchPublicJson } from '../lib/fetchPublicJson'

function haversineKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
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

const RADIUS_KM = 10
const MAX_SHOWN = 3

function formatDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} 公尺` : `${km.toFixed(1)} 公里`
}

function withCacheBust(url: string, tick: number) {
  return `${url}${url.includes('?') ? '&' : '?'}_t=${tick}`
}

type WebcamFrameProps = {
  webcam: Webcam
  tick: number
  onFail: (id: string) => void
}

function WebcamFrame({ webcam, tick, onFail }: WebcamFrameProps) {
  const [playing, setPlaying] = useState(false)

  if (webcam.kind === 'image' && webcam.imageUrl) {
    return (
      <img
        key={tick}
        className="webcam-frame"
        src={withCacheBust(webcam.imageUrl, tick)}
        alt={`${webcam.name} 即時影像`}
        loading="lazy"
        onError={() => onFail(webcam.id)}
      />
    )
  }

  if (webcam.kind === 'youtube' && webcam.youtubeId) {
    if (!playing) {
      return (
        <button
          className="webcam-frame webcam-youtube-poster"
          style={{ backgroundImage: `url(https://i.ytimg.com/vi/${webcam.youtubeId}/hqdefault.jpg)` }}
          onClick={() => setPlaying(true)}
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

  if (webcam.pageUrl) {
    return (
      <a className="webcam-frame webcam-link-card" href={webcam.pageUrl} target="_blank" rel="noreferrer">
        <Cctv size={20} />
        <span>開啟官方即時影像頁</span>
        <ExternalLink size={14} />
      </a>
    )
  }

  return null
}

type Props = {
  anchor: Place
}

export function NearbyWebcams({ anchor }: Props) {
  const [webcams, setWebcams] = useState<Webcam[]>([])
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set())
  const [tick, setTick] = useState(() => Date.now())

  useEffect(() => {
    fetchPublicJson<WebcamDataset>('data/webcams.json')
      .then((dataset) => setWebcams(dataset.webcams ?? []))
      .catch(() => {/* silent：沒有資料就不顯示區塊 */})
  }, [])

  const nearby = useMemo(() => {
    return webcams
      .filter((cam) => !failedIds.has(cam.id))
      .map((cam) => ({ cam, dist: haversineKm(anchor, cam) }))
      .filter(({ dist }) => dist <= RADIUS_KM)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, MAX_SHOWN)
  }, [webcams, failedIds, anchor])

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

  if (!nearby.length) return null

  return (
    <div className="detail-section nearby-webcams-section">
      <div className="webcam-heading">
        <h3><Cctv size={15} /> 附近即時影像・看現場天氣</h3>
        <button className="webcam-refresh" onClick={refresh} aria-label="重新整理影像">
          <RefreshCw size={14} /> 更新
        </button>
      </div>
      <div className="webcam-list">
        {nearby.map(({ cam, dist }) => (
          <figure key={cam.id} className="webcam-card">
            <WebcamFrame webcam={cam} tick={tick} onFail={markFailed} />
            <figcaption>
              <strong>{cam.name}</strong>
              <span>距離約 {formatDistance(dist)}・{cam.source}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <small className="webcam-disclaimer">
        影像為公路監視器與官方直播，可能短暫斷線或延遲；出發前參考現場天氣與路況即可，實際狀況以現場為準。
      </small>
    </div>
  )
}
