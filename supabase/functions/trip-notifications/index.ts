import { createClient } from 'npm:@supabase/supabase-js@2.117.1'
import webpush from 'npm:web-push@3.6.7'
import { notificationTopics, sameSecret, validEndpoint, validateSubscription, validateTopics } from './protocol.ts'

const appUrl = Deno.env.get('TRIP_APP_URL') ?? 'https://arjunphenom.github.io/thailand-trip/'
const allowedOrigins = new Set([new URL(appUrl).origin, 'http://localhost:8080', 'http://127.0.0.1:8080', 'http://127.0.0.1:4175'])
const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

class RequestError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

interface DeviceSubscription {
  id: string
  user_id: string
  endpoint: string
  keys: { auth: string; p256dh: string }
  topics: string[]
}

function ensure(result: { error: unknown }) {
  if (result.error) throw new RequestError('The notification service is temporarily unavailable.', 503)
}

async function permitted(userId: string, action: string) {
  const response = await service.rpc('allow_push_action', { p_user_id: userId, p_action: action })
  ensure(response)
  if (!response.data) throw new RequestError('Please wait a minute before trying again.', 429)
}

async function send(device: DeviceSubscription, route: string, tag: string): Promise<'sent' | 'expired' | 'retry'> {
  if (!validEndpoint(device.endpoint)) return 'expired'
  try {
    await webpush.sendNotification({ endpoint: device.endpoint, keys: device.keys }, JSON.stringify({ route, tag }), {
      vapidDetails: {
        subject: appUrl,
        publicKey: Deno.env.get('TRIP_VAPID_PUBLIC_KEY')!,
        privateKey: Deno.env.get('TRIP_VAPID_PRIVATE_KEY')!,
      },
      TTL: 3600,
      urgency: 'normal',
      timeout: 5000,
    })
    return 'sent'
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    return status === 404 || status === 410 ? 'expired' : 'retry'
  }
}

async function dispatch() {
  const claimed = await service.rpc('claim_push_jobs')
  ensure(claimed)
  const jobs = claimed.data ?? []
  for (const job of jobs) {
    const subscriptions = await service.from('push_subscriptions').select('*')
      .contains('topics', [job.topic]).neq('user_id', job.actor_user_id ?? '00000000-0000-0000-0000-000000000000')
    ensure(subscriptions)
    const delivered = await service.from('push_deliveries').select('subscription_id').eq('job_id', job.id)
    ensure(delivered)
    const completed = new Set(delivered.data?.map((entry) => entry.subscription_id))
    const devices = (subscriptions.data as DeviceSubscription[]).filter((device) => !completed.has(device.id))
    const outcomes = await Promise.all(devices.map(async (device) => {
      const outcome = await send(device, job.route, job.id)
      if (outcome === 'sent') {
        ensure(await service.from('push_deliveries').upsert({ job_id: job.id, subscription_id: device.id }))
      } else if (outcome === 'expired') {
        ensure(await service.from('push_subscriptions').delete().eq('id', device.id))
      }
      return outcome
    }))
    const retry = outcomes.includes('retry')
    ensure(await service.from('push_outbox').update({
      processed_at: retry ? null : new Date().toISOString(),
      locked_until: null,
      available_at: new Date(Date.now() + Math.min(3600, 30 * 2 ** job.attempts) * 1000).toISOString(),
      last_error: retry ? 'Push provider temporarily unavailable' : null,
    }).eq('id', job.id))
  }
  return { processed: jobs.length }
}

async function parseBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) return {}
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 16384) { await reader.cancel(); throw new RequestError('Request too large.', 413) }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    const body = JSON.parse(text || '{}')
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body')
    return body
  } catch (error) {
    if (error instanceof RequestError) throw error
    throw new RequestError('Invalid request.')
  } finally { reader.releaseLock() }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' }
  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info'
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
  }
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
  if (origin && !allowedOrigins.has(origin)) return respond({ error: 'Origin not allowed.' }, 403)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405)
  try {
    const body = await parseBody(request)
    const action = body.action
    if (action === 'dispatch') {
      const dispatchSecret = Deno.env.get('TRIP_DISPATCH_SECRET')
      if (!dispatchSecret || !await sameSecret(request.headers.get('x-trip-dispatch-secret') ?? '', dispatchSecret)) {
        throw new RequestError('Not authorized.', 401)
      }
      return respond(await dispatch())
    }
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) throw new RequestError('Open your invitation to join the trip.', 401)
    const { data: { user }, error } = await service.auth.getUser(token)
    if (error || !user) throw new RequestError('Your device session expired. Reopen your invitation.', 401)
    if (action === 'join') {
      await permitted(user.id, 'join')
      const invitation = Deno.env.get('TRIP_INVITE_TOKEN')
      if (!invitation || typeof body.invite !== 'string' || !await sameSecret(body.invite, invitation)) {
        throw new RequestError('This invitation is not valid.', 403)
      }
      ensure(await service.from('trip_memberships').upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true }))
      return respond({ joined: true })
    }
    const membership = await service.from('trip_memberships').select('user_id').eq('user_id', user.id).maybeSingle()
    ensure(membership)
    if (!membership.data) throw new RequestError('An invitation is required.', 403)
    if (action === 'config') {
      const publicKey = Deno.env.get('TRIP_VAPID_PUBLIC_KEY')
      if (!publicKey || !Deno.env.get('TRIP_VAPID_PRIVATE_KEY')) throw new RequestError('Push delivery is not configured.', 503)
      return respond({ publicKey, topics: notificationTopics })
    }
    if (action === 'invite') {
      const invitation = Deno.env.get('TRIP_INVITE_TOKEN')
      if (!invitation) throw new RequestError('Invitations are not configured.', 503)
      const link = new URL(appUrl)
      link.searchParams.set('app', '20261008')
      link.hash = `/join?invite=${encodeURIComponent(invitation)}`
      return respond({ url: link.href })
    }
    if (action === 'subscribe') {
      await permitted(user.id, 'subscribe')
      let subscription
      let topics
      try { subscription = validateSubscription(body.subscription); topics = validateTopics(body.topics) }
      catch (error) { throw new RequestError((error as Error).message) }
      const existing = await service.from('push_subscriptions').select('user_id').eq('endpoint', subscription.endpoint).maybeSingle()
      ensure(existing)
      if (existing.data && existing.data.user_id !== user.id) throw new RequestError('Turn notifications off and on again to reconnect this device.', 409)
      const count = await service.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
      ensure(count)
      if (!existing.data && (count.count ?? 0) >= 10) throw new RequestError('This account has reached its device limit.', 409)
      ensure(await service.from('push_subscriptions').upsert({ ...subscription, user_id: user.id, topics, updated_at: new Date().toISOString() }, { onConflict: 'endpoint' }))
      return respond({ subscribed: true })
    }
    if (action === 'status' || action === 'unsubscribe' || action === 'test') {
      if (!validEndpoint(body.endpoint)) throw new RequestError('Invalid device endpoint.')
      if (action === 'unsubscribe') {
        ensure(await service.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', body.endpoint))
        return respond({ subscribed: false })
      }
      const result = await service.from('push_subscriptions').select('*').eq('user_id', user.id).eq('endpoint', body.endpoint).maybeSingle()
      ensure(result)
      if (action === 'status') return respond({ subscribed: !!result.data, topics: result.data?.topics ?? notificationTopics })
      if (!result.data) throw new RequestError('Enable notifications on this device first.', 409)
      await permitted(user.id, 'test')
      const outcome = await send(result.data as DeviceSubscription, '/', `test-${crypto.randomUUID()}`)
      if (outcome === 'expired') {
        ensure(await service.from('push_subscriptions').delete().eq('id', result.data.id))
        throw new RequestError('This device subscription expired. Enable notifications again.', 410)
      }
      if (outcome !== 'sent') throw new RequestError('The push provider could not accept the notification. Please retry.', 503)
      return respond({ accepted: true })
    }
    throw new RequestError('Unknown action.')
  } catch (error) {
    if (error instanceof RequestError) return respond({ error: error.message }, error.status)
    console.error('Trip notification request failed')
    return respond({ error: 'The notification service is temporarily unavailable.' }, 503)
  }
})