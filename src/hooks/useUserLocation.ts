import { useState } from 'react'

export function useUserLocation() {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [locationMessage, setLocationMessage] = useState('')

  return {
    userLocation,
    setUserLocation,
    locationStatus,
    setLocationStatus,
    locationMessage,
    setLocationMessage,
  }
}
