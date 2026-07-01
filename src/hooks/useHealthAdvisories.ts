import { useEffect, useMemo, useState } from 'react'
import type { HealthAdvisory } from '../data'
import { fetchPublicJson } from '../lib/fetchPublicJson'

type HealthAdvisoryPayload = {
  schemaVersion: number
  generatedAt: string
  sourcePolicy: string
  advisories: HealthAdvisory[]
}

function ageToMonths(age: string) {
  if (age === '0-2') return { min: 0, max: 35 }
  if (age === '3-5') return { min: 36, max: 71 }
  if (age === '6-12') return { min: 72, max: 155 }
  return null
}

function matchesAge(advisory: HealthAdvisory, age: string) {
  const range = ageToMonths(age)
  if (!range || advisory.applicableAges.length === 0) return true
  return advisory.applicableAges.some((item) => item.maxMonths >= range.min && item.minMonths <= range.max)
}

function matchesRegion(advisory: HealthAdvisory, region: string | null) {
  if (!region || advisory.regions.includes('全國')) return true
  return advisory.regions.includes(region)
}

export function useHealthAdvisories(age: string, region: string | null) {
  const [advisories, setAdvisories] = useState<HealthAdvisory[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    fetchPublicJson<HealthAdvisoryPayload>('data/health-advisories.json')
      .then((payload) => {
        if (cancelled) return
        setAdvisories(payload.advisories || [])
        setStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setAdvisories([])
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const visibleAdvisories = useMemo(
    () => advisories
      .filter((advisory) => matchesAge(advisory, age) && matchesRegion(advisory, region))
      .sort((first, second) => {
        const severityRank = { elevated: 3, notice: 2, info: 1 }
        return severityRank[second.severity] - severityRank[first.severity]
      }),
    [advisories, age, region],
  )

  return { healthAdvisories: visibleAdvisories, healthAdvisoryStatus: status }
}
