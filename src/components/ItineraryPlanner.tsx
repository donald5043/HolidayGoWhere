import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, Clock3, MapPin, Navigation, PlusCircle, Route, Share2, Trash2, X } from 'lucide-react'
import type { Place } from '../data'
import { trackActivity } from '../lib/activityLog'
import {
  buildGoogleMapsRouteUrl,
  buildItinerary,
  defaultStayMinutes,
  formatTime,
  optimizePlaceOrder,
  parseTime,
} from '../lib/itinerary'

type Props = {
  favoritePlaces: Place[]
  userLocation: { lat: number; lng: number } | null
  onOpenPlace: (place: Place) => void
  onClose: () => void
}

export function ItineraryPlanner({ favoritePlaces, userLocation, onOpenPlace, onClose }: Props) {
  // Start empty — user picks which favorites to include today
  const [order, setOrder] = useState<string[]>([])
  const [startTime, setStartTime] = useState('09:00')
  const [stayMinutes, setStayMinutes] = useState<Record<string, number>>({})
  const placeMap = new Map(favoritePlaces.map((p) => [p.id, p]))
  const ordered = order.map((id) => placeMap.get(id)).filter((p): p is Place => Boolean(p))
  const pool = favoritePlaces.filter((p) => !order.includes(p.id))

  const add = (id: string) => {
    setOrder((prev) => [...prev, id])
    const place = placeMap.get(id)
    if (place) setStayMinutes((current) => ({ ...current, [id]: current[id] ?? defaultStayMinutes(place) }))
  }
  const remove = (id: string) => setOrder((prev) => prev.filter((x) => x !== id))
  const move = (idx: number, dir: -1 | 1) => {
    setOrder((prev) => {
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  const startMin = parseTime(startTime)
  const stops = useMemo(
    () => buildItinerary(ordered, { start: userLocation, startMin, stayMinutes, transitionBufferMin: 15 }),
    [ordered, startMin, stayMinutes, userLocation],
  )

  const lastStop = stops[stops.length - 1]
  const endMin = lastStop?.departMin ?? startMin
  const totalHr = stops.length ? ((endMin - startMin) / 60).toFixed(1) : '0'
  // Warn if itinerary exceeds ~20:00
  const isTooLong = stops.length > 0 && endMin > 20 * 60
  const routeUrl = buildGoogleMapsRouteUrl(ordered, userLocation)

  const buildShareText = () =>
    [
      `🗓️ 今日親子行程（共 ${totalHr} 小時）`,
      ...stops.map((stop, index) => `${index + 1}. ${formatTime(stop.arriveMin)} 抵達${stop.place.name}（${stop.place.city}）`),
      `預計結束 ${formatTime(endMin)}`,
    ].join('\n')

  const share = () => {
    const text = buildShareText()
    trackActivity('itinerary_share')
    if (navigator.share) {
      void navigator.share({ title: '今日親子行程', text })
    } else {
      void navigator.clipboard?.writeText(text).then(() => alert('行程已複製到剪貼簿'))
    }
  }

  return (
    <div className="itinerary-planner">
      <div className="itinerary-head">
        <div className="itinerary-head-copy">
          <strong>今日行程</strong>
          {ordered.length > 0
            ? <span>{ordered.length} 個景點・約 {totalHr} 小時</span>
            : <span>從下方加入今日想去的景點</span>
          }
        </div>
        <div className="itinerary-head-actions">
          {ordered.length > 0 && (
            <button className="itinerary-share" onClick={share} aria-label="分享行程">
              <Share2 size={15} /> 分享
            </button>
          )}
          <button className="itinerary-close" onClick={onClose} aria-label="關閉行程規劃">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="itinerary-controls">
        <label>
          <Clock3 size={14} />出發時間
          <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
        </label>
        {ordered.length > 1 && (
          <button
            type="button"
            onClick={() => setOrder(optimizePlaceOrder(ordered, userLocation).map((place) => place.id))}
          >
            <Route size={14} />依距離排順序
          </button>
        )}
        {routeUrl && (
          <a href={routeUrl} target="_blank" rel="noreferrer" onClick={() => trackActivity('navigate')}>
            <Navigation size={14} />地圖路線
          </a>
        )}
      </div>

      {ordered.length === 0 ? (
        <p className="itinerary-empty">尚未加入任何景點，點擊下方「+」開始規劃。</p>
      ) : (
        <>
          <ol className="itinerary-stops">
            {stops.map(({ place, arriveMin, stayMin, travelMin, bufferMin }, i) => (
              <li key={place.id} className="itinerary-stop">
                {(travelMin > 0 || bufferMin > 0) && (
                  <div className="itinerary-travel">
                    <Navigation size={10} />
                    <span>預估車程 {travelMin} 分鐘{bufferMin > 0 ? `・轉場預留 ${bufferMin} 分鐘` : ''}</span>
                  </div>
                )}
                <div className="itinerary-stop-card" onClick={() => onOpenPlace(place)}>
                  <div className="itinerary-stop-time">
                    <strong>{formatTime(arriveMin)}</strong>
                    <span>{stayMin >= 60 ? `${stayMin / 60}hr` : `${stayMin}m`}</span>
                  </div>
                  <div className="itinerary-stop-info">
                    <strong>{place.name}</strong>
                    <span><MapPin size={10} />{place.city}・{place.setting}</span>
                  </div>
                  <div className="itinerary-stop-reorder" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={stayMin}
                      onChange={(event) => setStayMinutes((current) => ({ ...current, [place.id]: Number(event.target.value) }))}
                      aria-label={`${place.name}停留時間`}
                    >
                      <option value={60}>停留 1 小時</option>
                      <option value={90}>停留 1.5 小時</option>
                      <option value={120}>停留 2 小時</option>
                      <option value={180}>停留 3 小時</option>
                    </select>
                    <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="上移">
                      <ArrowUp size={12} />
                    </button>
                    <button onClick={() => move(i, 1)} disabled={i === ordered.length - 1} aria-label="下移">
                      <ArrowDown size={12} />
                    </button>
                    <button onClick={() => remove(place.id)} aria-label="移除" className="itinerary-remove">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <div className="itinerary-footer">
            <Clock3 size={12} />
            <span>預計結束 {formatTime(endMin)}</span>
            {isTooLong && (
              <span className="itinerary-overload">
                <AlertTriangle size={12} /> 行程超過 20:00，建議減少景點
              </span>
            )}
          </div>
          <p className="itinerary-estimate-note">車程為離線距離估算，已加入道路繞行與每站 15 分鐘轉場緩衝；即時路況與營業時間請於出發前確認。</p>
        </>
      )}

      {pool.length > 0 && (
        <div className="itinerary-pool">
          <p className="itinerary-pool-label">收藏景點</p>
          <ul className="itinerary-pool-list">
            {pool.map((place) => (
              <li key={place.id} className="itinerary-pool-item">
                <div className="itinerary-pool-info" onClick={() => onOpenPlace(place)}>
                  <span className="itinerary-pool-name">{place.name}</span>
                  <span className="itinerary-pool-meta"><MapPin size={10} />{place.city}・{place.duration}</span>
                </div>
                <button
                  className="itinerary-pool-add"
                  onClick={() => add(place.id)}
                  aria-label={`加入 ${place.name}`}
                >
                  <PlusCircle size={18} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
