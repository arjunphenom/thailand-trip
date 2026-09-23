import { EMPTY_DATA, seedData } from './trip.ts'
import type { Mutation, SocketState, TripBackend } from './backend.ts'
import type { TripData } from './types.ts'

export type Connection = 'preview' | 'connecting' | 'connected' | 'reconnecting' | 'offline'
export interface TripSnapshot {
  data: TripData
  connection: Connection
  loading: boolean
  refreshing: boolean
  lastSynced: string | null
  error: string | null
  pending: string[]
}

export class TripStore {
  private snapshot: TripSnapshot
  private listeners = new Set<() => void>()
  private socketReady = false
  private stopped = false
  private generation = 0
  private refreshPromise: Promise<void> | null = null
  private refreshAgain = false
  private changeTimer: ReturnType<typeof setTimeout> | undefined
  private readonly backend: TripBackend | null
  private readonly online: () => boolean

  constructor(
    backend: TripBackend | null,
    online: () => boolean = () => typeof navigator === 'undefined' || navigator.onLine !== false,
  ) {
    this.backend = backend
    this.online = online
    this.snapshot = {
      data: backend ? structuredClone(EMPTY_DATA) : seedData(),
      connection: backend ? 'connecting' : 'preview', loading: !!backend,
      refreshing: false, lastSynced: null, error: null, pending: [],
    }
  }

  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private publish(patch: Partial<TripSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }

  private quietlyRefresh = () => { void this.refresh().catch(() => {}) }

  start = () => {
    this.stopped = false
    this.generation += 1
    const generation = this.generation
    if (!this.backend) return () => {}
    const unlisten = this.backend.listen(() => {
      if (this.stopped || generation !== this.generation) return
      clearTimeout(this.changeTimer)
      this.changeTimer = setTimeout(this.quietlyRefresh, 40)
    }, (status: SocketState) => {
      if (this.stopped || generation !== this.generation) return
      this.socketReady = status === 'SUBSCRIBED'
      this.publish({ connection: !this.online() ? 'offline' : this.socketReady ? 'connecting' : 'reconnecting' })
      if (this.socketReady) this.quietlyRefresh()
    })
    const wentOffline = () => this.publish({ connection: 'offline' })
    const wentOnline = () => {
      this.publish({ connection: 'reconnecting' })
      this.quietlyRefresh()
    }
    const becameVisible = () => { if (document.visibilityState === 'visible') this.quietlyRefresh() }
    if (typeof window !== 'undefined') {
      window.addEventListener('offline', wentOffline)
      window.addEventListener('online', wentOnline)
      window.addEventListener('focus', this.quietlyRefresh)
      document.addEventListener('visibilitychange', becameVisible)
    }
    this.quietlyRefresh()
    return () => {
      this.stopped = true
      this.generation += 1
      this.socketReady = false
      this.refreshPromise = null
      clearTimeout(this.changeTimer)
      unlisten()
      if (typeof window !== 'undefined') {
        window.removeEventListener('offline', wentOffline)
        window.removeEventListener('online', wentOnline)
        window.removeEventListener('focus', this.quietlyRefresh)
        document.removeEventListener('visibilitychange', becameVisible)
      }
    }
  }

  refresh = (): Promise<void> => {
    if (!this.backend) return Promise.resolve()
    if (!this.online()) {
      this.publish({ connection: 'offline', loading: false, refreshing: false, error: 'You are offline. Reconnect to sync the trip.' })
      return Promise.reject(new Error('No connection'))
    }
    if (this.refreshPromise) {
      this.refreshAgain = true
      return this.refreshPromise
    }
    const generation = this.generation
    this.publish({ refreshing: true })
    this.refreshPromise = (async () => {
      do {
        this.refreshAgain = false
        const data = await this.backend!.load()
        if (this.stopped || generation !== this.generation) return
        this.publish({
          data, lastSynced: new Date().toISOString(), error: null, loading: false,
          connection: !this.online() ? 'offline' : this.socketReady ? 'connected' : 'reconnecting',
        })
      } while (this.refreshAgain && !this.stopped && generation === this.generation)
    })().catch((error: unknown) => {
      if (!this.stopped && generation === this.generation) {
        this.publish({
          error: 'The trip could not be synced. Your last confirmed data is unchanged.',
          connection: this.online() ? 'reconnecting' : 'offline', loading: false,
        })
      }
      throw error
    }).finally(() => {
      if (generation === this.generation) {
        this.refreshPromise = null
        this.publish({ refreshing: false })
      }
    })
    return this.refreshPromise
  }

  private async write<Result>(key: string, operation: (backend: TripBackend) => Promise<Result>): Promise<Result> {
    if (!this.backend) throw new Error('This is a read-only preview. Connect Supabase to save changes.')
    if (!this.online()) {
      this.publish({ connection: 'offline' })
      throw new Error("Change didn't save. Reconnect and try again.")
    }
    if (this.snapshot.pending.includes(key)) throw new Error('That change is already saving.')
    this.publish({ pending: [...this.snapshot.pending, key] })
    try {
      const result = await operation(this.backend)
      await this.refresh().catch(() => {})
      return result
    } catch (error) {
      this.quietlyRefresh()
      throw error
    } finally {
      this.publish({ pending: this.snapshot.pending.filter((pending) => pending !== key) })
    }
  }

  mutate = (actor: string, action: Mutation, payload: object, key: string) =>
    this.write(key, (backend) => backend.mutate(actor, action, payload))

  addTraveller = (name: string, colour: string) =>
    this.write('travellers', (backend) => backend.addTraveller(name.trim(), colour))

  renameTraveller = (id: string, name: string) =>
    this.write('travellers', (backend) => backend.renameTraveller(id, name.trim()))
}