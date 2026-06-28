import { useEffect, useState } from 'react'
import type { AiInsight, Place } from '../data'

export function usePlaces() {
  const [places, setPlaces] = useState<Place[]>([])
  const [placeCache, setPlaceCache] = useState<Partial<Record<string, Place[]>>>({})
  const [aiInsights, setAiInsights] = useState<Record<string, AiInsight>>({})
  const [placesStatus, setPlacesStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let active = true
    import('../generated/places-featured.json')
      .then((module) => {
        if (!active) return
        const featured = module.default as Place[]
        setPlaces(featured)
        setPlaceCache({ 全部: featured })
        setPlacesStatus('ready')
      })
      .catch(() => {
        if (active) setPlacesStatus('error')
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    import('../generated/ai-insights.json')
      .then((module) => setAiInsights(module.default as Record<string, AiInsight>))
      .catch(() => setAiInsights({}))
  }, [])

  return { places, setPlaces, placeCache, setPlaceCache, aiInsights, placesStatus, setPlacesStatus }
}
