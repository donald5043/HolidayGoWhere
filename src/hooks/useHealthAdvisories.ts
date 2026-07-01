import { useEffect, useMemo, useState } from 'react'
import type { HealthAdvisory } from '../data'
import { fetchPublicJson } from '../lib/fetchPublicJson'

type HealthAdvisoryPayload = {
  schemaVersion: number
  generatedAt: string
  sourcePolicy: string
  syncStatus?: {
    cdc?: {
      freshAdvisories: number
      fallbackAdvisories: number
      failedDiseases: string[]
      attempts?: {
        diseaseName: string
        dataGovDatasetId?: number
        metadataVerified?: boolean
        dataset?: string
        metadataUrl?: string
        resourceUrl?: string
        usedUrl?: string
        resourceFormat?: string
        records?: number
        ok: boolean
        error?: string
      }[]
    }
  }
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
  const [payload, setPayload] = useState<HealthAdvisoryPayload | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  useEffect(() => {
    let cancelled = false
    const dailyVersion = new Date().toISOString().slice(0, 10)
    setStatus('loading')
    fetchPublicJson<HealthAdvisoryPayload>(`data/health-advisories.json?v=${dailyVersion}`, { cache: 'no-cache' })
      .then((payload) => {
        if (cancelled) return
        setPayload(payload)
        setAdvisories(payload.advisories || [])
        setStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setPayload(null)
        setAdvisories([])
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const visibleAdvisories = useMemo(
    () => {
      const ageMatched = advisories.filter((advisory) => matchesAge(advisory, age))
      const regionMatched = ageMatched.filter((advisory) => matchesRegion(advisory, region))
      const fallbackMatched = regionMatched.length ? regionMatched : ageMatched
      return fallbackMatched.sort((first, second) => {
        const severityRank = { elevated: 3, notice: 2, info: 1 }
        return severityRank[second.severity] - severityRank[first.severity]
      })
    },
    [advisories, age, region],
  )

  return {
    healthAdvisories: visibleAdvisories,
    healthAdvisoryStatus: status,
    healthAdvisoryGeneratedAt: payload?.generatedAt ?? null,
    healthCdcStatus: payload?.syncStatus?.cdc ?? null,
  }
}
