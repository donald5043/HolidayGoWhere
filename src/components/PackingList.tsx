import { useState } from 'react'
import { Backpack, CheckSquare, ChevronDown, ChevronUp, RotateCcw, Square } from 'lucide-react'
import type { Place, WeatherSummary } from '../data'

type PackItem = { label: string; emoji: string }

function generateItems(place: Place, weather: WeatherSummary | null): PackItem[] {
  const items: PackItem[] = []
  const text = `${place.name} ${place.category} ${place.description ?? ''} ${place.highlights.join(' ')}`
  const hasBaby  = place.ageMin <= 2
  const isOut    = place.setting === '室外' || place.setting === '室內外'
  const isIn     = place.setting === '室內'
  const isRainy  = place.rainyDay || (weather !== null && (weather.precipitationProbability >= 45 || weather.weatherCode >= 51))
  const isHot    = weather !== null && weather.temperature >= 30
  const isBeach  = /海|沙灘|浮潛|游泳|水上/.test(text)
  const isNature = /農場|牧場|採摘|田|步道|登山|健行|森林/.test(text)

  // Always
  items.push(
    { label: '水壺／飲用水', emoji: '💧' },
    { label: '零食／點心', emoji: '🍪' },
    { label: '手機充飽電', emoji: '🔋' },
    { label: '現金／悠遊卡', emoji: '💳' },
  )

  if (hasBaby) {
    items.push(
      { label: '尿布（備多幾片）', emoji: '🍼' },
      { label: '濕紙巾', emoji: '🧻' },
      { label: '備用衣物', emoji: '👕' },
    )
  }

  if (isOut) {
    items.push(
      { label: '防曬乳', emoji: '☀️' },
      { label: '遮陽帽', emoji: '🧢' },
      { label: '防蚊液', emoji: '🦟' },
    )
  }

  if (isIn) {
    items.push({ label: '薄外套（室內冷氣）', emoji: '🧥' })
  }

  if (isRainy) {
    items.push(
      { label: '雨傘／雨衣', emoji: '☂️' },
      { label: '防水袋', emoji: '🎒' },
    )
  }

  if (isHot && isOut) {
    items.push({ label: '散熱噴霧／冰毛巾', emoji: '🧊' })
  }

  if (isBeach) {
    items.push(
      { label: '泳衣', emoji: '🩱' },
      { label: '毛巾', emoji: '🏖️' },
      { label: '防水手機套', emoji: '📱' },
    )
  }

  if (isNature) {
    items.push(
      { label: '防滑運動鞋', emoji: '👟' },
      { label: '長袖透氣上衣', emoji: '👚' },
    )
  }

  return items
}

const storageKey = (id: string) => `holiday-go-where:packing-${id}`

type Props = { place: Place; weather: WeatherSummary | null }

export function PackingList({ place, weather }: Props) {
  const items = generateItems(place, weather)
  const [checked, setChecked] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey(place.id))
      return raw ? new Set<string>(JSON.parse(raw)) : new Set()
    } catch { return new Set() }
  })
  const [open, setOpen] = useState(false)

  const toggle = (label: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      try { localStorage.setItem(storageKey(place.id), JSON.stringify([...next])) } catch {}
      return next
    })
  }

  const reset = (e: React.MouseEvent) => {
    e.stopPropagation()
    setChecked(new Set())
    try { localStorage.removeItem(storageKey(place.id)) } catch {}
  }

  const doneCount = items.filter((i) => checked.has(i.label)).length

  return (
    <div className="detail-section packing-list-section">
      <button className="packing-list-toggle" onClick={() => setOpen((o) => !o)}>
        <span className="packing-list-label"><Backpack size={16} />行前打包清單</span>
        <span className="packing-progress">
          <span className={`packing-count ${doneCount === items.length && doneCount > 0 ? 'is-done' : ''}`}>
            {doneCount}/{items.length}
          </span>
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>
      {open && (
        <div className="packing-list-body">
          <ul className="packing-items">
            {items.map((item) => (
              <li
                key={item.label}
                className={`packing-item${checked.has(item.label) ? ' is-checked' : ''}`}
                onClick={() => toggle(item.label)}
              >
                {checked.has(item.label) ? <CheckSquare size={15} /> : <Square size={15} />}
                <span>{item.emoji} {item.label}</span>
              </li>
            ))}
          </ul>
          {doneCount > 0 && (
            <button className="packing-reset" onClick={reset}>
              <RotateCcw size={11} /> 重置清單
            </button>
          )}
        </div>
      )}
    </div>
  )
}
