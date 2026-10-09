import { tripClient } from './client.ts'
import type { Expense, NewExpense, NewRepayment, Traveller, TripData } from './types.ts'

export type SocketState = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR'
export type Mutation = 'cycle_status' | 'update_task' | 'set_completion' | 'add_comment' | 'create_task'
export interface LivePosition { traveller_id: string; lat: number; lng: number; accuracy: number | null }

export interface TripBackend {
  load: () => Promise<TripData>
  listen: (changed: () => void, status: (state: SocketState) => void) => () => void
  mutate: (actor: string, action: Mutation, payload: object) => Promise<string>
  addTraveller: (name: string, colour: string) => Promise<Traveller>
  renameTraveller: (id: string, name: string) => Promise<void>
  setBudget: (id: string, budget: number | null) => Promise<void>
  addExpense: (expense: NewExpense) => Promise<Expense>
  deleteExpense: (id: string) => Promise<void>
  upsertLocation: (position: LivePosition) => Promise<void>
  clearLocation: (id: string) => Promise<void>
  addRepayment: (repayment: NewRepayment) => Promise<void>
  deleteRepayment: (id: string) => Promise<void>
}

const TABLES: (keyof TripData)[] = ['travellers', 'tasks', 'task_completions', 'comments', 'itinerary_days', 'activity', 'expenses', 'locations', 'repayments']

export function createBackend(): TripBackend | null {
  const client = tripClient
  if (!client) return null

  return {
    async load() {
      const timeout = AbortSignal.timeout(15_000)
      const results = await Promise.all([
        client.from('travellers').select('*').order('created_at').order('id').abortSignal(timeout),
        client.from('tasks').select('*').order('sort_order').order('id').abortSignal(timeout),
        client.from('task_completions').select('*').abortSignal(timeout),
        client.from('comments').select('*').order('created_at').order('id').abortSignal(timeout),
        client.from('itinerary_days').select('*').order('day_date').abortSignal(timeout),
        client.from('activity').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(20).abortSignal(timeout),
        client.from('expenses').select('*').order('spent_at', { ascending: false }).order('created_at', { ascending: false }).abortSignal(timeout),
        client.from('locations').select('*').abortSignal(timeout),
        client.from('repayments').select('*').order('created_at', { ascending: false }).abortSignal(timeout),
      ])
      const failure = results.find((result) => result.error)
      if (failure?.error) throw failure.error
      return Object.fromEntries(TABLES.map((table, index) => [table, results[index].data ?? []])) as unknown as TripData
    },
    listen(changed, status) {
      let channel = client.channel('thailand-trip-shared')
      for (const table of TABLES) {
        channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, changed)
      }
      channel.subscribe(status)
      return () => { void client.removeChannel(channel) }
    },
    async mutate(actor, action, payload) {
      const { data, error } = await client.rpc('trip_mutate', {
        p_actor_id: actor, p_action: action, p_payload: payload,
      }).abortSignal(AbortSignal.timeout(15_000))
      if (error) throw error
      return data as string
    },
    async addTraveller(name, colour) {
      const { data, error } = await client.from('travellers').insert({ name, colour }).select()
        .abortSignal(AbortSignal.timeout(15_000)).single()
      if (error) throw error
      return data as Traveller
    },
    async renameTraveller(id, name) {
      const { error } = await client.from('travellers').update({ name }).eq('id', id)
        .abortSignal(AbortSignal.timeout(15_000))
      if (error) throw error
    },
    async setBudget(id, budget) {
      const { error } = await client.from('travellers').update({ budget_thb: budget }).eq('id', id)
        .abortSignal(AbortSignal.timeout(15_000))
      if (error) throw error
    },
    async addExpense(expense) {
      const { data, error } = await client.from('expenses').insert(expense).select()
        .abortSignal(AbortSignal.timeout(15_000)).single()
      if (error) throw error
      return data as Expense
    },
    async deleteExpense(id) {
      const { error } = await client.from('expenses').delete().eq('id', id)
        .abortSignal(AbortSignal.timeout(15_000))
      if (error) throw error
    },
    async upsertLocation(position) {
      const { error } = await client.from('locations')
        .upsert({ ...position, updated_at: new Date().toISOString() }, { onConflict: 'traveller_id' })
        .abortSignal(AbortSignal.timeout(15_000))
      if (error) throw error
    },
    async clearLocation(id) {
      const { error } = await client.from('locations').delete().eq('traveller_id', id)
        .abortSignal(AbortSignal.timeout(15_000))
      if (error) throw error
    },
    async addRepayment(repayment) {
      const { error } = await client.from('repayments').insert(repayment)
        .abortSignal(AbortSignal.timeout(15_000))
      if (error) throw error
    },
    async deleteRepayment(id) {
      const { error } = await client.from('repayments').delete().eq('id', id)
        .abortSignal(AbortSignal.timeout(15_000))
      if (error) throw error
    },
  }
}

export function friendlyError(error: unknown): string {
  const detail = error as { code?: string; message?: string; name?: string }
  if (detail.code === '40001') return 'Someone just changed this task. Check the latest version and try again.'
  if (detail.code === '23514' || detail.code === '23502') return 'Please check the values and try again.'
  if (detail.name === 'TimeoutError' || detail.name === 'AbortError') return "Couldn't confirm the save. Refresh before trying again."
  if (detail.message?.match(/fetch|network|connection/i)) return "Change didn't save. Reconnect and try again."
  return detail.message || "Change didn't save. Please try again."
}