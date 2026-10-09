export const notificationTopics = ['tasks', 'money', 'itinerary'] as const

export function validEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false
  try {
    const url = new URL(value)
    const host = url.hostname
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && (
      host === 'fcm.googleapis.com' || host === 'web.push.apple.com' ||
      host === 'updates.push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com') ||
      host.endsWith('.notify.windows.com')
    )
  } catch { return false }
}

export function validateSubscription(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('Invalid device subscription.')
  const subscription = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  const { endpoint, keys } = subscription
  if (!validEndpoint(endpoint) || typeof keys?.p256dh !== 'string' || typeof keys.auth !== 'string') {
    throw new Error('Invalid device subscription.')
  }
  const publicKey = keys.p256dh
  const authentication = keys.auth
  if (!/^[A-Za-z0-9_-]{87}=?$/.test(publicKey) || !/^[A-Za-z0-9_-]{22}={0,2}$/.test(authentication)) {
    throw new Error('Invalid device encryption keys.')
  }
  return { endpoint, keys: { p256dh: publicKey, auth: authentication } }
}

export function validateTopics(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((topic) => !notificationTopics.includes(topic))) {
    throw new Error('Invalid notification preferences.')
  }
  return [...new Set(value)]
}

export async function sameSecret(first: string, second: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [firstHash, secondHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(first)),
    crypto.subtle.digest('SHA-256', encoder.encode(second)),
  ])
  const firstBytes = new Uint8Array(firstHash)
  const secondBytes = new Uint8Array(secondHash)
  let difference = 0
  for (let index = 0; index < firstBytes.length; index++) difference |= firstBytes[index] ^ secondBytes[index]
  return difference === 0
}