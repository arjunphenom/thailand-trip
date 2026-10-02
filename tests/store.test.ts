import { afterEach, describe, expect, it, vi } from 'vitest'
import { TripStore } from '../src/lib/store.ts'
import { seedData } from '../src/lib/trip.ts'
import type { SocketState, TripBackend } from '../src/lib/backend.ts'

function fixture() {
  let data = seedData()
  let change = () => {}
  let connection: (status: SocketState) => void = () => {}
  const backend: TripBackend = {
    load: vi.fn(async () => structuredClone(data)),
    listen: (changed, status) => {
      change = changed
      connection = status
      return vi.fn()
    },
    mutate: vi.fn(async () => 'saved'),
    addTraveller: vi.fn(async (name, colour) => ({ id: 'new', name, colour, budget_thb: null, created_at: new Date().toISOString() })),
    renameTraveller: vi.fn(async () => {}),
    setBudget: vi.fn(async () => {}),
    addExpense: vi.fn(async (expense) => ({ id: 'exp', created_at: new Date().toISOString(), ...expense })),
    deleteExpense: vi.fn(async () => {}),
    upsertLocation: vi.fn(async () => {}),
    clearLocation: vi.fn(async () => {}),
  }
  return {
    backend, emit: () => change(), connect: (status: SocketState) => connection(status),
    update: (update: (current: ReturnType<typeof seedData>) => void) => { data = structuredClone(data); update(data) },
  }
}

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); vi.useRealTimers() })

describe('shared state and failed writes', () => {
  it('makes the unconfigured preview explicitly read-only', async () => {
    const store = new TripStore(null)
    expect(store.getSnapshot().connection).toBe('preview')
    expect(store.getSnapshot().data.tasks).toHaveLength(22)
    await expect(store.mutate('actor', 'cycle_status', {}, 'task')).rejects.toThrow('read-only preview')
  })

  it('refreshes task, roster, completion and comment state when realtime changes arrive', async () => {
    vi.useFakeTimers()
    const fake = fixture()
    const store = new TripStore(fake.backend)
    cleanups.push(store.start())
    fake.connect('SUBSCRIBED')
    await store.refresh()
    expect(store.getSnapshot().connection).toBe('connected')
    fake.update((data) => {
      data.tasks[0].status = 'doing'
      data.travellers[1].name = 'Maya'
      data.task_completions.push({ id: 'completion', task_id: data.tasks[14].id, traveller_id: data.travellers[0].id, completed_at: new Date().toISOString() })
      data.comments.push({ id: 'comment', task_id: data.tasks[0].id, traveller_id: data.travellers[1].id, body: 'Got a quote.', created_at: new Date().toISOString() })
    })
    fake.emit()
    await vi.advanceTimersByTimeAsync(50)
    expect(store.getSnapshot().data.tasks[0].status).toBe('doing')
    expect(store.getSnapshot().data.travellers[1].name).toBe('Maya')
    expect(store.getSnapshot().data.task_completions).toHaveLength(1)
    expect(store.getSnapshot().data.comments).toHaveLength(1)
  })

  it('never shows an optimistic tick and preserves confirmed state if a write fails', async () => {
    const fake = fixture()
    let rejectWrite: (error: Error) => void = () => {}
    fake.backend.mutate = vi.fn(() => new Promise((_, reject) => { rejectWrite = reject }))
    const store = new TripStore(fake.backend)
    cleanups.push(store.start())
    await store.refresh()
    const task = store.getSnapshot().data.tasks[0]
    const write = store.mutate('actor', 'cycle_status', { task_id: task.id }, task.id)
    expect(store.getSnapshot().data.tasks[0].status).toBe('todo')
    expect(store.getSnapshot().pending).toContain(task.id)
    rejectWrite(new Error('Network failed'))
    await expect(write).rejects.toThrow('Network failed')
    expect(store.getSnapshot().data.tasks[0].status).toBe('todo')
    expect(store.getSnapshot().pending).toEqual([])
  })

  it('refuses offline writes without queueing or sending them later', async () => {
    const fake = fixture()
    const store = new TripStore(fake.backend, () => false)
    await expect(store.mutate('actor', 'cycle_status', {}, 'task')).rejects.toThrow("didn't save")
    expect(fake.backend.mutate).not.toHaveBeenCalled()
    expect(store.getSnapshot().connection).toBe('offline')
  })

  it('refetches after reconnect, covering changes missed while disconnected', async () => {
    const fake = fixture()
    const store = new TripStore(fake.backend)
    cleanups.push(store.start())
    await store.refresh()
    fake.connect('CHANNEL_ERROR')
    expect(store.getSnapshot().connection).toBe('reconnecting')
    fake.update((data) => { data.tasks[0].status = 'done' })
    fake.connect('SUBSCRIBED')
    await store.refresh()
    expect(store.getSnapshot().data.tasks[0].status).toBe('done')
    expect(store.getSnapshot().lastSynced).not.toBeNull()
  })

  it('can restart after React StrictMode cleanup', async () => {
    const fake = fixture()
    const store = new TripStore(fake.backend)
    const stop = store.start()
    stop()
    cleanups.push(store.start())
    fake.connect('SUBSCRIBED')
    await store.refresh()
    expect(store.getSnapshot().data.tasks).toHaveLength(22)
    expect(store.getSnapshot().loading).toBe(false)
  })
})