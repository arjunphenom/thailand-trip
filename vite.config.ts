import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    injectRegister: false,
    includeAssets: ['thailand.webp', 'apple-touch-icon.png'],
    manifest: {
      id: base,
      name: 'Thailand Nov 26',
      short_name: 'Thailand Nov 26',
      description: 'The shared checklist and itinerary for our Thailand trip.',
      start_url: base,
      scope: base,
      display: 'standalone',
      lang: 'en',
      categories: ['travel', 'productivity'],
      theme_color: '#285648',
      background_color: '#f7f7f3',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
      shortcuts: [
        { name: 'Money', url: `${base}#/money` },
        { name: 'Map', url: `${base}#/map` },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,woff2,png,webp}'],
      navigateFallback: null,
      importScripts: ['push-notifications.js'],
      clientsClaim: true,
      skipWaiting: false,
      cleanupOutdatedCaches: true,
      runtimeCaching: [{
        urlPattern: ({ request, sameOrigin }) => request.mode === 'navigate' && sameOrigin,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'thailand-trip-pages-v1',
          networkTimeoutSeconds: 4,
          fetchOptions: { cache: 'no-cache' },
          expiration: { maxEntries: 8, maxAgeSeconds: 7 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [200] },
        },
      }],
    },
  })],
})
