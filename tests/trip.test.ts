import { describe, expect, it } from 'vitest'
import { costs, countdown, dueState, filterTasks, groupSpend, progress, safeBookingUrl, seedData, settlements, shareSummary, spendByCategory, spendRemaining, splitBalances, sumExpenses, taskStatus, todayKey, travellerExpenses } from '../src/lib/trip.ts'

describe('the complete trip seed', () => {
  it('keeps all six travellers, 22 tasks, nine days and three conflicts', () => {
    const data = seedData()
    expect(data.travellers).toHaveLength(6)
    expect(data.travellers.map((traveller) => traveller.name)).toEqual([
      'achu', 'AJ', 'DRUNK', 'DK', 'AMROWW', 'small_dude',
    ])
    expect(data.travellers[5].id).toBe('00000000-0000-4000-8000-000000000006')
    expect(data.tasks).toHaveLength(22)
    expect(data.itinerary_days).toHaveLength(9)
    expect(data.itinerary_days.filter((day) => day.conflict_note)).toHaveLength(3)
    expect(data.tasks.filter((task) => task.is_everyone)).toHaveLength(6)
    expect(data.tasks.map((task) => task.detail).every(Boolean)).toBe(true)
    expect(data.tasks[10].detail).toContain('Skip third class at 1,000 baht')
    expect(data.tasks[10].detail).toMatch(/Conflict: 7 Nov already has Wat Sam Phran and Chinatown\.$/)
    expect(data.tasks[12].detail).toMatch(/Ten minutes on foot from either Ratchathewi or Chidlom BTS\.$/)
    expect(data.tasks[13].detail).toMatch(/Go for the hunt, not guaranteed savings\.$/)
    expect(data.tasks[10].detail!.length).toBeGreaterThan(680)
    expect(data.tasks[12].detail!.length).toBeGreaterThan(450)
    expect(data.tasks[13].detail!.length).toBeGreaterThan(530)
  })
})

describe('shared checklist rules', () => {
  it('counts a group task only after every current traveller completes it', () => {
    const data = seedData()
    const task = data.tasks[14]
    task.status = 'done'
    expect(taskStatus(task, data)).toBe('todo')
    data.task_completions = data.travellers.map((traveller, index) => ({
      id: String(index), task_id: task.id, traveller_id: traveller.id, completed_at: '2026-10-28T00:00:00Z',
    }))
    expect(taskStatus(task, data)).toBe('done')
    expect(progress(data).done).toBe(1)
    data.travellers.push({ ...data.travellers[0], id: 'new-person', name: 'New friend' })
    expect(taskStatus(task, data)).toBe('doing')
    expect(progress(data).done).toBe(0)
  })

  it('uses outstanding counts, assigned-only Mine, and a separate Done filter', () => {
    const data = seedData()
    data.tasks[0].status = 'done'
    data.tasks[1].owner_id = data.travellers[0].id
    expect(filterTasks(data, 'all', null)).toHaveLength(21)
    expect(filterTasks(data, 'urgent', null)).toHaveLength(2)
    expect(filterTasks(data, 'done', null)).toHaveLength(1)
    expect(filterTasks(data, 'mine', data.travellers[0].id)).toEqual([data.tasks[1]])
    expect(filterTasks(data, 'mine', null)).toEqual([])
  })

  it('puts overdue tasks first and hides due flags for completed tasks', () => {
    const data = seedData()
    const task = data.tasks[2]
    task.due_date = '2026-09-22'
    expect(filterTasks(data, 'urgent', null, '2026-09-23')[0]).toEqual(task)
    expect(dueState(task, data, '2026-09-23')?.label).toBe('Overdue')
    task.due_date = '2026-09-26'
    expect(dueState(task, data, '2026-09-23')?.label).toBe('Due in 3 days')
    task.status = 'done'
    expect(dueState(task, data, '2026-09-23')).toBeNull()
  })
})

describe('trip dates, money and sharing', () => {
  it('uses Thailand calendar dates without UTC boundary errors', () => {
    expect(todayKey(new Date('2026-10-30T18:00:00Z'))).toBe('2026-10-31')
    expect(countdown('2026-09-23')).toBe('38 days to go')
    expect(countdown('2026-10-31')).toBe('Day 1 of 9')
    expect(countdown('2026-11-08')).toBe('Day 9 of 9')
    expect(countdown('2026-11-09')).toBe('What a trip')
  })

  it('includes zero actual costs and handles an empty roster', () => {
    const data = seedData()
    data.tasks[0].actual_cost_thb = 0
    expect(costs(data)).toMatchObject({ estimated: 59900, actual: 0, people: 6, recorded: 1 })
    expect(costs(data).perPerson).toBeCloseTo(9983.33)
    expect(costs(data).tasks).toHaveLength(10)
    data.travellers = []
    expect(costs(data).perPerson).toBe(0)
  })

  it('generates a complete WhatsApp message from the same shared state', () => {
    const data = seedData()
    data.tasks[0].owner_id = data.travellers[0].id
    data.tasks[1].status = 'done'
    const summary = shareSummary(data, '2026-09-23')
    expect(summary).toContain('*1/22 sorted*')
    expect(summary).toContain(`${data.tasks[0].title} (achu)`)
    expect(summary).toContain('(0/6 done)')
    expect(summary).toContain(`*DONE*\n- ${data.tasks[1].title}`)
  })

  it('does not allow executable booking URLs', () => {
    expect(safeBookingUrl('javascript:alert(1)')).toBeNull()
    expect(safeBookingUrl('https://example.com/booking')).toBe('https://example.com/booking')
  })
})

describe('personal spend tracking', () => {
  it('orders entries, totals them, splits by category and computes remaining', () => {
    const data = seedData()
    const me = data.travellers[0].id
    const other = data.travellers[1].id
    data.expenses = [
      { id: '1', traveller_id: me, amount_thb: 300, category: 'food', note: 'Pad thai', spent_at: '2026-11-01T10:00:00Z', created_at: '2026-11-01T10:00:00Z' },
      { id: '2', traveller_id: me, amount_thb: 200, category: 'food', note: null, spent_at: '2026-11-02T10:00:00Z', created_at: '2026-11-02T10:00:00Z' },
      { id: '3', traveller_id: me, amount_thb: 500, category: 'transport', note: null, spent_at: '2026-11-03T10:00:00Z', created_at: '2026-11-03T10:00:00Z' },
      { id: '4', traveller_id: other, amount_thb: 1000, category: 'shopping', note: null, spent_at: '2026-11-01T10:00:00Z', created_at: '2026-11-01T10:00:00Z' },
    ]
    const mine = travellerExpenses(data, me)
    expect(mine.map((expense) => expense.id)).toEqual(['3', '2', '1'])
    expect(sumExpenses(mine)).toBe(1000)
    expect(spendByCategory(mine)).toEqual([
      { category: 'food', total: 500 },
      { category: 'transport', total: 500 },
    ])
    expect(spendRemaining(1500, 1000)).toBe(500)
    expect(spendRemaining(null, 1000)).toBeNull()
    expect(spendRemaining(0, 1000)).toBeNull()
    const group = groupSpend(data)
    expect(group).toHaveLength(6)
    expect(group[0].total).toBe(1000)
    expect(group.find((row) => row.traveller.id === me)?.total).toBe(1000)
    expect(travellerExpenses(data, null)).toEqual([])
  })
})

describe('split and settle up', () => {
  it('splits shared expenses equally and suggests minimal transfers', () => {
    const data = seedData()
    const [a, b, c] = data.travellers
    data.expenses = [
      { id: '1', traveller_id: a.id, amount_thb: 3000, category: 'food', note: null, split_with: [a.id, b.id, c.id], spent_at: '2026-11-01T10:00:00Z', created_at: '2026-11-01T10:00:00Z' },
      { id: '2', traveller_id: b.id, amount_thb: 600, category: 'transport', note: null, split_with: null, spent_at: '2026-11-01T10:00:00Z', created_at: '2026-11-01T10:00:00Z' },
    ]
    const balances = splitBalances(data)
    expect(balances.find((entry) => entry.traveller.id === a.id)?.net).toBe(2000)
    expect(balances.find((entry) => entry.traveller.id === b.id)?.net).toBe(-1000)
    expect(balances.find((entry) => entry.traveller.id === c.id)?.net).toBe(-1000)
    const transfers = settlements(data)
    expect(transfers).toHaveLength(2)
    expect(transfers.every((transfer) => transfer.to.id === a.id)).toBe(true)
    expect(transfers.reduce((sum, transfer) => sum + transfer.amount, 0)).toBe(2000)
  })
})