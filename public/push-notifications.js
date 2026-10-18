const tripRoutes = new Set(['/', '/itinerary', '/money', '/map'])

const routeMessages = {
  '/': { title: 'Checklist updated', body: 'A task was added or changed. Tap to open the trip.' },
  '/money': { title: 'Money updated', body: 'A new expense or settlement was added. Tap to view.' },
  '/itinerary': { title: 'Itinerary updated', body: 'The day-by-day plan changed. Tap to open.' },
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open('thailand-trip-pages-v1').then((cache) =>
    cache.add(new Request(self.registration.scope, { cache: 'reload' })),
  ).catch(() => {}))
})

self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data?.json() ?? {} } catch { payload = {} }
  const route = tripRoutes.has(payload.route) ? payload.route : '/'
  const scope = self.registration.scope
  // Content is derived only from the trusted route, never from payload text, to keep the lock screen private.
  const preset = routeMessages[route] || routeMessages['/']
  event.waitUntil(self.registration.showNotification(preset.title, {
    body: preset.body,
    icon: new URL('icon-192.png', scope).href,
    badge: new URL('icon-192.png', scope).href,
    tag: typeof payload.tag === 'string' ? payload.tag.slice(0, 80) : 'trip-update',
    data: { route },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const route = tripRoutes.has(event.notification.data?.route) ? event.notification.data.route : '/'
  const scope = self.registration.scope
  const destination = `${scope}#${route}`
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find((client) => client.url.startsWith(scope))
    if (existing) {
      try { await existing.focus() } catch {}
      try { existing.postMessage({ type: 'trip-navigate', route }) } catch {}
      try { if ('navigate' in existing) await existing.navigate(destination) } catch {}
      return
    }
    try { await self.clients.openWindow(destination) } catch {}
  })())
})