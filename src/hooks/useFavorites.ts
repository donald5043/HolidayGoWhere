import { useEffect, useState } from 'react'

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('holiday-go-where:favorites') || '[]')
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem('holiday-go-where:favorites', JSON.stringify(favorites))
  }, [favorites])

  return [favorites, setFavorites] as const
}
