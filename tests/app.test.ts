import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { sameSecret, validEndpoint, validateSubscription, validateTopics } from '../supabase/functions/trip-notifications/protocol.ts'

describe('push request validation', () => {
  it('accepts only known HTTPS push providers', () => {
    expect(validEndpoint('https://fcm.googleapis.com/fcm/send/device')).toBe(true)
    expect(validEndpoint('https://web.push.apple.com/device')).toBe(true)
    expect(validEndpoint('https://updates.push.services.mozilla.com/wpush/v2/device')).toBe(true)
    for (const endpoint of ['http://localhost/push', 'https://127.0.0.1/push', 'https://fcm.googleapis.com.attacker.test/push', 'https://fcm.googleapis.com@attacker.test/push', 'https://fcm.googleapis.com:8443/push']) {
      expect(validEndpoint(endpoint)).toBe(false)
    }
  })

  it('requires browser encryption keys and recognized preferences', async () => {
    const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/device', keys: { auth: 'a'.repeat(22), p256dh: 'b'.repeat(87) } }
    expect(validateSubscription(subscription)).toEqual(subscription)
    expect(() => validateSubscription({ ...subscription, keys: {} })).toThrow('Invalid device')
    expect(validateTopics(['tasks', 'tasks', 'money'])).toEqual(['tasks', 'money'])
    expect(() => validateTopics(['locations'])).toThrow('Invalid notification')
    expect(await sameSecret('private invitation', 'private invitation')).toBe(true)
    expect(await sameSecret('private invitation', 'other invitation')).toBe(false)
  })
})

describe('notification worker', () => {
  it('keeps lock-screen content generic and rejects off-app navigation', async () => {
    const listeners = new Map<string, (event: unknown) => void>()
    const notifications: { title: string; options: { body: string; data: { route: string } } }[] = []
    const opened: string[] = []
    const worker = {
      addEventListener: (event: string, handler: (event: unknown) => void) => listeners.set(event, handler),
      registration: {
        scope: 'https://example.test/thailand-trip/',
        showNotification: async (title: string, options: { body: string; data: { route: string } }) => { notifications.push({ title, options }) },
      },
      clients: { matchAll: async () => [], openWindow: async (url: string) => { opened.push(url) } },
    }
    runInNewContext(readFileSync(new URL('../public/push-notifications.js', import.meta.url), 'utf8'), { self: worker, URL, Set })
    let completed = Promise.resolve()
    listeners.get('push')!({ data: { json: () => ({ body: 'Private expense and coordinates', route: 'https://attacker.test', tag: 'event' }) }, waitUntil: (promise: Promise<void>) => { completed = promise } })
    await completed
    expect(notifications[0].options.body).not.toContain('coordinates')
    expect(notifications[0].options.data.route).toBe('/')
    listeners.get('notificationclick')!({ notification: { close() {}, data: { route: '/money' } }, waitUntil: (promise: Promise<void>) => { completed = promise } })
    await completed
    expect(opened).toEqual(['https://example.test/thailand-trip/#/money'])
  })
})