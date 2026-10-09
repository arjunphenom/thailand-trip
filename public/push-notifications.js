const tripRoutes = new Set(['/', '/itinerary', '/money', '/map'])

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
  event.waitUntil(self.registration.showNotification('Thailand Nov 26', {
    body: 'There is a new update in your trip. Open the app to see it.',
    icon: new URL('icon-192.png', scope).href,
    badge: new URL('icon-192.png', scope).href,
    tag: typeof payload.tag === 'string' ? payload.tag.slice(0, 80) : 'trip-update',
    data: { route },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const route = tripRoutes.has(event.notification.data?.route) ? event.notification.data.route : '/'
  const destination = `${self.registration.scope}#${route}`
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
    const existing = windows.find((client) => client.url.startsWith(self.registration.scope))
    if (existing) {
      await existing.navigate(destination)
      await existing.focus()
    } else {
      await self.clients.openWindow(destination)
    }
  }))
})