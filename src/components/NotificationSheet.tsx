import { ArrowRight, Bell, CloudRain, LocateFixed, ShieldCheck, Sparkles, SunMedium, X } from 'lucide-react'
import type { HealthAdvisory, WeatherSummary } from '../data'

function rainText(weather: WeatherSummary) {
  const current = `目前降雨率 ${weather.precipitationProbability}%`
  const max = weather.dailyPrecipitationProbabilityMax
  if (typeof max === 'number' && max !== weather.precipitationProbability) {
    return `${current}，今日最高約 ${max}%`
  }
  return current
}

function pickHealthAdvisory(advisories: HealthAdvisory[]) {
  if (!advisories.length) return null
  const today = new Date()
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()
  return advisories[seed % advisories.length]
}

export function NotificationSheet({
  weather,
  weatherStatus,
  nearbyCount,
  rainyCount,
  healthAdvisories,
  onClose,
  onRainy,
  onNearby,
}: {
  weather: WeatherSummary | null
  weatherStatus: 'idle' | 'loading' | 'ready' | 'error'
  nearbyCount: number
  rainyCount: number
  restaurantCount: number
  favoritesCount: number
  healthAdvisories: HealthAdvisory[]
  onClose: () => void
  onRainy: () => void
  onNearby: () => void
  onRestaurants: () => void
  onFavorites: () => void
}) {
  const isRainy = Boolean(weather && (weather.precipitationProbability >= 45 || weather.weatherCode >= 51))
  const healthAdvisory = pickHealthAdvisory(healthAdvisories)

  const runAction = (action: () => void) => {
    action()
    onClose()
  }

  return (
    <div className="modal-backdrop notification-backdrop" onClick={onClose}>
      <aside className="notification-sheet" onClick={(event) => event.stopPropagation()} aria-label="今日親子提醒">
        <button className="modal-close" onClick={onClose} aria-label="關閉"><X /></button>
        <div className="notification-hero">
          <span className="notification-hero-icon"><Bell size={20} /></span>
          <div>
            <span className="notification-kicker">今日提醒</span>
            <h2>出門前，Q胖幫你抓重點</h2>
            <p>這裡只放今天可能影響親子行程的小提醒；主要探索仍留給地圖與景點清單。</p>
          </div>
        </div>

        <div className="notification-list notification-list--digest">
          <article className={`notification-card ${isRainy ? 'is-urgent' : ''}`}>
            <span className="notification-card-icon">
              {isRainy ? <CloudRain size={19} /> : <SunMedium size={19} />}
            </span>
            <div>
              <strong>{weather ? `${weather.label}・${Math.round(weather.temperature)}°C` : '天氣資料準備中'}</strong>
              <p>
                {weather
                  ? isRainy
                    ? `${rainText(weather)}。今天優先看室內、停車近或能坐下休息的地點。`
                    : `${rainText(weather)}。天氣負擔較低，可安排戶外放電但仍記得補水。`
                  : weatherStatus === 'loading'
                    ? '正在取得地區天氣，稍後會更新今天適合的出遊方向。'
                    : '開啟定位後，提醒會更貼近你附近的天氣。'}
              </p>
            </div>
            <button onClick={() => runAction(isRainy ? onRainy : onNearby)}>
              {isRainy ? '看雨天備案' : '找附近'} <ArrowRight size={13} />
            </button>
          </article>

          {healthAdvisory && (
            <article className={`notification-card health-notification severity-${healthAdvisory.severity}`}>
              <span className="notification-card-icon"><ShieldCheck size={19} /></span>
              <div>
                <strong>Q媽行前小提醒</strong>
                <p>{healthAdvisory.title}。{healthAdvisory.action}</p>
              </div>
              <a href={healthAdvisory.source.url} target="_blank" rel="noreferrer">來源</a>
            </article>
          )}

          {!nearbyCount && (
            <article className="notification-card notification-card--soft">
              <span className="notification-card-icon"><LocateFixed size={19} /></span>
              <div>
                <strong>推薦還不夠貼近你</strong>
                <p>目前還沒有附近排序資料。允許定位後，地圖與清單會更像真正的「今天去哪」。</p>
              </div>
              <button onClick={() => runAction(onNearby)}>定位</button>
            </article>
          )}

          {isRainy && rainyCount > 0 && (
            <article className="notification-card notification-card--soft">
              <span className="notification-card-icon"><Sparkles size={19} /></span>
              <div>
                <strong>今天有 {rainyCount} 個雨天備案</strong>
                <p>已幫你保留室內、餐飲或停車較方便的選項，適合臨時改行程。</p>
              </div>
              <button onClick={() => runAction(onRainy)}>查看</button>
            </article>
          )}
        </div>

        <div className="notification-footer">
          <Sparkles size={15} />
          <span>提醒只做行前參考，不取代景點官方資訊、醫療建議或即時天氣警報。</span>
        </div>
      </aside>
    </div>
  )
}
