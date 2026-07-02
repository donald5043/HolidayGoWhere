import { useCallback, useEffect, useRef, useState } from 'react'
import { Mascot } from './Mascot'

const POS_KEY = 'holiday-go-where:concierge-fab-pos'
const TAP_MAX_MOVE = 8 // px — 低於此距離視為點擊而非拖曳
const EDGE_MARGIN = 8
const COLLAPSE_AFTER_MS = 4000

// side 決定展開方向：靠右半邊時以 right 定位，展開往左長，避免文字被螢幕切掉
type Pos = { left: number; top: number; right: number; side: 'left' | 'right' }

function clampCoord(value: number, size: number, viewport: number): number {
  return Math.min(Math.max(value, EDGE_MARGIN), viewport - size - EDGE_MARGIN)
}

function loadPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Pos>
    if (typeof parsed.left !== 'number' || typeof parsed.top !== 'number') return null
    return {
      left: parsed.left,
      top: parsed.top,
      right: typeof parsed.right === 'number' ? parsed.right : window.innerWidth - parsed.left - 54,
      side: parsed.side === 'right' ? 'right' : 'left',
    }
  } catch {
    return null
  }
}

export function ConciergeFab({ onOpen }: { onOpen: () => void }) {
  const [pos, setPos] = useState<Pos | null>(loadPos)
  const [expanded, setExpanded] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dragging = useRef(false)
  const moved = useRef(false)
  const grabOffset = useRef({ x: 0, y: 0 })
  const collapseTimer = useRef<number | null>(null)

  const armCollapse = useCallback(() => {
    if (collapseTimer.current != null) window.clearTimeout(collapseTimer.current)
    collapseTimer.current = window.setTimeout(() => setExpanded(false), COLLAPSE_AFTER_MS)
  }, [])

  useEffect(() => () => {
    if (collapseTimer.current != null) window.clearTimeout(collapseTimer.current)
  }, [])

  // 視窗大小改變（轉向等）時把按鈕拉回畫面內
  useEffect(() => {
    const onResize = () => {
      setPos((current) => {
        if (!current) return current
        const rect = buttonRef.current?.getBoundingClientRect()
        const width = rect?.width ?? 54
        const height = rect?.height ?? 54
        const left = clampCoord(current.left, width, window.innerWidth)
        return {
          ...current,
          left,
          top: clampCoord(current.top, height, window.innerHeight),
          right: Math.max(EDGE_MARGIN, window.innerWidth - left - width),
        }
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (pos && !isDragging) {
      try { localStorage.setItem(POS_KEY, JSON.stringify(pos)) } catch { /* ignore */ }
    }
  }, [pos, isDragging])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    dragging.current = true
    moved.current = false
    grabOffset.current = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging.current) return
    const rect = event.currentTarget.getBoundingClientRect()
    const left = clampCoord(event.clientX - grabOffset.current.x, rect.width, window.innerWidth)
    const top = clampCoord(event.clientY - grabOffset.current.y, rect.height, window.innerHeight)
    // 超過門檻才進入拖曳，避免手指微顫誤判
    if (!moved.current) {
      const start = { left: rect.left, top: rect.top }
      if (Math.hypot(left - start.left, top - start.top) <= TAP_MAX_MOVE) return
      moved.current = true
      setIsDragging(true)
    }
    // 拖曳期間以 left 跟隨手指
    setPos({ left, top, right: window.innerWidth - left - rect.width, side: 'left' })
  }, [])

  const handlePointerUp = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    if (moved.current) {
      // 拖曳結束：依落點決定展開方向（右半邊 → 往左展開）
      setIsDragging(false)
      const rect = buttonRef.current?.getBoundingClientRect()
      if (rect) {
        const onRightHalf = rect.left + rect.width / 2 > window.innerWidth / 2
        setPos({
          left: rect.left,
          top: rect.top,
          right: Math.max(EDGE_MARGIN, window.innerWidth - rect.right),
          side: onRightHalf ? 'right' : 'left',
        })
      }
      if (expanded) armCollapse()
      return
    }
    // 第一下展開顯示「問Q媽」，第二下才進入對話
    if (!expanded) {
      setExpanded(true)
      armCollapse()
    } else {
      setExpanded(false)
      onOpen()
    }
  }, [armCollapse, expanded, onOpen])

  const style = pos
    ? pos.side === 'right' && !isDragging
      ? { right: pos.right, top: pos.top, left: 'auto' as const, bottom: 'auto' as const }
      : { left: pos.left, top: pos.top, right: 'auto' as const, bottom: 'auto' as const }
    : undefined

  return (
    <button
      ref={buttonRef}
      className={`concierge-fab${expanded ? '' : ' is-collapsed'}`}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      aria-label={expanded ? '開啟Q媽隨行管家' : '展開問Q媽按鈕（可拖曳移動）'}
    >
      <Mascot variant="qBao" className="concierge-fab-face" alt="" loading="eager" />
      <span className="concierge-fab-label">問Q媽</span>
    </button>
  )
}
