import { useEffect, useState } from 'react'
import type { ParentReport } from '../data'
import { supabase } from '../lib/supabase'
import { getDeviceId } from '../lib/deviceId'

export function useReports() {
  const [reports, setReports] = useState<Record<string, ParentReport>>(() => {
    try {
      return JSON.parse(localStorage.getItem('holiday-go-where:reports') || '{}')
    } catch {
      return {}
    }
  })

  useEffect(() => {
    localStorage.setItem('holiday-go-where:reports', JSON.stringify(reports))
  }, [reports])

  useEffect(() => {
    if (!supabase) return
    const deviceId = getDeviceId()
    supabase.from('reports').select('*').eq('device_id', deviceId).then(({ data }) => {
      if (!data || data.length === 0) return
      setReports((current) => {
        const merged = { ...current }
        for (const row of data) {
          merged[row.place_id] = {
            visitedAt: row.visited_at,
            liked: row.liked,
            note: row.note,
            amenities: row.amenities ?? {},
            updatedAt: row.updated_at,
          }
        }
        return merged
      })
    })
  }, [])

  return [reports, setReports] as const
}
