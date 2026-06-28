import { type ReactNode } from 'react'
import { CalendarDays, Clock3, Home, Layers, Moon, SunMedium } from 'lucide-react'
import { durations, settings } from '../hooks/useFilters'

const settingIcons: Partial<Record<(typeof settings)[number], ReactNode>> = {
  室內: <Home size={14} />,
  室外: <SunMedium size={14} />,
  室內外: <Layers size={14} />,
}
const durationIcons: Partial<Record<(typeof durations)[number], ReactNode>> = {
  半日: <Clock3 size={14} />,
  一日: <CalendarDays size={14} />,
  晚上: <Moon size={14} />,
}

export function FilterSheet({
  setting,
  duration,
  onSetting,
  onDuration,
  onClear,
}: {
  setting: (typeof settings)[number]
  duration: (typeof durations)[number]
  onSetting: (value: (typeof settings)[number]) => void
  onDuration: (value: (typeof durations)[number]) => void
  onClear: () => void
}) {
  return (
    <div className="advanced-filters">
      <div>
        <span className="filter-label"><SunMedium size={16} />空間類型</span>
        <div className="filter-pills">
          {settings.map((item) => (
          <button key={item} className={setting === item ? 'active' : ''} onClick={() => onSetting(item)}>
            {settingIcons[item]}{item}
          </button>
        ))}
        </div>
      </div>
      <div>
        <span className="filter-label"><Clock3 size={16} />可用時間</span>
        <div className="filter-pills">
          {durations.map((item) => (
          <button key={item} className={duration === item ? 'active' : ''} onClick={() => onDuration(item)}>
            {durationIcons[item]}{item}
          </button>
        ))}
        </div>
      </div>
      <button className="clear-button" onClick={onClear}>清除條件</button>
    </div>
  )
}
