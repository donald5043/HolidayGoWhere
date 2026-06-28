import { useState } from 'react'
import { ageOptions } from '../data'

export const regions = ['全部', '北部', '中部', '南部', '東部', '離島'] as const
export const settings = ['全部', '室內', '室外', '室內外'] as const
export const durations = ['全部', '半日', '一日', '晚上'] as const

export function useFilters() {
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<(typeof regions)[number]>('全部')
  const [age, setAge] = useState<(typeof ageOptions)[number]['value']>('all')
  const [setting, setSetting] = useState<(typeof settings)[number]>('全部')
  const [duration, setDuration] = useState<(typeof durations)[number]>('全部')
  const [rainyOnly, setRainyOnly] = useState(false)
  const [eventOnly, setEventOnly] = useState(false)
  const [restaurantOnly, setRestaurantOnly] = useState(false)

  return {
    query, setQuery,
    region, setRegion,
    age, setAge,
    setting, setSetting,
    duration, setDuration,
    rainyOnly, setRainyOnly,
    eventOnly, setEventOnly,
    restaurantOnly, setRestaurantOnly,
  }
}
