import { useEffect, useState } from 'react'

export interface CityWeather { city: string; temp: number | null; code: number | null }

const CITIES = [
  { city: 'Phuket', lat: 7.88, lon: 98.39 },
  { city: 'Pattaya', lat: 12.93, lon: 100.88 },
  { city: 'Bangkok', lat: 13.76, lon: 100.5 },
]
const CACHE_KEY = 'thailand26:weather'

export function weatherLabel(code: number | null): { icon: string; text: string } {
  if (code === null) return { icon: '•', text: '—' }
  if (code === 0) return { icon: '☀️', text: 'Clear' }
  if (code <= 3) return { icon: '⛅', text: 'Cloudy' }
  if (code <= 48) return { icon: '🌫️', text: 'Fog' }
  if (code <= 67) return { icon: '🌧️', text: 'Rain' }
  if (code <= 77) return { icon: '🌨️', text: 'Snow' }
  if (code <= 82) return { icon: '🌦️', text: 'Showers' }
  return { icon: '⛈️', text: 'Storm' }
}

export function useWeather(): CityWeather[] {
  const [data, setData] = useState<CityWeather[]>(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
      if (Array.isArray(cached)) return cached as CityWeather[]
    } catch { void 0 }
    return CITIES.map((entry) => ({ city: entry.city, temp: null, code: null }))
  })
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const lat = CITIES.map((entry) => entry.lat).join(',')
        const lon = CITIES.map((entry) => entry.lon).join(',')
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`)
        const json = await response.json()
        const list = Array.isArray(json) ? json : [json]
        const next = CITIES.map((entry, index) => ({
          city: entry.city,
          temp: typeof list[index]?.current?.temperature_2m === 'number' ? Math.round(list[index].current.temperature_2m) : null,
          code: typeof list[index]?.current?.weather_code === 'number' ? list[index].current.weather_code : null,
        }))
        if (cancelled) return
        setData(next)
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)) } catch { void 0 }
      } catch { void 0 }
    })()
    return () => { cancelled = true }
  }, [])
  return data
}
