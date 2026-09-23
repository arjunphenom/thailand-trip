import { readFileSync, writeFileSync } from 'node:fs'
import { seedData } from '../src/lib/trip.ts'

const data = seedData()
const literal = (value) => {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return `'${value.replaceAll("'", "''")}'`
}

const statements = ['begin;']
for (const table of ['travellers', 'tasks', 'itinerary_days']) {
  const rows = data[table]
  const columns = Object.keys(rows[0])
  statements.push(`insert into public.${table} (${columns.join(', ')}) values\n${
    rows.map((row) => `(${columns.map((column) => literal(row[column])).join(', ')})`).join(',\n')
  }\non conflict (id) do nothing;`)
}
statements.push('commit;\n')
const sql = statements.join('\n\n')
const target = new URL('../supabase/seed.sql', import.meta.url)

if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== sql) throw new Error('Seed SQL is stale. Run npm run seed:sql.')
  console.log('Seed SQL matches every source record.')
} else {
  writeFileSync(target, sql)
  console.log('Generated Supabase seed: 6 travellers, 22 tasks, 9 itinerary days.')
}