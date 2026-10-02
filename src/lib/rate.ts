import { useEffect, useState } from 'react'
import { THB_TO_INR } from './trip.ts'

const CACHE_KEY = 'thailand26:inr-rate'

export interface InrRate { rate: number; live: boolean; at: number | null }

async function fetchInrRate(): Promise<number | null> {
  const sources: (() => Promise<unknown>)[] = [
    async () => (await (await fetch('https://open.er-api.com/v6/latest/THB')).json())?.rates?.INR,
    async () => (await (await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/thb.json')).json())?.thb?.inr,
  ]
  for (const source of sources) {
    try {
      const value = await source()
      if (typeof value === 'number' && value > 0.5 && value < 100) return Math.round(value * 100) / 100
    } catch { void 0 }
  }
  return null
}

export function useInrRate(): InrRate {
  const [state, setState] = useState<InrRate>(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
      if (cached && typeof cached.rate === 'number') return cached as InrRate
    } catch { void 0 }
    return { rate: THB_TO_INR, live: false, at: null }
  })
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const rate = await fetchInrRate()
      if (cancelled || rate === null) return
      const next: InrRate = { rate, live: true, at: Date.now() }
      setState(next)
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)) } catch { void 0 }
    })()
    return () => { cancelled = true }
  }, [])
  return state
}
