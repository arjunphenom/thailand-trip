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

async function send(device: DeviceSubscription, route: string, tag: string, body?: string | null): Promise<'sent' | 'expired' | 'retry'> {
  if (!validEndpoint(device.endpoint)) return 'expired'
  try {
    await webpush.sendNotification({ endpoint: device.endpoint, keys: device.keys }, JSON.stringify({ route, tag, body: typeof body === 'string' ? body.slice(0, 180) : undefined }), {
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
      const outcome = await send(device, job.route, job.id, job.body)
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

function b64(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text)
}
function fromB64(value: string): Uint8Array {
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) out[index] = binary.charCodeAt(index)
  return out
}
async function hashPin(pin: string, saltB64: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromB64(saltB64), iterations: 150000, hash: 'SHA-256' }, key, 256)
  return b64(new Uint8Array(bits))
}
function equalConstant(first: string, second: string): boolean {
  if (first.length !== second.length) return false
  let diff = 0
  for (let index = 0; index < first.length; index++) diff |= first.charCodeAt(index) ^ second.charCodeAt(index)
  return diff === 0
}
const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const docMimes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])

async function openVault(travellerId: string, pin: unknown): Promise<void> {
  if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) throw new RequestError('Enter your 4 to 8 digit PIN.', 403)
  const vault = await service.from('document_vaults').select('*').eq('traveller_id', travellerId).maybeSingle()
  ensure(vault)
  if (!vault.data) throw new RequestError('Set a documents PIN first.', 403)
  if (vault.data.locked_until && new Date(vault.data.locked_until) > new Date()) throw new RequestError('Too many wrong PINs. Try again in a few minutes.', 429)
  const hash = await hashPin(pin, vault.data.pin_salt)
  if (!equalConstant(hash, vault.data.pin_hash)) {
    const attempts = (vault.data.failed_attempts ?? 0) + 1
    const locked = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null
    await service.from('document_vaults').update({ failed_attempts: attempts, locked_until: locked }).eq('traveller_id', travellerId)
    throw new RequestError('That PIN is not correct.', 403)
  }
  if (vault.data.failed_attempts) await service.from('document_vaults').update({ failed_attempts: 0, locked_until: null }).eq('traveller_id', travellerId)
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
      const outcome = await send(result.data as DeviceSubscription, '/', `test-${crypto.randomUUID()}`, 'Test notification — you are all set.')
      if (outcome === 'expired') {
        ensure(await service.from('push_subscriptions').delete().eq('id', result.data.id))
        throw new RequestError('This device subscription expired. Enable notifications again.', 410)
      }
      if (outcome !== 'sent') throw new RequestError('The push provider could not accept the notification. Please retry.', 503)
      return respond({ accepted: true })
    }
    if (typeof action === 'string' && action.startsWith('shared-')) {
      if (action === 'shared-list') {
        const docs = await service.from('shared_documents').select('id, name, mime, size_bytes, created_at, path, traveller_id').order('created_at', { ascending: false })
        ensure(docs)
        const travellers = await service.from('travellers').select('id, name')
        ensure(travellers)
        const names = new Map((travellers.data ?? []).map((traveller) => [traveller.id, traveller.name]))
        const documents = await Promise.all((docs.data ?? []).map(async (doc) => {
          const signed = await service.storage.from('trip-docs').createSignedUrl(doc.path, 180)
          return { id: doc.id, name: doc.name, mime: doc.mime, size_bytes: doc.size_bytes, created_at: doc.created_at, uploaded_by: doc.traveller_id ? (names.get(doc.traveller_id) ?? null) : null, url: signed.data?.signedUrl ?? null }
        }))
        return respond({ documents })
      }
      if (action === 'shared-upload') {
        if (!isUuid(body.traveller)) throw new RequestError('Choose your traveller first.')
        const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : ''
        if (!name) throw new RequestError('Give the document a name.')
        if (typeof body.mime !== 'string' || !docMimes.has(body.mime)) throw new RequestError('Only PDF or image files are allowed.')
        const size = Number(body.size)
        if (!Number.isFinite(size) || size <= 0 || size > 26214400) throw new RequestError('Files must be under 25 MB.')
        const count = await service.from('shared_documents').select('id', { count: 'exact', head: true })
        ensure(count)
        if ((count.count ?? 0) >= 200) throw new RequestError('Shared document limit reached. Remove some first.', 409)
        const path = `shared/${crypto.randomUUID()}`
        const signed = await service.storage.from('trip-docs').createSignedUploadUrl(path)
        if (signed.error || !signed.data) throw new RequestError('Could not start the upload. Please retry.', 503)
        ensure(await service.from('shared_documents').insert({ traveller_id: body.traveller as string, name, path, mime: body.mime, size_bytes: Math.round(size) }))
        return respond({ path, token: signed.data.token })
      }
      if (action === 'shared-delete') {
        if (!isUuid(body.id)) throw new RequestError('Invalid document.')
        const doc = await service.from('shared_documents').select('path').eq('id', body.id as string).maybeSingle()
        ensure(doc)
        if (doc.data) {
          await service.storage.from('trip-docs').remove([doc.data.path])
          ensure(await service.from('shared_documents').delete().eq('id', body.id as string))
        }
        return respond({ deleted: true })
      }
    }
    if (typeof action === 'string' && action.startsWith('doc-')) {
      if (!isUuid(body.traveller)) throw new RequestError('Choose your traveller first.')
      const travellerId = body.traveller as string
      if (action === 'doc-status') {
        const vault = await service.from('document_vaults').select('traveller_id, locked_until').eq('traveller_id', travellerId).maybeSingle()
        ensure(vault)
        const locked = !!(vault.data?.locked_until && new Date(vault.data.locked_until) > new Date())
        return respond({ hasPin: !!vault.data, locked })
      }
      if (action === 'doc-setpin') {
        if (typeof body.pin !== 'string' || !/^\d{4,8}$/.test(body.pin)) throw new RequestError('PIN must be 4 to 8 digits.')
        const traveller = await service.from('travellers').select('id').eq('id', travellerId).maybeSingle()
        ensure(traveller)
        if (!traveller.data) throw new RequestError('Choose your traveller first.')
        const existing = await service.from('document_vaults').select('traveller_id').eq('traveller_id', travellerId).maybeSingle()
        ensure(existing)
        if (existing.data) throw new RequestError('A PIN is already set for this traveller.', 409)
        const salt = b64(crypto.getRandomValues(new Uint8Array(16)))
        const hash = await hashPin(body.pin, salt)
        ensure(await service.from('document_vaults').insert({ traveller_id: travellerId, pin_hash: hash, pin_salt: salt }))
        return respond({ set: true })
      }
      if (action === 'doc-admin-reset') {
        const adminSecret = Deno.env.get('TRIP_ADMIN_SECRET')
        if (!adminSecret || typeof body.admin !== 'string' || !await sameSecret(body.admin, adminSecret)) {
          throw new RequestError('That admin code is not correct.', 403)
        }
        ensure(await service.from('document_vaults').delete().eq('traveller_id', travellerId))
        return respond({ reset: true })
      }
      await openVault(travellerId, body.pin)
      if (action === 'doc-list') {
        const docs = await service.from('documents').select('id, name, mime, size_bytes, created_at, path').eq('traveller_id', travellerId).order('created_at', { ascending: false })
        ensure(docs)
        const documents = await Promise.all((docs.data ?? []).map(async (doc) => {
          const signed = await service.storage.from('trip-docs').createSignedUrl(doc.path, 180)
          return { id: doc.id, name: doc.name, mime: doc.mime, size_bytes: doc.size_bytes, created_at: doc.created_at, url: signed.data?.signedUrl ?? null }
        }))
        return respond({ documents })
      }
      if (action === 'doc-upload') {
        const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : ''
        if (!name) throw new RequestError('Give the document a name.')
        if (typeof body.mime !== 'string' || !docMimes.has(body.mime)) throw new RequestError('Only PDF or image files are allowed.')
        const size = Number(body.size)
        if (!Number.isFinite(size) || size <= 0 || size > 26214400) throw new RequestError('Files must be under 25 MB.')
        const count = await service.from('documents').select('id', { count: 'exact', head: true }).eq('traveller_id', travellerId)
        ensure(count)
        if ((count.count ?? 0) >= 50) throw new RequestError('Document limit reached. Remove some first.', 409)
        const path = `${travellerId}/${crypto.randomUUID()}`
        const signed = await service.storage.from('trip-docs').createSignedUploadUrl(path)
        if (signed.error || !signed.data) throw new RequestError('Could not start the upload. Please retry.', 503)
        ensure(await service.from('documents').insert({ traveller_id: travellerId, name, path, mime: body.mime, size_bytes: Math.round(size) }))
        return respond({ path, token: signed.data.token })
      }
      if (action === 'doc-delete') {
        if (!isUuid(body.id)) throw new RequestError('Invalid document.')
        const doc = await service.from('documents').select('path').eq('id', body.id as string).eq('traveller_id', travellerId).maybeSingle()
        ensure(doc)
        if (doc.data) {
          await service.storage.from('trip-docs').remove([doc.data.path])
          ensure(await service.from('documents').delete().eq('id', body.id as string).eq('traveller_id', travellerId))
        }
        return respond({ deleted: true })
      }
    }
    throw new RequestError('Unknown action.')
  } catch (error) {
    if (error instanceof RequestError) return respond({ error: error.message }, error.status)
    console.error('Trip notification request failed')
    return respond({ error: 'The notification service is temporarily unavailable.' }, 503)
  }
})