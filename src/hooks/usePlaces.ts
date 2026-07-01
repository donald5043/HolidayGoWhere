import { useEffect, useState } from 'react'
import type { AiInsight, Place } from '../data'
import { fetchPublicJson } from '../lib/fetchPublicJson'

export function usePlaces() {
  const [places, setPlaces] = useState<Place[]>([])
  const [placeCache, setPlaceCache] = useState<Partial<Record<string, Place[]>>>({})
  const [aiInsights, setAiInsights] = useState<Record<string, AiInsight>>({})
  const [placesStatus, setPlacesStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let active = true
    fetchPublicJson<Place[]>('data/places-featured.json')
      .then((featured) => {
        if (!active) return
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
    fetchPublicJson<Record<string, AiInsight>>('data/ai-insights.json')
      .then((insights) => setAiInsights(insights))
      .catch(() => setAiInsights({}))
  }, [])

  return { places, setPlaces, placeCache, setPlaceCache, aiInsights, placesStatus, setPlacesStatus }
}
