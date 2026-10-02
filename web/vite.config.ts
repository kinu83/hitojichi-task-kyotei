import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'icons/*.png', 'icons/*.svg'],
      manifest: {
        id: '/',
        name: '人質タスク協定',
        short_name: 'タスク協定',
        description: '仲間と一緒にタスクを達成するチーム向けタスク管理アプリ',
        lang: 'ja',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#7F60CB',
        background_color: '#F8F7F7',
        icons: [
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        navigateFallback: 'index.html',
        // Firebase Hosting の認証ハンドラーはアプリのHTMLに置き換えない。
        navigateFallbackDenylist: [/^\/__\//, /^\/api\//],
        cleanupOutdatedCaches: true,
        // Firebase / Firestore / Functions のレスポンスはキャッシュしない。
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
