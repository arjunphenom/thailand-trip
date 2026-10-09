import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

export const tripClient = url && key ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 20 } },
}) : null

export async function appRequest<Result>(action: string, payload: Record<string, unknown> = {}): Promise<Result> {
  if (!tripClient) throw new Error('This is a read-only preview.')
  const { data, error } = await tripClient.functions.invoke('trip-notifications', { body: { action, ...payload } })
  if (error) {
    let message = 'The app service is unavailable. Please try again.'
    if (error.context instanceof Response) {
      const response = await error.context.json().catch(() => null)
      if (typeof response?.error === 'string') message = response.error
    }
    throw new Error(message)
  }
  return data as Result
}

export function invitationToken(value: string): string {
  const trimmed = value.trim()
  try {
    const link = new URL(trimmed)
    return new URLSearchParams(link.hash.split('?')[1] ?? '').get('invite') ?? ''
  } catch { return /^[A-Za-z0-9_-]{32,128}$/.test(trimmed) ? trimmed : '' }
}

export async function joinTrip(value: string): Promise<string> {
  if (!tripClient) throw new Error('Connect the app before joining.')
  const invite = invitationToken(value)
  if (!invite) throw new Error('Paste the private invitation link shared by your group.')
  let { data: { session } } = await tripClient.auth.getSession()
  if (!session) {
    const result = await tripClient.auth.signInAnonymously()
    if (result.error || !result.data.session) throw new Error('Could not sign in this device. Please try again.')
    session = result.data.session
  }
  await appRequest('join', { invite })
  try { localStorage.setItem('thailand26:member', session.user.id) } catch {}
  return session.user.id
}