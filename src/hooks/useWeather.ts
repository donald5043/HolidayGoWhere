import { useCallback, useState } from 'react'
import type { WeatherSummary } from '../data'

function weatherLabel(code: number) {
  if (code === 0) return '晴朗'
  if (code <= 3) return '多雲'
  if (code <= 48) return '有霧'
  if (code <= 67 || code >= 80) return '降雨'
  return '天氣穩定'
}

function nearestHourlyProbability(payload: {
  current?: { time?: string }
  hourly?: { time?: string[]; precipitation_probability?: Array<number | null> }
}) {
  const times = payload.hourly?.time ?? []
  const values = payload.hourly?.precipitation_probability ?? []
  if (!times.length || !values.length) return null

  const currentTime = payload.current?.time
  const exactIndex = currentTime ? times.indexOf(currentTime) : -1
  if (exactIndex >= 0 && values[exactIndex] !== null && values[exactIndex] !== undefined) {
    return Number(values[exactIndex])
  }

  const now = currentTime ? Date.parse(currentTime) : Date.now()
  let bestIndex = -1
  let bestDistance = Number.POSITIVE_INFINITY

  for (let index = 0; index < times.length; index += 1) {
    if (values[index] === null || values[index] === undefined) continue
    const distance = Math.abs(Date.parse(times[index]) - now)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  }

  return bestIndex >= 0 ? Number(values[bestIndex]) : null
}

async function fetchWeather(lat: number, lng: number): Promise<WeatherSummary> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('current', 'temperature_2m,weather_code')
  url.searchParams.set('hourly', 'precipitation_probability')
  url.searchParams.set('daily', 'precipitation_probability_max')
  url.searchParams.set('timezone', 'Asia/Taipei')
  url.searchParams.set('forecast_days', '1')

  const response = await fetch(url)
  if (!response.ok) throw new Error('weather')

  const payload = await response.json()
  const currentHourProbability = nearestHourlyProbability(payload)
  const dailyMaxProbability = Number(payload.daily?.precipitation_probability_max?.[0] || 0)

  return {
    temperature: Number(payload.current?.temperature_2m || 0),
    weatherCode: Number(payload.current?.weather_code || 0),
    precipitationProbability: currentHourProbability ?? dailyMaxProbability,
    dailyPrecipitationProbabilityMax: dailyMaxProbability,
    precipitationProbabilitySource: currentHourProbability === null ? 'daily-max' : 'current-hour',
    label: weatherLabel(Number(payload.current?.weather_code || 0)),
    fetchedAt: new Date().toISOString(),
  }
}

export function useWeather() {
  const [weather, setWeather] = useState<WeatherSummary | null>(null)
  const [weatherStatus, setWeatherStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  const loadWeather = useCallback(
    (lat: number, lng: number, shouldApply: () => boolean = () => true) => {
      setWeatherStatus((current) => current === 'ready' ? current : 'loading')
      void fetchWeather(lat, lng)
        .then((summary) => {
          if (!shouldApply()) return
          setWeather(summary)
          setWeatherStatus('ready')
        })
        .catch(() => setWeatherStatus('error'))
    },
    [],
  )

  return { weather, weatherStatus, loadWeather }
}
