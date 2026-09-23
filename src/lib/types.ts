export type Category = 'urgent' | 'booking' | 'optional' | 'admin'
export type TaskStatus = 'todo' | 'doing' | 'done'
export type Filter = 'all' | Category | 'mine' | 'done'

export interface Traveller {
  id: string
  name: string
  colour: string
  created_at: string
}

export interface Task {
  id: string
  title: string
  detail: string | null
  category: Category
  status: TaskStatus
  owner_id: string | null
  due_date: string | null
  trip_day: string | null
  est_cost_thb: number | null
  actual_cost_thb: number | null
  booking_url: string | null
  booking_ref: string | null
  is_everyone: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Completion {
  id: string
  task_id: string
  traveller_id: string
  completed_at: string
}

export interface Comment {
  id: string
  task_id: string
  traveller_id: string | null
  body: string
  created_at: string
}

export interface ItineraryDay {
  id: string
  day_date: string
  city: string
  hotel: string | null
  title: string
  notes: string | null
  watch_out: string | null
  conflict_note: string | null
  created_at: string
}

export interface Activity {
  id: string
  task_id: string | null
  traveller_id: string | null
  action: string
  created_at: string
}

export interface TripData {
  travellers: Traveller[]
  tasks: Task[]
  task_completions: Completion[]
  comments: Comment[]
  itinerary_days: ItineraryDay[]
  activity: Activity[]
}

export type TaskPatch = Partial<Pick<Task,
  'title' | 'detail' | 'category' | 'owner_id' | 'due_date' | 'trip_day' |
  'est_cost_thb' | 'actual_cost_thb' | 'booking_url' | 'booking_ref'
>>

export type NewTask = Pick<Task,
  'title' | 'detail' | 'category' | 'owner_id' | 'due_date' |
  'trip_day' | 'est_cost_thb' | 'is_everyone'
>