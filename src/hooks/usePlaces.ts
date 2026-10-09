import { useEffect, useState } from 'react'
import type { Place } from '../data'
import { fetchPublicJson } from '../lib/fetchPublicJson'

export function usePlaces() {
  const [places, setPlaces] = useState<Place[]>([])
  const [placeCache, setPlaceCache] = useState<Partial<Record<string, Place[]>>>({})
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

  return { places, setPlaces, placeCache, setPlaceCache, placesStatus, setPlacesStatus }
}
