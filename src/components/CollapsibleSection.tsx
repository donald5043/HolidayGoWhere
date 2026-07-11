import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

type Props = {
  icon?: ReactNode
  title: string
  /** 收合時顯示在右側的摘要（數量、狀態等） */
  hint?: ReactNode
  defaultOpen?: boolean
  className?: string
  children: ReactNode
}

// 詳情頁的收合區塊，視覺沿用 PackingList 的卡片樣式。
// 收合時不渲染 children，附近餐廳、即時影像等區塊的圖片與運算只在展開後發生。
export function CollapsibleSection({ icon, title, hint, defaultOpen = false, className, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`detail-section collapsible-section${className ? ` ${className}` : ''}`}>
      <button className="collapsible-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="collapsible-label">{icon}{title}</span>
        <span className="collapsible-meta">
          {hint && <span className="collapsible-hint">{hint}</span>}
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  )
}
