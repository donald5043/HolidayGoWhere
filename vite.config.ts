import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

import { cloudflare } from "@cloudflare/vite-plugin";

const base = process.env.GITHUB_PAGES === 'true' ? '/HolidayGoWhere/' : '/'

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'map-vendor': ['leaflet', 'react-leaflet'],
        },
      },
    },
  },
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.png', 'favicon.svg'],
    workbox: {
      maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      skipWaiting: true,
      globIgnores: [
        '**/data/*.json',
        '**/places-north-*.js',
        '**/places-central-*.js',
        '**/places-south-*.js',
        '**/places-east-*.js',
        '**/places-islands-*.js',
        '**/restaurants-osm-*.js',
        '**/restaurants-osm-*.json'
      ],
      runtimeCaching: [
        {
          urlPattern: /\/data\/(places|restaurants|health-advisories|medical-facilities|rescue-supplies|webcams).*\.json$/,
          handler: 'StaleWhileRevalidate',
          options: {
            cacheName: 'holiday-public-data',
            expiration: {
              maxEntries: 24,
              maxAgeSeconds: 24 * 60 * 60
            }
          }
        }
      ]
    },
    manifest: {
      name: '假日去哪兒｜親子旅遊地圖',
      short_name: '假日去哪兒',
      description: '幫家長快速找到適合孩子的假日景點',
      theme_color: '#fff8ec',
      background_color: '#fff8ec',
      display: 'standalone',
      start_url: base,
      scope: base,
      icons: [
        {
          src: `${base}pwa-192x192.png`,
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any maskable'
        },
        {
          src: `${base}pwa-512x512.png`,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        }
      ]
    }
  }), cloudflare()]
})
