import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { seedData } from '../src/lib/trip.ts'

const migration = readFileSync(new URL('../supabase/migrations/202609230001_trip.sql', import.meta.url), 'utf8')
const rosterMigration = readFileSync(new URL('../supabase/migrations/202609230002_traveller_names.sql', import.meta.url), 'utf8')
const seed = readFileSync(new URL('../supabase/seed.sql', import.meta.url), 'utf8')
const original = seedData()
const actor = original.travellers[0].id
let database: PGlite

async function mutate(action: string, payload: object, traveller = actor) {
  return database.query('select public.trip_mutate($1::uuid, $2, $3::jsonb)', [traveller, action, JSON.stringify(payload)])
}

beforeAll(async () => {
  database = new PGlite()
  await database.exec('create role anon; create role authenticated;')
  await database.exec(migration)
}, 20_000)

beforeEach(async () => {
  await database.exec('reset role; truncate public.travellers, public.tasks, public.itinerary_days, public.activity cascade;')
  await database.exec(seed)
})

afterAll(async () => { await database?.close() })

describe('Supabase schema and atomic mutation contract', () => {
  it('updates only the original roster names and keeps identities and personal edits', async () => {
    const oldNames = ['Arjun', 'Traveller 2', 'Traveller 3', 'Traveller 4', 'Traveller 5', 'Traveller 6']
    for (const [index, name] of oldNames.entries()) {
      await database.query('update public.travellers set name = $1 where id = $2', [name, original.travellers[index].id])
    }
    await database.query('update public.travellers set name = $1 where id = $2', ['My chosen name', original.travellers[4].id])
    await database.exec(rosterMigration)
    await database.exec(rosterMigration)
    const roster = await database.query<{ id: string; name: string }>('select id, name from public.travellers order by id')
    expect(roster.rows.map((traveller) => traveller.id)).toEqual(original.travellers.map((traveller) => traveller.id))
    expect(roster.rows.map((traveller) => traveller.name)).toEqual(['ACHU (Admin)', 'AJ', 'DRUNK', 'DK', 'My chosen name', 'Traveller 6'])
  })

  it('enables RLS and realtime on every table', async () => {
    const policies = await database.query('select * from pg_policies where schemaname = $1', ['public'])
    const publication = await database.query('select * from pg_publication_tables where pubname = $1', ['supabase_realtime'])
    const tables = await database.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname = any($1) and relkind = 'r'", [Object.keys(original)])
    expect(policies.rows).toHaveLength(6)
    expect(publication.rows).toHaveLength(6)
    expect(tables.rows.every((table) => table.relrowsecurity)).toBe(true)
  })

  it('lets anonymous friends read and write, with activity in the same transaction', async () => {
    const task = original.tasks[0]
    await database.exec('set role anon;')
    expect((await database.query('select * from public.tasks')).rows).toHaveLength(22)
    await mutate('cycle_status', { task_id: task.id, expected_updated_at: task.updated_at })
    expect((await database.query('select status from public.tasks where id = $1', [task.id])).rows).toEqual([{ status: 'doing' }])
    expect((await database.query('select action from public.activity')).rows).toEqual([{ action: `started ${task.title}` }])
  })

  it('rejects stale edits instead of overwriting another phone', async () => {
    const task = original.tasks[0]
    const payload = { task_id: task.id, expected_updated_at: task.updated_at }
    await mutate('cycle_status', payload)
    await expect(mutate('cycle_status', payload)).rejects.toThrow('Someone just changed')
    expect((await database.query('select * from public.activity')).rows).toHaveLength(1)
  })

  it('makes personal completions idempotent and actor-specific', async () => {
    const task = original.tasks[14]
    const payload = { task_id: task.id, completed: true }
    await mutate('set_completion', payload)
    await mutate('set_completion', payload)
    await mutate('set_completion', payload, original.travellers[1].id)
    expect((await database.query('select * from public.task_completions')).rows).toHaveLength(2)
    expect((await database.query('select * from public.activity')).rows).toHaveLength(2)
    await mutate('set_completion', { ...payload, completed: false })
    expect((await database.query('select traveller_id from public.task_completions')).rows).toEqual([{ traveller_id: original.travellers[1].id }])
  })

  it('rejects invalid costs without adding a misleading activity entry', async () => {
    const task = original.tasks[3]
    await expect(mutate('update_task', {
      task_id: task.id, expected_updated_at: task.updated_at, patch: { actual_cost_thb: -1 },
    })).rejects.toThrow()
    expect((await database.query('select * from public.activity')).rows).toHaveLength(0)
    expect((await database.query('select actual_cost_thb from public.tasks where id = $1', [task.id])).rows).toEqual([{ actual_cost_thb: null }])
  })

  it('logs cost changes and ownership claims together', async () => {
    const task = original.tasks[3]
    await mutate('update_task', {
      task_id: task.id, expected_updated_at: task.updated_at, patch: { actual_cost_thb: 16000, owner_id: actor },
    })
    expect((await database.query<{ action: string }>('select action from public.activity')).rows.map((entry) => entry.action))
      .toEqual([`updated costs for ${task.title}`, `claimed ${task.title}`])
  })

  it('saves comments and activity atomically, and refuses blank comments', async () => {
    const task = original.tasks[0]
    await mutate('add_comment', { task_id: task.id, body: 'Checking tonight.' })
    await expect(mutate('add_comment', { task_id: task.id, body: '   ' })).rejects.toThrow()
    expect((await database.query('select * from public.comments')).rows).toHaveLength(1)
    expect((await database.query('select * from public.activity')).rows).toHaveLength(1)
  })

  it('creates tasks with defaults and preserves edits when seeds are reapplied', async () => {
    await mutate('create_task', { title: 'Check ferry times', category: 'booking' })
    await database.query('update public.tasks set title = $1 where id = $2', ['Updated by a friend', original.tasks[0].id])
    await database.exec(seed)
    expect((await database.query('select * from public.tasks')).rows).toHaveLength(23)
    expect((await database.query('select title from public.tasks where id = $1', [original.tasks[0].id])).rows).toEqual([{ title: 'Updated by a friend' }])
  })
})