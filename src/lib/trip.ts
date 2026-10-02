import source from '../data/seed.json' with { type: 'json' }
import type { Category, Expense, ExpenseCategory, Filter, Task, TaskStatus, Traveller, TripData } from './types.ts'

export const TRIP_TITLE = 'Thailand Nov 2026'
export const TRIP_START = '2026-10-31'
export const TRIP_END = '2026-11-08'
export const THB_TO_INR = 2.4
export const DEFAULT_BUDGET_THB = 20000
export const CATEGORIES: Category[] = ['urgent', 'booking', 'optional', 'admin']
export const CATEGORY_LABELS: Record<Category, string> = {
  urgent: 'Urgent', booking: 'To book', optional: 'Optional', admin: 'Admin',
}
export const EMPTY_DATA: TripData = {
  travellers: [], tasks: [], task_completions: [], comments: [], itinerary_days: [], activity: [], expenses: [], locations: [], repayments: [],
}
export const EXPENSE_CATEGORIES: ExpenseCategory[] = ['food', 'transport', 'stay', 'shopping', 'activities', 'misc']
export const EXPENSE_LABELS: Record<ExpenseCategory, string> = {
  food: 'Food', transport: 'Transport', stay: 'Stay', shopping: 'Shopping', activities: 'Activities', misc: 'Misc',
}

const seedDate = '2026-09-23T00:00:00.000Z'
export const seedId = (kind: number, index: number) =>
  `${kind}0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`

export function seedData(): TripData {
  return {
    travellers: source.travellers.map((traveller, index) => ({
      ...traveller, id: seedId(0, index), budget_thb: null, created_at: seedDate,
    })),
    tasks: source.tasks.map((task, index) => ({
      status: 'todo', owner_id: null, due_date: null, trip_day: null,
      est_cost_thb: null, actual_cost_thb: null, booking_url: null,
      booking_ref: null, is_everyone: false, ...task,
      category: task.category as Category, id: seedId(1, index),
      sort_order: index + 1, created_at: seedDate, updated_at: seedDate,
    })),
    itinerary_days: source.itinerary_days.map((day, index) => ({
      conflict_note: null, ...day, id: seedId(2, index), created_at: seedDate,
    })),
    task_completions: [], comments: [], activity: [], expenses: [], locations: [], repayments: [],
  }
}

export function todayKey(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

export function countdown(today = todayKey()): string {
  const remaining = daysBetween(today, TRIP_START)
  if (remaining > 0) return `${remaining} ${remaining === 1 ? 'day' : 'days'} to go`
  if (today <= TRIP_END) return `Day ${daysBetween(TRIP_START, today) + 1} of 9`
  return 'What a trip'
}

export function formatDate(date: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', ...options, timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

export function completedTravellers(task: Task, data: TripData): Set<string> {
  const roster = new Set(data.travellers.map((traveller) => traveller.id))
  return new Set(data.task_completions
    .filter((completion) => completion.task_id === task.id && roster.has(completion.traveller_id))
    .map((completion) => completion.traveller_id))
}

export function taskStatus(task: Task, data: TripData): TaskStatus {
  if (!task.is_everyone) return task.status
  const complete = completedTravellers(task, data).size
  if (data.travellers.length > 0 && complete === data.travellers.length) return 'done'
  return complete > 0 ? 'doing' : 'todo'
}

export function progress(data: TripData) {
  return { done: data.tasks.filter((task) => taskStatus(task, data) === 'done').length, total: data.tasks.length }
}

export function dueState(task: Task, data: TripData, today = todayKey()) {
  if (!task.due_date || taskStatus(task, data) === 'done') return null
  const days = daysBetween(today, task.due_date)
  if (days < 0) return { label: 'Overdue', overdue: true }
  if (days <= 7) return { label: days === 0 ? 'Due today' : `Due in ${days} ${days === 1 ? 'day' : 'days'}`, overdue: false }
  return null
}

export function filterTasks(data: TripData, filter: Filter, me: string | null, today = todayKey()): Task[] {
  return data.tasks.filter((task) => {
    const done = taskStatus(task, data) === 'done'
    if (filter === 'done') return done
    if (done) return false
    if (filter === 'all') return true
    if (filter === 'mine') return task.owner_id === me && me !== null
    return task.category === filter
  }).sort((first, second) => {
    const firstOverdue = dueState(first, data, today)?.overdue ? 1 : 0
    const secondOverdue = dueState(second, data, today)?.overdue ? 1 : 0
    return secondOverdue - firstOverdue || first.sort_order - second.sort_order || first.id.localeCompare(second.id)
  })
}

export function costs(data: TripData) {
  const tasks = data.tasks.filter((task) => task.est_cost_thb !== null || task.actual_cost_thb !== null)
  const estimated = tasks.reduce((sum, task) => sum + Number(task.est_cost_thb ?? 0), 0)
  const actual = tasks.reduce((sum, task) => sum + Number(task.actual_cost_thb ?? 0), 0)
  const people = data.travellers.length
  return {
    tasks, estimated, actual, people,
    perPerson: people ? estimated / people : 0,
    actualPerPerson: people ? actual / people : 0,
    recorded: tasks.filter((task) => task.actual_cost_thb !== null).length,
  }
}

export function money(amount: number, currency: 'THB' | 'INR' = 'THB') {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-GB', {
    style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0,
  }).format(amount)
}

export function travellerExpenses(data: TripData, id: string | null): Expense[] {
  if (!id) return []
  return data.expenses
    .filter((expense) => expense.traveller_id === id)
    .sort((first, second) => second.spent_at.localeCompare(first.spent_at) || second.created_at.localeCompare(first.created_at))
}

export function sumExpenses(expenses: Expense[]): number {
  return expenses.reduce((total, expense) => total + Number(expense.amount_thb), 0)
}

export function spendByCategory(expenses: Expense[]): { category: ExpenseCategory; total: number }[] {
  const totals = Object.fromEntries(EXPENSE_CATEGORIES.map((category) => [category, 0])) as Record<ExpenseCategory, number>
  for (const expense of expenses) totals[expense.category] += Number(expense.amount_thb)
  return EXPENSE_CATEGORIES
    .map((category) => ({ category, total: totals[category] }))
    .filter((entry) => entry.total > 0)
    .sort((first, second) => second.total - first.total)
}

export function groupSpend(data: TripData): { traveller: Traveller; total: number }[] {
  return data.travellers
    .map((traveller) => ({ traveller, total: sumExpenses(data.expenses.filter((expense) => expense.traveller_id === traveller.id)) }))
    .sort((first, second) => second.total - first.total)
}

export function spendRemaining(budget: number | null, spent: number): number | null {
  if (budget === null || budget <= 0) return null
  return budget - spent
}

export interface SettleBalance { traveller: Traveller; net: number }
export interface Settlement { from: Traveller; to: Traveller; amount: number }

// Net per traveller across shared expenses and repayments: positive means they are owed money, negative means they owe.
export function splitBalances(data: TripData): SettleBalance[] {
  const net = new Map<string, number>(data.travellers.map((traveller) => [traveller.id, 0]))
  for (const expense of data.expenses) {
    const shares = expense.split_shares
    if (!shares) continue
    const entries = Object.entries(shares).filter(([id]) => net.has(id))
    if (entries.length === 0) continue
    if (net.has(expense.traveller_id)) net.set(expense.traveller_id, (net.get(expense.traveller_id) ?? 0) + Number(expense.amount_thb))
    for (const [id, amount] of entries) net.set(id, (net.get(id) ?? 0) - Number(amount))
  }
  for (const repayment of data.repayments) {
    if (net.has(repayment.from_id)) net.set(repayment.from_id, (net.get(repayment.from_id) ?? 0) + Number(repayment.amount_thb))
    if (net.has(repayment.to_id)) net.set(repayment.to_id, (net.get(repayment.to_id) ?? 0) - Number(repayment.amount_thb))
  }
  return data.travellers.map((traveller) => ({ traveller, net: Math.round((net.get(traveller.id) ?? 0) * 100) / 100 }))
}

// Greedy minimal set of transfers that clears every balance.
export function settlements(data: TripData): Settlement[] {
  const byId = new Map(data.travellers.map((traveller) => [traveller.id, traveller]))
  const owed = splitBalances(data).filter((entry) => entry.net > 0.5).map((entry) => ({ id: entry.traveller.id, amount: entry.net })).sort((first, second) => second.amount - first.amount)
  const owes = splitBalances(data).filter((entry) => entry.net < -0.5).map((entry) => ({ id: entry.traveller.id, amount: -entry.net })).sort((first, second) => second.amount - first.amount)
  const transfers: Settlement[] = []
  let debtor = 0
  let creditor = 0
  while (debtor < owes.length && creditor < owed.length) {
    const pay = Math.min(owes[debtor].amount, owed[creditor].amount)
    const from = byId.get(owes[debtor].id)
    const to = byId.get(owed[creditor].id)
    if (from && to && pay > 0.5) transfers.push({ from, to, amount: Math.round(pay) })
    owes[debtor].amount -= pay
    owed[creditor].amount -= pay
    if (owes[debtor].amount <= 0.5) debtor += 1
    if (owed[creditor].amount <= 0.5) creditor += 1
  }
  return transfers
}

export function shareSummary(data: TripData, today = todayKey()): string {
  const { done, total } = progress(data)
  const lines = [`*${TRIP_TITLE}*`, '31 Oct - 8 Nov | Bengaluru > Phuket > Pattaya > Bangkok', countdown(today), `*${done}/${total} sorted*`, '']
  for (const category of CATEGORIES) {
    const tasks = filterTasks(data, category, null, today)
    if (!tasks.length) continue
    lines.push(`*${CATEGORY_LABELS[category].toUpperCase()}*`)
    for (const task of tasks) {
      const owner = data.travellers.find((traveller) => traveller.id === task.owner_id)?.name ?? 'unassigned'
      const state = taskStatus(task, data)
      const suffix = task.is_everyone
        ? ` (${completedTravellers(task, data).size}/${data.travellers.length} done)`
        : state === 'doing' ? ' _in progress_' : ''
      lines.push(`- ${task.title} (${owner})${suffix}`)
    }
    lines.push('')
  }
  lines.push('*DONE*')
  const completed = data.tasks.filter((task) => taskStatus(task, data) === 'done')
  lines.push(...(completed.length ? completed.map((task) => `- ${task.title}`) : ['Nothing yet.']))
  return lines.join('\n')
}

export function relativeTime(timestamp: string, now = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(timestamp).getTime()) / 60_000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / 1440)}d ago`
}

export function safeBookingUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch { return null }
}