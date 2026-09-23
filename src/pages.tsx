import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowDownToLine, ArrowRight, ArrowUpRight, CalendarDays, Check, CheckCheck, ChevronDown, Copy, History, Hotel, ListTodo, MapPin, Plane, Plus, RefreshCw, Send, TriangleAlert, Users, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { CATEGORIES, CATEGORY_LABELS, THB_TO_INR, TRIP_TITLE, countdown, costs, daysBetween, filterTasks, formatDate, money, progress, relativeTime, shareSummary, taskStatus } from './lib/trip.ts'
import type { Filter, ItineraryDay } from './lib/types.ts'
import { useTrip } from './lib/use-trip.tsx'
import { AddTaskSheet, TaskCard, UnclaimedHint } from './components/TaskCard.tsx'
import { Avatar, EmptyState, IconButton, Markdown, PhotoCredit } from './components/ui.tsx'

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

export function ItineraryPage() {
  const { data } = useTrip()
  return <div className="page-body standalone-page"><div className="page-heading"><div><span className="eyebrow">31 OCT &ndash; 8 NOV 2026</span><h2>Day by day<span className="heading-dot">.</span></h2></div><span className="page-symbol"><MapPin size={24} /></span></div>
    <div className="itinerary-route"><span>Phuket</span><ArrowRight size={14} /><span>Pattaya</span><ArrowRight size={14} /><span>Bangkok</span></div>
    {data.itinerary_days.length ? <div className="timeline">{data.itinerary_days.map((day) => <div className="timeline-day" key={day.id}>
      <span className="timeline-number">{String(daysBetween('2026-10-31', day.day_date) + 1).padStart(2, '0')}</span><DayCard day={day} />
    </div>)}</div> : <EmptyState icon={CalendarDays} title="The days are still open" detail="No itinerary has been added yet." />}
  </div>
}

export function MoneyPage() {
  const { data } = useTrip()
  const total = costs(data)
  return <div className="page-body standalone-page"><div className="page-heading"><div><span className="eyebrow">THE GROUP BUDGET</span><h2>Money matters<span className="heading-dot">.</span></h2></div><span className="page-symbol"><Wallet size={24} /></span></div>
    <section className="money-totals" aria-label="Group totals"><div><span className="stat-label">Total estimate</span><strong>{money(total.estimated)}</strong><span>{money(total.estimated * THB_TO_INR, 'INR')}</span></div>
      <div><span className="stat-label">Actual recorded</span><strong>{money(total.actual)}</strong><span>{money(total.actual * THB_TO_INR, 'INR')}</span></div>
    </section>
    <p className="cost-coverage">{total.recorded} of {total.tasks.length} actual costs recorded</p>
    <section className="per-person" aria-label="Per person share"><div className="per-person-title"><Users size={20} /><div><h3>Per person</h3><p>Across {total.people} travellers</p></div></div>
      <div><span>Estimated</span><strong>{money(total.perPerson)}</strong><small>{money(total.perPerson * THB_TO_INR, 'INR')}</small></div>
      <div><span>Actual</span><strong>{money(total.actualPerPerson)}</strong><small>{money(total.actualPerPerson * THB_TO_INR, 'INR')}</small></div>
    </section>
    <div className="cost-list-heading"><h3>The breakdown</h3><span>THB</span></div>
    {total.tasks.length ? <div className="cost-list"><div className="cost-column-head"><span>Booking / task</span><span>Estimate</span><span>Actual</span></div>
      {total.tasks.map((task) => <Link to={`/?task=${task.id}`} className="cost-row" key={task.id}>
        <span><span className={`cost-category-dot dot-${task.category}`} /><span>{task.title}<ArrowUpRight size={12} /></span></span>
        <span>{task.est_cost_thb === null ? '\u2014' : money(Number(task.est_cost_thb))}</span><span className={task.actual_cost_thb === null ? 'cost-unset' : ''}>{task.actual_cost_thb === null ? '\u2014' : money(Number(task.actual_cost_thb))}</span>
      </Link>)}
    </div> : <EmptyState icon={Wallet} title="No costs recorded" detail="The group budget is still open."><Link className="button button-secondary" to="/">Back to the checklist<ArrowRight size={15} /></Link></EmptyState>}
    <p className="exchange-rate">1 THB &asymp; {THB_TO_INR} INR &middot; Planning rate, not a live quote.</p>
  </div>
}

export function SharePage() {
  const { data, today } = useTrip()
  const text = shareSummary(data, today)
  const textArea = useRef<HTMLTextAreaElement>(null)
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Copied for the group.')
    } catch {
      textArea.current?.focus()
      textArea.current?.select()
      toast('Clipboard unavailable. The message is selected for copying.')
    }
  }
  return <div className="page-body standalone-page"><div className="page-heading"><div><span className="eyebrow">KEEP EVERYONE IN THE LOOP</span><h2>Send to the group<span className="heading-dot">.</span></h2></div><span className="page-symbol"><Send size={24} /></span></div>
    <div className="share-meta"><span className="whatsapp-dot" /><span>WhatsApp-ready</span><span>{progress(data).done}/{data.tasks.length} sorted</span></div>
    <div className="share-actions"><button className="button button-primary" onClick={() => void copy()}>{copied ? <Check size={18} /> : <Copy size={18} />}{copied ? 'Copied' : 'Copy to clipboard'}</button>
      {typeof navigator.share === 'function' && <button className="button button-secondary" onClick={async () => {
        try { await navigator.share({ title: TRIP_TITLE, text }) } catch (error) {
          if ((error as Error).name !== 'AbortError') toast.error('Sharing is unavailable. Copy the message instead.')
        }
      }}><ArrowUpRight size={18} />Share</button>}
    </div>
    <textarea className="share-text" aria-label="WhatsApp status message" ref={textArea} value={text} readOnly spellCheck={false} />
    <p className="privacy-note"><ArrowDownToLine size={14} />Passport scans and private booking codes belong in the group's private folder, not this app.</p>
  </div>
}