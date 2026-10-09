import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { createBackend, friendlyError } from './backend.ts'
import { TripStore } from './store.ts'
import type { TripSnapshot } from './store.ts'
import { todayKey } from './trip.ts'
import type { Traveller } from './types.ts'

const IDENTITY_KEY = 'thailand26:traveller'
interface TripContextValue extends TripSnapshot {
  store: TripStore
  me: Traveller | null
  today: string
  chooseIdentity: (id: string) => void
  save: (operation: () => Promise<unknown>, success?: string) => Promise<boolean>
}

const TripContext = createContext<TripContextValue | null>(null)

export function TripProvider({ children, userId }: { children: ReactNode; userId?: string | null }) {
  const [store] = useState(() => new TripStore(createBackend(), undefined, userId ? `thailand26:offline:${userId}` : undefined))
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [identity, setIdentity] = useState<string | null>(() => {
    try { return localStorage.getItem(IDENTITY_KEY) } catch { return null }
  })
  const [today, setToday] = useState(todayKey)
  useEffect(() => store.start(), [store])
  useEffect(() => {
    const timer = setInterval(() => setToday(todayKey()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const chooseIdentity = (id: string) => {
    setIdentity(id)
    try { localStorage.setItem(IDENTITY_KEY, id) } catch { toast('Your name is remembered for this visit only.') }
  }
  const save = async (operation: () => Promise<unknown>, success?: string) => {
    try {
      await operation()
      if (success) toast.success(success)
      return true
    } catch (error) {
      toast.error(friendlyError(error))
      return false
    }
  }
  return <TripContext.Provider value={{
    ...snapshot, store, today, chooseIdentity, save,
    me: snapshot.data.travellers.find((traveller) => traveller.id === identity) ?? null,
  }}>{children}</TripContext.Provider>
}

export function useTrip() {
  const context = useContext(TripContext)
  if (!context) throw new Error('TripProvider is missing.')
  return context
}