import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, ArrowRightLeft, ArrowUpRight, BedDouble, Bus, CalendarDays, Check, CheckCheck, ChevronDown, Coins, Crosshair, History, Hotel, ListTodo, LocateFixed, MapPin, MapPinned, PiggyBank, Plane, Plus, RadioTower, RefreshCw, ShoppingBag, Ticket, Trash2, TrendingUp, TriangleAlert, Users, Utensils, Wallet, WifiOff } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { toast } from 'sonner'
import { CATEGORIES, CATEGORY_LABELS, DEFAULT_BUDGET_THB, EXPENSE_CATEGORIES, EXPENSE_LABELS, countdown, costs, daysBetween, filterTasks, formatDate, groupSpend, money, progress, relativeTime, settlements, splitBalances, spendByCategory, sumExpenses, taskStatus, travellerExpenses } from './lib/trip.ts'
import type { ExpenseCategory, Filter, ItineraryDay } from './lib/types.ts'
import { useInrRate } from './lib/rate.ts'
import { useWeather, weatherLabel } from './lib/weather.ts'
import { useTrip } from './lib/use-trip.tsx'
import { AddTaskSheet, TaskCard, UnclaimedHint } from './components/TaskCard.tsx'
import { Avatar, EmptyState, IconButton, Markdown, PhotoCredit } from './components/ui.tsx'

const EXPENSE_ICONS: Record<ExpenseCategory, LucideIcon> = {
  food: Utensils, transport: Bus, stay: BedDouble, shopping: ShoppingBag, activities: Ticket, misc: Coins,
}

function travellerInitials(name: string): string {
  const clean = name.replace(/\s*\(Admin\)$/i, '').trim() || '?'
  if (clean.startsWith('Traveller ')) return `T${clean.split(' ').at(-1)}`
  return clean.length <= 2 ? clean.toUpperCase() : clean.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
}

function TripCover() {
  const { data } = useTrip()
  return <>
    <section className="trip-cover" aria-label="Thailand trip">
      <img src={`${import.meta.env.BASE_URL}thailand.webp`} alt="The limestone cliffs and turquoise water of the Phi Phi Islands" width="1200" height="734" fetchPriority="high" />
      <div className="cover-content"><span className="cover-eyebrow">31 OCT &ndash; 8 NOV 2026</span><h2>Thailand Nov 2026</h2>
        <div className="cover-route"><span>Phuket</span><ArrowRight size={13} /><span>Pattaya</span><ArrowRight size={13} /><span>Bangkok</span></div>
      </div>
    </section>
    <div className="trip-strip"><span><Plane size={14} />Bengaluru <ArrowRight size={12} />Thailand</span>
      <span className="crew"><span className="avatar-stack">{data.travellers.slice(0, 6).map((traveller) => <Avatar traveller={traveller} small key={traveller.id} />)}</span><span>{data.travellers.length} of us</span></span>
    </div>
    <PhotoCredit />
  </>
}

function ActivityFeed() {
  const { data } = useTrip()
  return <details className="activity-feed"><summary><History size={17} /><span>Recent activity</span>{data.activity.length > 0 && <span className="count-badge">{data.activity.length}</span>}<ChevronDown size={17} /></summary>
    {data.activity.length ? <ol>{data.activity.slice(0, 20).map((entry) => {
      const traveller = data.travellers.find((person) => person.id === entry.traveller_id)
      return <li key={entry.id}><Avatar traveller={traveller} small /><div><p><strong>{traveller?.name ?? 'A traveller'}</strong> {entry.action}</p><time dateTime={entry.created_at}>{relativeTime(entry.created_at)}</time></div></li>
    })}</ol> : <p className="empty-inline">Nothing has changed yet.</p>}
  </details>
}

export function ChecklistPage() {
  const { data, today, me, store, refreshing, save } = useTrip()
  const [params, setParams] = useSearchParams()
  const target = params.get('task')
  const targetTask = data.tasks.find((task) => task.id === target)
  const [filter, setFilter] = useState<Filter>(() => targetTask && taskStatus(targetTask, data) === 'done' ? 'done' : 'all')
  const [adding, setAdding] = useState(false)
  const [fullChecklist, setFullChecklist] = useState(false)
  const [pull, setPull] = useState(0)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const activeDay = data.itinerary_days.find((day) => day.day_date === today)
  const tripMode = !!activeDay && !fullChecklist && !target
  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' }, ...CATEGORIES.map((category) => ({ id: category, label: CATEGORY_LABELS[category] })),
    { id: 'mine', label: 'Mine' }, { id: 'done', label: 'Done' },
  ]
  const visible = filterTasks(data, filter, me?.id ?? null, today)
  const complete = progress(data)
  const refresh = () => save(() => store.refresh())
  useEffect(() => {
    if (!target) return
    const element = Array.from(document.querySelectorAll<HTMLElement>('[data-task-id]')).find((candidate) => candidate.dataset.taskId === target)
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [target])
  return <div onTouchStart={(event) => {
    if (window.scrollY <= 0 && event.touches.length === 1) touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }
  }} onTouchMove={(event) => {
    if (!touchStart.current || event.touches.length !== 1) return
    const distance = event.touches[0].clientY - touchStart.current.y
    if (Math.abs(event.touches[0].clientX - touchStart.current.x) > 40) { touchStart.current = null; setPull(0); return }
    setPull(Math.max(0, Math.min(90, distance * 0.55)))
  }} onTouchEnd={() => {
    if (pull >= 64) void refresh()
    touchStart.current = null
    setPull(0)
  }} onTouchCancel={() => { touchStart.current = null; setPull(0) }}>
    {pull > 0 && <div className="pull-indicator" style={{ height: pull }} aria-label="Pull to refresh"><RefreshCw size={20} style={{ transform: `rotate(${pull * 3}deg)` }} /></div>}
    <TripCover />
    <div className="page-body">
      {tripMode ? <>
        <div className="page-heading"><div><span className="eyebrow">{countdown(today)}</span><h2>Today in {activeDay.city}</h2></div><span className="today-badge">Today</span></div>
        <DayCard day={activeDay} />
        <button className="button button-primary full-width" onClick={() => setFullChecklist(true)}><ListTodo size={17} />Show full checklist</button>
      </> : <>
        <div className="page-heading"><div><h2>Checklist<span className="heading-dot">.</span></h2></div>
          <div className="heading-tools"><span className="sorted-label">{complete.done}/{complete.total} sorted</span><IconButton label="Refresh trip" disabled={refreshing} onClick={() => void refresh()}><RefreshCw size={17} className={refreshing ? 'spin' : ''} /></IconButton></div>
        </div>
        {activeDay && <button className="today-link" onClick={() => { setFullChecklist(false); setParams({}) }}><CalendarDays size={15} />Back to today's plan<ArrowRight size={14} /></button>}
        <div className="filter-bar" role="group" aria-label="Filter tasks">{filters.map((option) => <button key={option.id} className={`filter-chip ${filter === option.id ? 'selected' : ''}`}
          aria-pressed={filter === option.id} onClick={() => { setFilter(option.id); setParams({}) }}>
          {option.id === 'mine' && <UserFilterIcon />}{option.id === 'done' && <Check size={13} />}{option.label}<span>{filterTasks(data, option.id, me?.id ?? null, today).length}</span>
        </button>)}</div>
        {visible.length ? CATEGORIES.map((category, index) => {
          const tasks = visible.filter((task) => task.category === category)
          if (!tasks.length) return null
          return <section className={`task-group group-${category}`} key={category} aria-label={`${CATEGORY_LABELS[category]} tasks`}>
            <div className="group-heading"><span className="group-index">0{index + 1}</span><h3>{CATEGORY_LABELS[category]}</h3><span className="group-count">{tasks.length}</span>
              {filter !== 'done' && <UnclaimedHint count={tasks.filter((task) => !task.owner_id).length} />}
            </div>
            <div className="task-list">{tasks.map((task) => <TaskCard task={task} key={`${task.id}-${target === task.id}`} initiallyOpen={target === task.id} />)}</div>
          </section>
        }) : <EmptyState icon={filter === 'done' ? CheckCheck : ListTodo} title={filter === 'done' ? 'Nothing sorted just yet' : filter === 'mine' ? 'Nothing on your list' : 'All clear here'}
          detail={filter === 'mine' ? 'No outstanding tasks are assigned to you.' : filter === 'done' ? 'The bookings and little details are still taking shape.' : 'No outstanding tasks in this view.'}>
          <button className="button button-secondary" onClick={() => setFilter(filter === 'all' ? 'done' : 'all')}>{filter === 'all' ? 'See completed' : 'View all tasks'}<ArrowRight size={15} /></button>
        </EmptyState>}
      </>}
      <ActivityFeed />
      <div className="page-end"><span className="end-line" /><Plane size={14} /><span className="end-line" /></div>
      <p className="footer-note">Phuket mornings. Bangkok nights. All of us.</p>
    </div>
    <button className="fab" aria-label="Add task" title="Add task" onClick={() => setAdding(true)}><Plus size={26} /></button>
    {adding && <AddTaskSheet onClose={() => setAdding(false)} />}
  </div>
}

function UserFilterIcon() { return <Users size={13} /> }

export function DayCard({ day }: { day: ItineraryDay }) {
  const { data, today } = useTrip()
  const related = data.tasks.filter((task) => task.trip_day === day.day_date)
  const outstanding = related.filter((task) => taskStatus(task, data) !== 'done').length
  const city = day.city.startsWith('Phuket') ? 'phuket' : day.city === 'Pattaya' ? 'pattaya' : 'bangkok'
  return <article className={`day-card city-${city} ${day.day_date === today ? 'day-today' : ''}`} data-day={day.day_date}>
    <div className="day-heading"><div><span className="day-weekday">{formatDate(day.day_date, { weekday: 'long', day: undefined, month: undefined })}</span><h3>{formatDate(day.day_date)}</h3></div>
      <span className={`city-badge ${city}`}><MapPin size={12} />{day.city}</span>
    </div>
    <h4 className="day-title">{day.title}</h4>
    {day.hotel && <p className={`hotel-name ${day.hotel === 'NOT BOOKED' ? 'hotel-missing' : ''}`}><Hotel size={14} />{day.hotel}</p>}
    {day.conflict_note && <div className="day-callout conflict-callout"><TriangleAlert size={17} /><div><strong>Plans overlap</strong><p>{day.conflict_note}</p></div></div>}
    <Markdown>{day.notes}</Markdown>
    {day.watch_out && <div className="day-callout watch-out"><TriangleAlert size={16} /><div><strong>Keep in mind</strong><p>{day.watch_out}</p></div></div>}
    <div className="day-tasks-heading"><ListTodo size={14} /><span>{related.length ? `${outstanding} to sort for this day` : 'No linked tasks'}</span>{outstanding === 0 && related.length > 0 && <Check size={15} />}</div>
    {related.length > 0 && <div className="day-tasks">{related.map((task) => <TaskCard task={task} compact key={task.id} />)}</div>}
  </article>
}

function TripNow() {
  const weather = useWeather()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(timer) }, [])
  const clock = (zone: string) => new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: true }).format(now)
  return <section className="trip-now" aria-label="Local times and weather">
    <div className="clock-row">
      <div className="clock"><span className="clock-flag">🇮🇳</span><div><strong>{clock('Asia/Kolkata')}</strong><span>India</span></div></div>
      <span className="clock-sep" aria-hidden="true" />
      <div className="clock"><span className="clock-flag">🇹🇭</span><div><strong>{clock('Asia/Bangkok')}</strong><span>Bangkok</span></div></div>
    </div>
    <div className="weather-row">{weather.map((entry) => { const label = weatherLabel(entry.code); return <div className="weather-city" key={entry.city}><span className="weather-icon" title={label.text}>{label.icon}</span><span className="weather-temp">{entry.temp === null ? '—' : `${entry.temp}°`}</span><span className="weather-name">{entry.city}</span></div> })}</div>
  </section>
}

export function ItineraryPage() {
  const { data } = useTrip()
  return <div className="page-body standalone-page"><div className="page-heading"><div><span className="eyebrow">31 OCT &ndash; 8 NOV 2026</span><h2>Day by day<span className="heading-dot">.</span></h2></div><span className="page-symbol"><MapPin size={24} /></span></div>
    <TripNow />
    <div className="itinerary-route"><span>Phuket</span><ArrowRight size={14} /><span>Pattaya</span><ArrowRight size={14} /><span>Bangkok</span></div>
    {data.itinerary_days.length ? <div className="timeline">{data.itinerary_days.map((day) => <div className="timeline-day" key={day.id}>
      <span className="timeline-number">{String(daysBetween('2026-10-31', day.day_date) + 1).padStart(2, '0')}</span><DayCard day={day} />
    </div>)}</div> : <EmptyState icon={CalendarDays} title="The days are still open" detail="No itinerary has been added yet." />}
  </div>
}

export function MoneyPage() {
  const { data, me, store, save, connection } = useTrip()
  const preview = connection === 'preview'
  const [category, setCategory] = useState<ExpenseCategory>('food')
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [convFrom, setConvFrom] = useState<'thb' | 'inr'>('thb')
  const [convAmount, setConvAmount] = useState('')
  const [amountValue, setAmountValue] = useState('')
  const [splitOn, setSplitOn] = useState(false)
  const [splitWith, setSplitWith] = useState<string[]>([])
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal')
  const [customShares, setCustomShares] = useState<Record<string, string>>({})
  const formRef = useRef<HTMLFormElement>(null)

  const mine = travellerExpenses(data, me?.id ?? null)
  const myTotal = sumExpenses(mine)
  const breakdown = spendByCategory(mine)
  const { rate, live: liveRate, at: rateAt } = useInrRate()
  const myBudget = me?.budget_thb ?? null
  const effectiveBudget = myBudget ?? DEFAULT_BUDGET_THB
  const remaining = effectiveBudget - myTotal
  const budgetPct = Math.min(100, Math.round(myTotal / effectiveBudget * 100))
  const group = groupSpend(data)
  const groupTotal = sumExpenses(data.expenses)
  const maxGroup = Math.max(1, ...group.map((row) => row.total))
  const maxCategory = Math.max(1, ...breakdown.map((row) => row.total))
  const planning = costs(data)
  const todayField = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
  const splitTotal = Number(amountValue) || 0
  const equalShare = splitWith.length ? splitTotal / splitWith.length : 0
  const customSum = splitWith.reduce((sum, id) => sum + (Number(customShares[id]) || 0), 0)
  const customLeft = Math.round((splitTotal - customSum) * 100) / 100
  const splitValid = !splitOn || (splitWith.length >= 2 && (splitMode === 'equal' || Math.abs(customLeft) < 1))
  const hasShared = data.expenses.some((expense) => expense.split_shares && Object.keys(expense.split_shares).length > 0)
  const settleBalances = splitBalances(data).filter((entry) => Math.abs(entry.net) >= 1)
  const settleList = settlements(data)
  const travellerById = (id: string) => data.travellers.find((traveller) => traveller.id === id)

  const addExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!me) return
    const amount = Number(amountValue)
    if (!Number.isFinite(amount) || amount <= 0) { toast.error('Enter an amount greater than zero.'); return }
    let shares: Record<string, number> | null = null
    if (splitOn && splitWith.length >= 2) {
      if (splitMode === 'equal') {
        const per = Math.round(amount / splitWith.length * 100) / 100
        shares = Object.fromEntries(splitWith.map((id) => [id, per]))
        shares[splitWith[0]] = Math.round((per + amount - per * splitWith.length) * 100) / 100
      } else {
        if (Math.abs(amount - splitWith.reduce((sum, id) => sum + (Number(customShares[id]) || 0), 0)) >= 1) { toast.error('Custom shares must add up to the total.'); return }
        shares = Object.fromEntries(splitWith.map((id) => [id, Math.round((Number(customShares[id]) || 0) * 100) / 100]))
      }
    }
    const fields = new FormData(event.currentTarget)
    const note = String(fields.get('note') ?? '').trim()
    const when = String(fields.get('spent_at') ?? '')
    const ok = await save(() => store.addExpense({
      traveller_id: me.id, amount_thb: Math.round(amount * 100) / 100, category,
      note: note || null, split_shares: shares,
      spent_at: when ? new Date(`${when}T12:00:00`).toISOString() : new Date().toISOString(),
    }), shares ? 'Added and split with the group.' : 'Added to your spending.')
    if (ok) { formRef.current?.reset(); setAmountValue(''); setCategory('food'); setSplitOn(false); setSplitWith([]); setSplitMode('equal'); setCustomShares({}) }
  }

  const saveBudget = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!me) return
    const value = Number(new FormData(event.currentTarget).get('budget'))
    const budget = Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null
    if (await save(() => store.setBudget(me.id, budget), budget ? 'Budget updated.' : 'Budget cleared.')) setBudgetOpen(false)
  }

  const clearMine = async () => {
    if (!me) return
    for (const expense of mine) await store.deleteExpense(expense.id).catch(() => {})
    await store.refresh().catch(() => {})
    setConfirmClear(false)
    toast.success('Your spending was reset to zero.')
  }

  return <div className="page-body standalone-page">
    <div className="page-heading"><div><span className="eyebrow">TRACK YOUR SPENDING</span><h2>Money<span className="heading-dot">.</span></h2></div><span className="page-symbol"><Wallet size={24} /></span></div>

    <section className="spend-hero" aria-label="Your spending">
      <div className="spend-hero-top"><Avatar traveller={me} /><div><span className="spend-hero-name">{me ? me.name.replace(/\s*\(Admin\)$/i, '') : 'Pick your traveller'}</span><span className="spend-hero-label">Your total spend</span></div><Coins size={20} /></div>
      <div className="spend-amount"><strong>{money(myTotal)}</strong><span>{money(myTotal * rate, 'INR')}</span></div>
      <div className="spend-budget">
        <div className="spend-budget-bar"><span className={remaining < 0 ? 'over' : ''} style={{ width: `${budgetPct}%` }} /></div>
        <div className="spend-budget-line"><span>{remaining >= 0 ? 'Remaining' : 'Over budget'}</span><strong className={remaining < 0 ? 'over' : ''}>{money(Math.abs(remaining))}</strong></div>
        <div className="spend-budget-foot"><span>Budget {money(effectiveBudget)}{myBudget === null ? ' · default' : ''}</span><button className="link-button" onClick={() => setBudgetOpen((open) => !open)} disabled={preview}><PiggyBank size={13} />Edit</button></div>
      </div>
      {budgetOpen && <form className="budget-form" onSubmit={saveBudget}><label className="sr-only" htmlFor="budget-input">Budget in baht</label>
        <input id="budget-input" name="budget" type="number" inputMode="decimal" min={0} step="100" defaultValue={myBudget ?? DEFAULT_BUDGET_THB} placeholder="Budget in ฿" autoFocus />
        <button className="button button-primary" type="submit">Save</button></form>}
    </section>

    <section className="converter" aria-label="Convert baht and rupees">
      <div className="converter-head"><ArrowRightLeft size={16} /><h3>Quick convert</h3><span>1 ฿ = {rate.toFixed(2)} ₹</span></div>
      <div className="converter-row">
        <label className="conv-field"><span>{convFrom === 'thb' ? '฿ Baht' : '₹ Rupees'}</span>
          <input type="number" inputMode="decimal" min={0} value={convAmount} onChange={(event) => setConvAmount(event.target.value)} placeholder="0" aria-label={convFrom === 'thb' ? 'Amount in baht' : 'Amount in rupees'} /></label>
        <button type="button" className="conv-swap" aria-label="Swap baht and rupees" onClick={() => setConvFrom((current) => current === 'thb' ? 'inr' : 'thb')}><ArrowRightLeft size={18} /></button>
        <div className="conv-field conv-out"><span>{convFrom === 'thb' ? '₹ Rupees' : '฿ Baht'}</span>
          <strong>{money((Number(convAmount) || 0) * (convFrom === 'thb' ? rate : 1 / rate), convFrom === 'thb' ? 'INR' : 'THB')}</strong></div>
      </div>
    </section>

    <section className="spend-entry" aria-label="Add an expense">
      <div className="spend-entry-head"><Plus size={16} /><h3>Add spend</h3><span>฿ THB</span></div>
      <form ref={formRef} className="spend-form" onSubmit={addExpense}>
        <div className="amount-field"><span>฿</span><input name="amount" type="number" inputMode="decimal" min={0} step="1" placeholder="0" aria-label="Amount in baht" value={amountValue} onChange={(event) => setAmountValue(event.target.value)} required /></div>
        <div className="category-picker" role="group" aria-label="Category">{EXPENSE_CATEGORIES.map((item) => { const Icon = EXPENSE_ICONS[item]; return <button type="button" key={item} className={`cat-chip ${category === item ? 'selected' : ''}`} aria-pressed={category === item} onClick={() => setCategory(item)}><Icon size={16} />{EXPENSE_LABELS[item]}</button> })}</div>
        <div className="spend-form-row">
          <input name="note" maxLength={200} placeholder="Where / what for" aria-label="Where you spent" />
          <input name="spent_at" type="date" aria-label="Date" defaultValue={todayField} />
        </div>
        <div className="split-bar">
          <button type="button" className={`split-switch ${splitOn ? 'on' : ''}`} aria-pressed={splitOn} onClick={() => setSplitOn((on) => { const next = !on; if (next) { setSplitWith(me ? [me.id] : []); setSplitMode('equal'); setCustomShares({}) } return next })}><Users size={15} />Split this</button>
          {splitOn && <div className="split-modes" role="group" aria-label="Split type">
            <button type="button" className={splitMode === 'equal' ? 'on' : ''} aria-pressed={splitMode === 'equal'} onClick={() => setSplitMode('equal')}>Equal</button>
            <button type="button" className={splitMode === 'custom' ? 'on' : ''} aria-pressed={splitMode === 'custom'} onClick={() => { setSplitMode('custom'); const per = splitWith.length ? Math.round((Number(amountValue) || 0) / splitWith.length * 100) / 100 : 0; setCustomShares(Object.fromEntries(splitWith.map((id) => [id, per ? String(per) : '']))) }}>Custom</button>
          </div>}
        </div>
        {splitOn && <>
          <div className="split-picker" role="group" aria-label="Split with">{data.travellers.map((traveller) => <button type="button" key={traveller.id} className={`split-chip ${splitWith.includes(traveller.id) ? 'selected' : ''}`} aria-pressed={splitWith.includes(traveller.id)} onClick={() => setSplitWith((current) => current.includes(traveller.id) ? current.filter((id) => id !== traveller.id) : [...current, traveller.id])}><Avatar traveller={traveller} small />{traveller.name.replace(/\s*\(Admin\)$/i, '')}</button>)}</div>
          {splitWith.length < 2 ? <p className="split-hint">Pick at least 2 people to split with.</p>
            : splitMode === 'equal' ? <p className="split-hint">{money(equalShare)} each · {splitWith.length} people</p>
            : <div className="custom-shares">
                {splitWith.map((id) => { const traveller = travellerById(id); return <label className="custom-share" key={id}><Avatar traveller={traveller} small /><span>{traveller?.name.replace(/\s*\(Admin\)$/i, '') ?? '—'}</span><input type="number" inputMode="decimal" min={0} value={customShares[id] ?? ''} onChange={(event) => setCustomShares((current) => ({ ...current, [id]: event.target.value }))} placeholder="0" aria-label={`Share for ${traveller?.name ?? 'traveller'}`} /></label> })}
                <div className={`custom-foot ${Math.abs(customLeft) < 1 ? 'ok' : ''}`}>{Math.abs(customLeft) < 1 ? 'Balanced ✓' : customLeft > 0 ? `${money(customLeft)} left to assign` : `${money(-customLeft)} over`}</div>
              </div>}
        </>}
        <button className="button button-primary full-width" type="submit" disabled={preview || !me || !splitValid}><Plus size={17} />Add spend</button>
      </form>
      {preview && <p className="preview-form-note">Read-only preview. Connect Supabase to track spending.</p>}
    </section>

    {breakdown.length > 0 && <section className="spend-breakdown" aria-label="Where your money went">
      <div className="cost-list-heading"><h3><TrendingUp size={15} />Where it went</h3><span>{mine.length} {mine.length === 1 ? 'entry' : 'entries'}</span></div>
      <div className="breakdown-list">{breakdown.map((row) => { const Icon = EXPENSE_ICONS[row.category]; return <div className="breakdown-row" key={row.category}>
        <span className={`cat-dot cat-${row.category}`}><Icon size={14} /></span>
        <div className="breakdown-main"><div className="breakdown-top"><span>{EXPENSE_LABELS[row.category]}</span><strong>{money(row.total)}</strong></div>
          <div className="breakdown-bar"><span className={`cat-${row.category}`} style={{ width: `${Math.round(row.total / maxCategory * 100)}%` }} /></div></div>
      </div> })}</div>
    </section>}

    {mine.length > 0 && <section className="spend-log" aria-label="Your recent spending">
      <div className="cost-list-heading"><h3>Recent</h3>{!confirmClear ? <button className="link-button danger" onClick={() => setConfirmClear(true)} disabled={preview}><Trash2 size={13} />Reset</button>
        : <span className="clear-confirm">Reset all?<button className="link-button danger" onClick={() => void clearMine()}>Yes</button><button className="link-button" onClick={() => setConfirmClear(false)}>No</button></span>}</div>
      <ul className="log-list">{mine.map((expense) => { const Icon = EXPENSE_ICONS[expense.category]; return <li className="log-row" key={expense.id}>
        <span className={`cat-dot cat-${expense.category}`}><Icon size={14} /></span>
        <div className="log-main"><span className="log-note">{expense.note || EXPENSE_LABELS[expense.category]}</span><span className="log-time">{EXPENSE_LABELS[expense.category]} · {relativeTime(expense.spent_at)}</span></div>
        <span className="log-amount">{money(Number(expense.amount_thb))}</span>
        <IconButton label="Delete entry" className="log-delete" disabled={preview} onClick={() => void save(() => store.deleteExpense(expense.id))}><Trash2 size={15} /></IconButton>
      </li> })}</ul>
    </section>}

    <section className="group-spend" aria-label="Group spending">
      <div className="cost-list-heading"><h3><Users size={15} />The group</h3><span>{money(groupTotal)}</span></div>
      {groupTotal > 0 ? <div className="group-list">{group.map(({ traveller, total }) => <div className="group-row" key={traveller.id}>
        <Avatar traveller={traveller} small mine={traveller.id === me?.id} />
        <div className="group-main"><div className="group-top"><span>{traveller.name.replace(/\s*\(Admin\)$/i, '')}</span><strong>{money(total)}</strong></div>
          <div className="group-bar"><span style={{ width: `${Math.round(total / maxGroup * 100)}%`, background: traveller.colour }} /></div></div>
      </div>)}</div> : <p className="empty-inline">No spending logged yet. Add your first entry above.</p>}
    </section>

    <section className="split-section" aria-label="Split and settle up">
      <div className="cost-list-heading"><h3><ArrowRightLeft size={15} />Split &amp; settle up</h3></div>
      {hasShared ? (settleBalances.length > 0 ? <>
        <div className="balance-list">{settleBalances.map((entry) => <div className="balance-row" key={entry.traveller.id}>
          <Avatar traveller={entry.traveller} small mine={entry.traveller.id === me?.id} />
          <span className="balance-name">{entry.traveller.name.replace(/\s*\(Admin\)$/i, '')}</span>
          <span className={`balance-amt ${entry.net > 0 ? 'pos' : 'neg'}`}>{entry.net > 0 ? `is owed ${money(entry.net)}` : `owes ${money(-entry.net)}`}</span>
        </div>)}</div>
        {settleList.length > 0 && <div className="settle-list"><span className="settle-head">Simplest way to settle</span>{settleList.map((transfer, index) => <div className="settle-row" key={index}>
          <Avatar traveller={transfer.from} small /><span className="settle-text"><strong>{transfer.from.name.replace(/\s*\(Admin\)$/i, '')}</strong> pays <strong>{transfer.to.name.replace(/\s*\(Admin\)$/i, '')}</strong></span><span className="settle-amt">{money(transfer.amount)}</span>
          <button type="button" className="settle-paid" disabled={preview} onClick={() => void save(() => store.addRepayment({ from_id: transfer.from.id, to_id: transfer.to.id, amount_thb: transfer.amount }), 'Marked as settled.')}>Mark paid</button>
        </div>)}</div>}
      </> : <p className="empty-inline">All shared costs are settled up.</p>) : <p className="empty-inline">No shared expenses yet. Tick &ldquo;Split this&rdquo; when adding a spend to split it with the group.</p>}
      {data.repayments.length > 0 && <div className="repaid-list">{data.repayments.map((repayment) => { const from = travellerById(repayment.from_id); const to = travellerById(repayment.to_id); return <div className="repaid-row" key={repayment.id}>
        <Check size={14} /><span className="repaid-text">{from?.name.replace(/\s*\(Admin\)$/i, '') ?? '—'} paid {to?.name.replace(/\s*\(Admin\)$/i, '') ?? '—'} {money(Number(repayment.amount_thb))}</span>
        <IconButton label="Undo settlement" className="repaid-undo" disabled={preview} onClick={() => void save(() => store.deleteRepayment(repayment.id))}><Trash2 size={14} /></IconButton>
      </div> })}</div>}
    </section>

    <details className="planning-budget"><summary><Wallet size={15} /><span>Planning estimates</span><span className="count-badge">{money(planning.estimated)}</span><ChevronDown size={16} /></summary>
      <p className="empty-inline">Pre-trip cost estimates on tasks. They stay as a reference, separate from what you actually spend.</p>
      {planning.tasks.length > 0 && <div className="cost-list"><div className="cost-column-head"><span>Booking / task</span><span>Estimate</span><span>Actual</span></div>
        {planning.tasks.map((task) => <Link to={`/?task=${task.id}`} className="cost-row" key={task.id}>
          <span><span className={`cost-category-dot dot-${task.category}`} /><span>{task.title}<ArrowUpRight size={12} /></span></span>
          <span>{task.est_cost_thb === null ? '\u2014' : money(Number(task.est_cost_thb))}</span><span className={task.actual_cost_thb === null ? 'cost-unset' : ''}>{task.actual_cost_thb === null ? '\u2014' : money(Number(task.actual_cost_thb))}</span>
        </Link>)}
      </div>}
    </details>
    <p className="exchange-rate">1 THB &asymp; {rate.toFixed(2)} INR &middot; {liveRate ? 'Live rate' : 'Using planning rate'}{liveRate && rateAt ? ` · updated ${relativeTime(new Date(rateAt).toISOString())}` : ''}</p>
  </div>
}

const SHARE_KEY = 'thailand26:share-location'
const STALE_MS = 5 * 60 * 1000

export function MapPage() {
  const { data, me, store, connection } = useTrip()
  const preview = connection === 'preview'
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const fitted = useRef(false)
  const [sharing, setSharing] = useState(() => { try { return localStorage.getItem(SHARE_KEY) === 'on' } catch { return false } })
  const [geoError, setGeoError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const located = data.locations.filter((loc) => data.travellers.some((person) => person.id === loc.traveller_id))
  const myLoc = located.find((loc) => loc.traveller_id === me?.id)

  useEffect(() => {
    if (!container.current || mapRef.current) return
    const map = L.map(container.current, { zoomControl: true, attributionControl: false, worldCopyJump: true }).setView([13.2, 100.9], 6)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    const timer = setTimeout(() => map.invalidateSize(), 80)
    return () => { clearTimeout(timer); map.remove(); mapRef.current = null; layerRef.current = null; fitted.current = false }
  }, [])

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer) }, [])

  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const points: L.LatLngTuple[] = []
    for (const loc of located) {
      const traveller = data.travellers.find((person) => person.id === loc.traveller_id)
      if (!traveller) continue
      const stale = now - new Date(loc.updated_at).getTime() > STALE_MS
      const isMe = me?.id === traveller.id
      const icon = L.divIcon({
        className: 'map-pin', iconSize: [42, 54], iconAnchor: [21, 50], tooltipAnchor: [0, -50],
        html: `<span class="map-pin-badge ${stale ? 'stale' : ''} ${isMe ? 'me' : ''}" style="--pin:${traveller.colour}">${travellerInitials(traveller.name)}</span>`,
      })
      const label = document.createElement('span')
      label.textContent = `${traveller.name.replace(/\s*\(Admin\)$/i, '')} \u00b7 ${relativeTime(loc.updated_at, new Date(now))}`
      L.marker([loc.lat, loc.lng], { icon, title: traveller.name })
        .bindTooltip(label, { direction: 'top' })
        .addTo(layer)
      points.push([loc.lat, loc.lng])
    }
    if (points.length && !fitted.current) {
      fitted.current = true
      if (points.length === 1) map.setView(points[0], 15)
      else map.fitBounds(L.latLngBounds(points).pad(0.3))
    }
  }, [located, data.travellers, me, now])

  useEffect(() => {
    if (!sharing || !me || preview) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setGeoError('This device has no location support.'); return }
    if (typeof window !== 'undefined' && window.isSecureContext === false) { setGeoError('Location needs a secure (https) connection. Open the https link, not an IP address.'); return }
    let last = 0
    let watch = 0
    let triedLowAccuracy = false
    const onPosition = (position: GeolocationPosition) => {
      setGeoError(null)
      const stamp = Date.now()
      if (stamp - last < 15_000) return
      last = stamp
      void store.shareLocation({
        traveller_id: me.id, lat: position.coords.latitude, lng: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
      }).catch(() => {})
    }
    const onError = (error: GeolocationPositionError) => {
      if (!triedLowAccuracy && (error.code === error.POSITION_UNAVAILABLE || error.code === error.TIMEOUT)) {
        triedLowAccuracy = true
        navigator.geolocation.clearWatch(watch)
        watch = navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30_000 })
        return
      }
      setGeoError(
        error.code === error.PERMISSION_DENIED ? 'Location permission denied. Allow location for this site in your browser, then tap share again.'
        : error.code === error.POSITION_UNAVAILABLE ? 'Your location is unavailable. On a laptop, turn on Location Services in system settings, or try from your phone.'
        : error.code === error.TIMEOUT ? 'Timed out finding your location. Try again in a moment or move to an open area.'
        : 'Could not read your location.')
    }
    watch = navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy: true, maximumAge: 30_000, timeout: 27_000 })
    return () => navigator.geolocation.clearWatch(watch)
  }, [sharing, me, preview, store])

  const toggleShare = async () => {
    const next = !sharing
    setSharing(next)
    try { localStorage.setItem(SHARE_KEY, next ? 'on' : 'off') } catch { void 0 }
    if (next) { toast('Sharing your live location with the group.') }
    else { setGeoError(null); if (me) await store.stopLocation(me.id); toast('Live location off.') }
  }

  const centerGroup = () => {
    const map = mapRef.current
    if (!map || !located.length) return
    const points = located.map((loc) => [loc.lat, loc.lng] as L.LatLngTuple)
    if (points.length === 1) map.setView(points[0], 15)
    else map.fitBounds(L.latLngBounds(points).pad(0.3))
  }

  const findMe = () => {
    const map = mapRef.current
    if (!map) return
    if (myLoc) { map.setView([myLoc.lat, myLoc.lng], 16); return }
    if (!navigator.geolocation) { setGeoError('This device has no location support.'); return }
    const locate = (highAccuracy: boolean) => navigator.geolocation.getCurrentPosition(
      (position) => { setGeoError(null); map.setView([position.coords.latitude, position.coords.longitude], 16) },
      (error) => {
        if (highAccuracy && (error.code === error.POSITION_UNAVAILABLE || error.code === error.TIMEOUT)) { locate(false); return }
        setGeoError(error.code === error.PERMISSION_DENIED ? 'Location permission denied. Allow location for this site.' : 'Could not find your location. Turn on Location Services or try from your phone.')
      },
      { enableHighAccuracy: highAccuracy, timeout: highAccuracy ? 15_000 : 30_000, maximumAge: 60_000 })
    locate(true)
  }

  return <div className="page-body standalone-page map-page">
    <div className="page-heading"><div><span className="eyebrow">FIND EACH OTHER</span><h2>Live map<span className="heading-dot">.</span></h2></div><span className="page-symbol"><MapPinned size={24} /></span></div>
    <div className="map-wrap">
      <div className="map-canvas" ref={container} role="application" aria-label="Live location map of the group" />
      <div className="map-floats">
        <IconButton label="Center on the group" className="map-float" onClick={centerGroup}><Users size={18} /></IconButton>
        <IconButton label="Find me" className="map-float" onClick={findMe}><Crosshair size={18} /></IconButton>
      </div>
      {located.length === 0 && <div className="map-hint"><RadioTower size={18} /><p>No one is sharing yet. Turn on your live location so the group can find you if you split up.</p></div>}
    </div>
    <p className="map-credit">Map &copy; OpenStreetMap contributors</p>
    <button className={`button full-width share-toggle ${sharing ? 'button-secondary' : 'button-primary'}`} onClick={() => void toggleShare()} disabled={preview || !me}>
      {sharing ? <><WifiOff size={17} />Stop sharing my location</> : <><LocateFixed size={17} />Share my live location</>}
    </button>
    {geoError && <p className="map-error"><TriangleAlert size={14} />{geoError}</p>}
    {preview && <p className="preview-form-note">Read-only preview. Connect Supabase to share live location.</p>}
    <ul className="map-people" aria-label="Who is sharing">
      {data.travellers.map((traveller) => {
        const loc = located.find((item) => item.traveller_id === traveller.id)
        const stale = loc ? now - new Date(loc.updated_at).getTime() > STALE_MS : false
        return <li className="map-person" key={traveller.id}>
          <Avatar traveller={traveller} small mine={traveller.id === me?.id} />
          <span className="map-person-name">{traveller.name.replace(/\s*\(Admin\)$/i, '')}</span>
          <span className={`map-person-status ${loc ? (stale ? 'stale' : 'live') : 'off'}`}>{loc ? (stale ? relativeTime(loc.updated_at, new Date(now)) : 'Live now') : 'Not sharing'}</span>
        </li>
      })}
    </ul>
    <section className="emergency" aria-label="Emergency numbers in Thailand">
      <div className="emergency-head"><TriangleAlert size={15} /><h3>Emergency in Thailand</h3></div>
      <div className="emergency-grid">
        <a href="tel:1155" className="emergency-item"><strong>1155</strong><span>Tourist Police</span></a>
        <a href="tel:191" className="emergency-item"><strong>191</strong><span>Police</span></a>
        <a href="tel:1669" className="emergency-item"><strong>1669</strong><span>Ambulance</span></a>
        <a href="tel:199" className="emergency-item"><strong>199</strong><span>Fire</span></a>
      </div>
    </section>
    <p className="privacy-note">Your live location is shared with everyone who has this link while sharing is on. Turn it off anytime &mdash; no location history is kept.</p>
  </div>
}