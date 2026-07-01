import { Bell, CloudRain, Heart, LocateFixed, ShieldCheck, Sparkles, Utensils, X } from 'lucide-react'
import type { HealthAdvisory, WeatherSummary } from '../data'

function rainText(weather: WeatherSummary) {
  const current = `近1小時降雨 ${weather.precipitationProbability}%`
  const max = weather.dailyPrecipitationProbabilityMax
  if (typeof max === 'number' && max !== weather.precipitationProbability) {
    return `${current}・今日最高 ${max}%`
  }
  return current
}

export function NotificationSheet({
  weather,
  weatherStatus,
  nearbyCount,
  rainyCount,
  restaurantCount,
  favoritesCount,
  healthAdvisories,
  onClose,
  onRainy,
  onNearby,
  onRestaurants,
  onFavorites,
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
  const weatherLine = weather
    ? rainText(weather)
    : weatherStatus === 'loading'
      ? '正在取得你附近的天氣'
      : '開啟定位後會依天氣推薦'
  const rainyLine = weather
    ? `${weatherLine}${rainyCount ? `，可查看 ${rainyCount} 個雨天備案` : ''}`
    : weatherLine
  const healthAdvisory = healthAdvisories[0]

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
            <h2>Q胖幫你盯一下出門重點</h2>
            <p>把天氣、距離、收藏和爸媽休息備案整理成可以立刻出發的提醒。</p>
          </div>
        </div>

        <div className="notification-list">
          <article className={`notification-card ${isRainy ? 'is-urgent' : ''}`}>
            <span className="notification-card-icon"><CloudRain size={19} /></span>
            <div>
              <strong>{weather ? `${weather.label}・${Math.round(weather.temperature)}°C` : '天氣提醒'}</strong>
              <p>{rainyLine}</p>
            </div>
            <button onClick={() => runAction(onRainy)}>{isRainy ? '看雨備' : '雨天備案'}</button>
          </article>

          {healthAdvisory && (
            <article className={`notification-card health-notification severity-${healthAdvisory.severity}`}>
              <span className="notification-card-icon"><ShieldCheck size={19} /></span>
              <div>
                <strong>Q媽衛教提醒</strong>
                <p>{healthAdvisory.title}：{healthAdvisory.action}</p>
              </div>
              <a href={healthAdvisory.source.url} target="_blank" rel="noreferrer">看來源</a>
            </article>
          )}

          <article className="notification-card">
            <span className="notification-card-icon"><LocateFixed size={19} /></span>
            <div>
              <strong>附近靈感</strong>
              <p>{nearbyCount ? `附近 15 公里已有 ${nearbyCount} 個候選地點` : '用目前位置重新整理附近景點'}</p>
            </div>
            <button onClick={() => runAction(onNearby)}>看附近</button>
          </article>

          <article className="notification-card">
            <span className="notification-card-icon"><Utensils size={19} /></span>
            <div>
              <strong>爸媽休息備案</strong>
              <p>{restaurantCount ? `目前有 ${restaurantCount} 個餐廳／咖啡廳候選` : '需要休息時，幫你載入附近餐廳'}</p>
            </div>
            <button onClick={() => runAction(onRestaurants)}>找餐廳</button>
          </article>

          <article className="notification-card">
            <span className="notification-card-icon"><Heart size={19} /></span>
            <div>
              <strong>週末候選清單</strong>
              <p>{favoritesCount ? `已收藏 ${favoritesCount} 個地點，可整理成半日行程` : '看到喜歡的景點，點愛心就能先收起來'}</p>
            </div>
            <button onClick={() => runAction(onFavorites)}>{favoritesCount ? '看收藏' : '去探索'}</button>
          </article>
        </div>

        <div className="notification-footer">
          <Sparkles size={15} />
          <span>提醒會依定位、收藏與天氣變動；實際天氣仍建議出門前再看官方或手機天氣。</span>
        </div>
      </aside>
    </div>
  )
}
