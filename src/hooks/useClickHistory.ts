import { useEffect, useState } from 'react'

export function useClickHistory() {
  const [clickHistory, setClickHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('holiday-go-where:click-history') || '[]') } catch { return [] }
  })

  useEffect(() => {
    localStorage.setItem('holiday-go-where:click-history', JSON.stringify(clickHistory))
  }, [clickHistory])

  return [clickHistory, setClickHistory] as const
}
