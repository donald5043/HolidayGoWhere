import { useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, Clock3, MapPin, Navigation, PlusCircle, Share2, Trash2, X } from 'lucide-react'
import type { Place } from '../data'

type Props = {
  favoritePlaces: Place[]
  userLocation: { lat: number; lng: number } | null
  onOpenPlace: (place: Place) => void
  onClose: () => void
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = (b.lat - a.lat) * (Math.PI / 180)
  const dLng = (b.lng - a.lng) * (Math.PI / 180)
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * (Math.PI / 180)) * Math.cos(b.lat * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(x))
}

const DURATION_MINUTES: Record<string, number> = { 半日: 180, 一日: 360, 晚上: 120 }

function fmt(totalMin: number) {
  const h = Math.floor(totalMin / 60) % 24
  const m = totalMin % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function ItineraryPlanner({ favoritePlaces, userLocation, onOpenPlace, onClose }: Props) {
  // Start empty — user picks which favorites to include today
  const [order, setOrder] = useState<string[]>([])
  const placeMap = new Map(favoritePlaces.map((p) => [p.id, p]))
  const ordered = order.map((id) => placeMap.get(id)).filter((p): p is Place => Boolean(p))
  const pool = favoritePlaces.filter((p) => !order.includes(p.id))

  const add = (id: string) => setOrder((prev) => [...prev, id])
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

  // Build timeline: departure at 09:00
  const START = 9 * 60
  type Stop = { place: Place; arriveMin: number; stayMin: number; travelMin: number }
  const stops: Stop[] = []
  let cursor = START
  for (let i = 0; i < ordered.length; i++) {
    const place = ordered[i]
    const from = i > 0 ? ordered[i - 1] : userLocation ?? null
    const travelMin = from ? Math.round((haversineKm(from, place) / 38) * 60) : 0
    cursor += travelMin
    const stayMin = DURATION_MINUTES[place.duration] ?? 180
    stops.push({ place, arriveMin: cursor, stayMin, travelMin })
    cursor += stayMin
  }

  const lastStop = stops[stops.length - 1]
  const endMin = lastStop ? lastStop.arriveMin + lastStop.stayMin : START
  const totalHr = stops.length ? ((endMin - START) / 60).toFixed(1) : '0'
  // Warn if itinerary exceeds ~20:00
  const isTooLong = stops.length > 0 && endMin > 20 * 60

  const buildShareText = () =>
    [
      `🗓️ 今日親子行程（共 ${totalHr} 小時）`,
      ...stops.map((s, i) => `${i + 1}. ${fmt(s.arriveMin)} 抵達${s.place.name}（${s.place.city}）`),
      `預計結束 ${fmt(endMin)}`,
    ].join('\n')

  const share = () => {
    const text = buildShareText()
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

      {ordered.length === 0 ? (
        <p className="itinerary-empty">尚未加入任何景點，點擊下方「+」開始規劃。</p>
      ) : (
        <>
          <ol className="itinerary-stops">
            {stops.map(({ place, arriveMin, stayMin, travelMin }, i) => (
              <li key={place.id} className="itinerary-stop">
                {i > 0 && travelMin > 0 && (
                  <div className="itinerary-travel">
                    <Navigation size={10} />
                    <span>車程約 {travelMin} 分鐘</span>
                  </div>
                )}
                <div className="itinerary-stop-card" onClick={() => onOpenPlace(place)}>
                  <div className="itinerary-stop-time">
                    <strong>{fmt(arriveMin)}</strong>
                    <span>{(stayMin / 60).toFixed(1)}hr</span>
                  </div>
                  <div className="itinerary-stop-info">
                    <strong>{place.name}</strong>
                    <span><MapPin size={10} />{place.city}・{place.setting}</span>
                  </div>
                  <div className="itinerary-stop-reorder" onClick={(e) => e.stopPropagation()}>
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
            <span>預計結束 {fmt(endMin)}</span>
            {isTooLong && (
              <span className="itinerary-overload">
                <AlertTriangle size={12} /> 行程超過 20:00，建議減少景點
              </span>
            )}
          </div>
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
