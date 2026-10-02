import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    selfDestroying: true,
    includeAssets: ['thailand.webp', 'apple-touch-icon.png'],
    manifest: {
      id: base,
      name: 'Thailand Nov 26',
      short_name: 'Thailand Nov 26',
      description: 'The shared checklist and itinerary for our Thailand trip.',
      start_url: base,
      scope: base,
      display: 'standalone',
      theme_color: '#285648',
      background_color: '#f7f7f3',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,woff2,png,webp}'],
      navigateFallback: `${base}index.html`,
      cleanupOutdatedCaches: true,
    },
  })],
})
