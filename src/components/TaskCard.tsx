import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { CalendarDays, Check, ChevronDown, ExternalLink, LoaderCircle, MessageCircle, Minus, Pencil, Plus, Save, Send, TriangleAlert, UserRound, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { CATEGORY_LABELS, CATEGORIES, completedTravellers, dueState, formatDate, money, relativeTime, safeBookingUrl, taskStatus } from '../lib/trip.ts'
import type { Category, NewTask, Task, TaskPatch } from '../lib/types.ts'
import { useTrip } from '../lib/use-trip.tsx'
import { Avatar, IconButton, Markdown, Sheet } from './ui.tsx'

export function TaskForm({ task, onSubmit, onCancel, busy }:
  { task?: Task; onSubmit: (values: NewTask & TaskPatch) => Promise<void>; onCancel: () => void; busy: boolean }) {
  const { data, connection } = useTrip()
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const text = (name: string) => String(fields.get(name) ?? '').trim()
    const optional = (name: string) => text(name) || null
    const numeric = (name: string) => text(name) ? Number(text(name)) : null
    const bookingUrl = optional('booking_url')
    if (bookingUrl && !safeBookingUrl(bookingUrl)) { toast.error('Use an http or https booking link.'); return }
    await onSubmit({
      title: text('title'), detail: optional('detail'), category: text('category') as Category,
      owner_id: optional('owner_id'), due_date: optional('due_date'), trip_day: optional('trip_day'),
      est_cost_thb: numeric('est_cost_thb'), is_everyone: task?.is_everyone ?? fields.get('is_everyone') === 'on',
      ...(task ? { actual_cost_thb: numeric('actual_cost_thb'), booking_url: bookingUrl, booking_ref: optional('booking_ref') } : {}),
    })
  }
  return <form className="task-form" onSubmit={submit}>
    <label>Task<input name="title" defaultValue={task?.title} required maxLength={200} placeholder="What needs sorting?" autoFocus /></label>
    <div className="form-grid">
      <label>Category<select name="category" defaultValue={task?.category ?? 'booking'}>
        {CATEGORIES.map((category) => <option value={category} key={category}>{CATEGORY_LABELS[category]}</option>)}
      </select></label>
      <label>Owner<select name="owner_id" defaultValue={task?.owner_id ?? ''}>
        <option value="">Unassigned</option>{data.travellers.map((traveller) => <option value={traveller.id} key={traveller.id}>{traveller.name}</option>)}
      </select></label>
      <label>Due date<input type="date" name="due_date" defaultValue={task?.due_date ?? ''} /></label>
      <label>Trip day<select name="trip_day" defaultValue={task?.trip_day ?? ''}>
        <option value="">No specific day</option>{data.itinerary_days.map((day) => <option value={day.day_date} key={day.id}>{formatDate(day.day_date)} - {day.city}</option>)}
      </select></label>
      <label>Estimate (THB, total)<input type="number" name="est_cost_thb" min="0" max="9999999999.99" step="0.01" inputMode="decimal" placeholder="Not set" defaultValue={task?.est_cost_thb ?? ''} /></label>
      {task && <label>Actual (THB, total)<input type="number" name="actual_cost_thb" min="0" max="9999999999.99" step="0.01" inputMode="decimal" placeholder="Not recorded" defaultValue={task.actual_cost_thb ?? ''} /></label>}
    </div>
    <label>Notes<textarea name="detail" rows={5} maxLength={20000} defaultValue={task?.detail ?? ''} placeholder="Details, decisions, things worth remembering..." /></label>
    {task ? <>
      <label>Booking link<input type="url" name="booking_url" placeholder="https://" defaultValue={task.booking_url ?? ''} /></label>
      <label>Public booking note<input name="booking_ref" maxLength={200} defaultValue={task.booking_ref ?? ''} placeholder="Non-sensitive reference only" /></label>
      <p className="privacy-note">Anyone with this app can read these fields. Keep PNRs, private confirmation links and passport details in your private folder.</p>
    </> : <label className="checkbox-label"><input type="checkbox" name="is_everyone" /><span>Everyone needs to do this individually</span></label>}
    {connection === 'preview' && <p className="preview-form-note">Read-only preview. Supabase is not connected.</p>}
    <div className="form-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button>
      <button type="submit" className="button button-primary" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : <Save size={17} />}{busy ? 'Saving...' : task ? 'Save changes' : 'Add task'}</button>
    </div>
  </form>
}

export function AddTaskSheet({ onClose }: { onClose: () => void }) {
  const { store, me, save, pending } = useTrip()
  return <Sheet title="One more thing" description="Add a task to the shared trip" onClose={onClose}>
    <TaskForm busy={pending.includes('new-task')} onCancel={onClose} onSubmit={async (values) => {
      if (!me) return
      if (await save(() => store.mutate(me.id, 'create_task', values, 'new-task'), 'Added to the trip.')) onClose()
    }} />
  </Sheet>
}

function AssignSheet({ task, onClose }: { task: Task; onClose: () => void }) {
  const { data, me, store, save, pending } = useTrip()
  const current = data.tasks.find((candidate) => candidate.id === task.id) ?? task
  const assign = async (owner: string | null) => {
    if (!me) return
    if (await save(() => store.mutate(me.id, 'update_task', {
      task_id: current.id, expected_updated_at: current.updated_at, patch: { owner_id: owner },
    }, task.id), owner ? 'Owner updated.' : 'Task unassigned.')) onClose()
  }
  return <Sheet title="Who's on it?" description={task.title} onClose={onClose}>
    <p className="sheet-subtitle">{task.title}</p>
    <div className="people-list">{data.travellers.map((traveller) => <button className="person-option" key={traveller.id}
      onClick={() => void assign(traveller.id)} disabled={pending.includes(task.id)} aria-pressed={current.owner_id === traveller.id}>
      <Avatar traveller={traveller} /><span>{traveller.name}{traveller.id === me?.id && <small>That's me</small>}</span>
      {current.owner_id === traveller.id && <Check size={19} />}
    </button>)}<button className="person-option unassign-option" onClick={() => void assign(null)} disabled={pending.includes(task.id)}><X size={21} /><span>Unassign</span></button></div>
  </Sheet>
}

export function TaskCard({ task, initiallyOpen = false, compact = false }:
  { task: Task; initiallyOpen?: boolean; compact?: boolean }) {
  const { data, me, store, save, pending, today } = useTrip()
  const [open, setOpen] = useState(initiallyOpen)
  const [assigning, setAssigning] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [comment, setComment] = useState('')
  const detailsId = useId()
  const status = taskStatus(task, data)
  const owner = data.travellers.find((traveller) => traveller.id === task.owner_id)
  const completions = completedTravellers(task, data)
  const comments = data.comments.filter((entry) => entry.task_id === task.id)
  const due = dueState(task, data, today)
  const conflict = data.itinerary_days.find((day) => day.day_date === task.trip_day)?.conflict_note
  const busy = pending.includes(task.id)
  const bookingUrl = safeBookingUrl(task.booking_url)
  const cycle = async () => {
    if (me) await save(() => store.mutate(me.id, 'cycle_status', { task_id: task.id, expected_updated_at: task.updated_at }, task.id))
  }
  const complete = async () => {
    if (me) await save(() => store.mutate(me.id, 'set_completion', { task_id: task.id, completed: !completions.has(me.id) }, task.id))
  }
  return <article className={`task-card category-${task.category} ${status === 'done' ? 'task-done' : ''} ${compact ? 'task-compact' : ''}`} data-task-id={task.id}>
    <div className="task-top">
      {task.is_everyone ? <span className="group-task-icon" title="For every traveller"><Users size={21} /></span> :
        <button className="status-button" type="button" role="checkbox" aria-checked={status === 'doing' ? 'mixed' : status === 'done'}
          aria-label={`${task.title}: ${status === 'todo' ? 'to do; mark in progress' : status === 'doing' ? 'in progress; mark done' : 'done; reopen'}`}
          title={status === 'todo' ? 'Mark in progress' : status === 'doing' ? 'Mark done' : 'Reopen task'} disabled={busy} onClick={() => void cycle()}>
          <span className={`status-mark status-${status}`}>{busy ? <LoaderCircle size={16} className="spin" /> : status === 'done' ? <Check size={17} strokeWidth={3} /> : status === 'doing' ? <Minus size={16} /> : null}</span>
        </button>}
      <button className="task-toggle" type="button" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen(!open)}>
        <span>{task.title}</span><ChevronDown size={17} className={open ? 'chevron-open' : ''} />
      </button>
    </div>
    <div className="task-meta">
      <span className={`category-tag ${task.category}`}>{CATEGORY_LABELS[task.category]}</span>
      {status === 'doing' && !task.is_everyone && <span className="status-label">In progress</span>}
      {conflict && <span className="conflict-icon" title={conflict} role="img" aria-label={`Schedule conflict: ${conflict}`}><TriangleAlert size={15} /></span>}
      {due && <span className={`due-chip ${due.overdue ? 'overdue' : ''}`}><CalendarDays size={12} />{due.label}</span>}
      {task.est_cost_thb !== null && <span className="cost-chip">{money(Number(task.est_cost_thb))}</span>}
      {comments.length > 0 && <button className="comment-count" onClick={() => setOpen(true)} title={`${comments.length} comments`} aria-label={`${comments.length} comments on ${task.title}`}><MessageCircle size={14} />{comments.length}</button>}
      <button className={`owner-chip ${owner ? '' : 'unassigned'}`} onClick={() => setAssigning(true)} aria-label={`Assign ${task.title}`} title={owner ? `Assigned to ${owner.name}` : 'Assign an owner'}>
        {owner ? <><Avatar traveller={owner} small /><span>{owner.id === me?.id ? 'Me' : owner.name}</span></> : <><Plus size={13} /><span>Assign</span></>}
      </button>
    </div>
    {task.is_everyone && <div className="everyone-row"><span><strong>{completions.size}</strong> / {data.travellers.length} done</span>
      <div className="completion-avatars">{data.travellers.map((traveller) => traveller.id === me?.id
        ? <button type="button" key={traveller.id} className="completion-button" disabled={busy} onClick={() => void complete()}
          aria-pressed={completions.has(traveller.id)} aria-label={`${completions.has(traveller.id) ? 'Undo' : 'Mark'} ${task.title} ${completions.has(traveller.id) ? 'for me' : 'done for me'}`}
          title={completions.has(traveller.id) ? 'Undo my completion' : 'Mark myself done'}><Avatar traveller={traveller} small mine done={completions.has(traveller.id)} /></button>
        : <span className="completion-static" key={traveller.id} title={`${traveller.name}: ${completions.has(traveller.id) ? 'done' : 'not done'}`}><Avatar traveller={traveller} small done={completions.has(traveller.id)} /></span>)}</div>
    </div>}
    {open && <div className="task-detail" id={detailsId}>
      {editing ? <TaskForm task={editing} busy={busy} onCancel={() => setEditing(null)} onSubmit={async (values) => {
        if (!me) return
        const { is_everyone: everyone, ...patch } = values
        void everyone
        const saved = await save(() => store.mutate(me.id, 'update_task', { task_id: task.id, expected_updated_at: editing.updated_at, patch }, task.id), 'Details saved.')
        if (saved || store.getSnapshot().data.tasks.find((candidate) => candidate.id === task.id)?.updated_at !== editing.updated_at) setEditing(null)
      }} /> : <>
        {task.detail ? <Markdown>{task.detail}</Markdown> : <p className="muted">No notes yet.</p>}
        <dl className="task-facts">
          {task.trip_day && <div><dt>Trip day</dt><dd>{formatDate(task.trip_day, { weekday: 'short' })}</dd></div>}
          {task.due_date && <div><dt>Due</dt><dd>{formatDate(task.due_date)}</dd></div>}
          <div><dt>Estimate</dt><dd>{task.est_cost_thb === null ? 'Not set' : money(Number(task.est_cost_thb))}</dd></div>
          <div><dt>Actual</dt><dd>{task.actual_cost_thb === null ? 'Not recorded' : money(Number(task.actual_cost_thb))}</dd></div>
          {task.booking_ref && <div><dt>Booking note</dt><dd>{task.booking_ref}</dd></div>}
        </dl>
        <div className="detail-actions">{bookingUrl && <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="button button-secondary"><ExternalLink size={15} />Booking link</a>}
          <button type="button" className="button button-secondary" onClick={() => setEditing({ ...task })}><Pencil size={15} />Edit details</button>
        </div>
      </>}
      <section className="comments-section" aria-label={`Comments on ${task.title}`}>
        <h4><MessageCircle size={15} />The conversation <span>{comments.length}</span></h4>
        {comments.length ? <ul className="comment-list">{comments.map((entry) => {
          const author = data.travellers.find((traveller) => traveller.id === entry.traveller_id)
          return <li key={entry.id}><Avatar traveller={author} small /><div><div className="comment-byline"><strong>{author?.name ?? 'Former traveller'}</strong><time dateTime={entry.created_at}>{relativeTime(entry.created_at)}</time></div><Markdown>{entry.body}</Markdown></div></li>
        })}</ul> : <p className="empty-inline">No updates from the group yet.</p>}
        <form className="comment-form" onSubmit={async (event) => {
          event.preventDefault()
          if (me && comment.trim() && await save(() => store.mutate(me.id, 'add_comment', { task_id: task.id, body: comment.trim() }, task.id))) setComment('')
        }}>
          <Avatar traveller={me} small /><textarea aria-label={`Comment on ${task.title}`} placeholder="Any news from your side?" rows={2} maxLength={4000} value={comment} onChange={(event) => setComment(event.target.value)} required />
          <IconButton label="Post comment" type="submit" disabled={busy || !comment.trim()}>{busy ? <LoaderCircle size={18} className="spin" /> : <Send size={18} />}</IconButton>
        </form>
      </section>
    </div>}
    {assigning && <AssignSheet task={task} onClose={() => setAssigning(false)} />}
  </article>
}

export function UnclaimedHint({ count }: { count: number }) {
  return <span className="unclaimed-hint"><UserRound size={13} />{count} unclaimed</span>
}