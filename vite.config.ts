import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// Served from https://<user>.github.io/peakhour/
export default defineConfig({
  base: '/peakhour/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon.png'],
      manifest: {
        name: 'Peakhour',
        short_name: 'Peakhour',
        description: 'Track focus sessions per project and find your most productive hours.',
        lang: 'de',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f5f4f0',
        theme_color: '#f5f4f0',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
