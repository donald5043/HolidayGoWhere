import { useCallback, useEffect, useRef, useState } from 'react'
import { Mascot } from './Mascot'

const POS_KEY = 'holiday-go-where:concierge-fab-pos'
const TAP_MAX_MOVE = 8 // px — 低於此距離視為點擊而非拖曳
const EDGE_MARGIN = 8

type Pos = { left: number; top: number }

function clampPos(pos: Pos, width: number, height: number): Pos {
  return {
    left: Math.min(Math.max(pos.left, EDGE_MARGIN), window.innerWidth - width - EDGE_MARGIN),
    top: Math.min(Math.max(pos.top, EDGE_MARGIN), window.innerHeight - height - EDGE_MARGIN),
  }
}

function loadPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Pos
    if (typeof parsed.left !== 'number' || typeof parsed.top !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

export function ConciergeFab({ onOpen }: { onOpen: () => void }) {
  const [pos, setPos] = useState<Pos | null>(loadPos)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dragging = useRef(false)
  const moved = useRef(false)
  const grabOffset = useRef({ x: 0, y: 0 })

  // 視窗大小改變（轉向等）時把按鈕拉回畫面內
  useEffect(() => {
    const onResize = () => {
      setPos((current) => {
        if (!current) return current
        const rect = buttonRef.current?.getBoundingClientRect()
        return clampPos(current, rect?.width ?? 120, rect?.height ?? 52)
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (pos) {
      try { localStorage.setItem(POS_KEY, JSON.stringify(pos)) } catch { /* ignore */ }
    }
  }, [pos])

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
    const next = clampPos(
      { left: event.clientX - grabOffset.current.x, top: event.clientY - grabOffset.current.y },
      rect.width,
      rect.height,
    )
    // 超過門檻才進入拖曳，避免手指微顫誤判
    if (!moved.current) {
      const current = pos ?? { left: rect.left, top: rect.top }
      if (Math.hypot(next.left - current.left, next.top - current.top) <= TAP_MAX_MOVE) return
      moved.current = true
    }
    setPos(next)
  }, [pos])

  const handlePointerUp = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    if (!moved.current) onOpen()
  }, [onOpen])

  return (
    <button
      ref={buttonRef}
      className="concierge-fab"
      style={pos ? { left: pos.left, top: pos.top, right: 'auto', bottom: 'auto' } : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      aria-label="開啟Q媽隨行管家（可拖曳移動）"
    >
      <Mascot variant="qBao" className="concierge-fab-face" alt="" loading="eager" />
      <span className="concierge-fab-label">問Q媽</span>
    </button>
  )
}
