import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-64.png', 'apple-touch-icon.png'],
      // Tanpa ini, service worker TIDAK didaftarkan saat `npm run dev`, dan
      // browser hanya menawarkan pemasangan bila ada service worker aktif —
      // itulah sebabnya tombol "Pasang" tidak pernah muncul selama pengembangan.
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
      },
      workbox: {
        // Versi baru langsung mengambil alih tanpa menunggu semua tab ditutup.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Data keuangan TIDAK PERNAH di-cache. Ini inti keluhan "aplikasi
            // sudah dipasang tapi datanya ketinggalan": service worker
            // menyajikan salinan lama, jadi saldo dan transaksi terlihat basi.
            urlPattern: ({ url }) =>
              url.hostname.endsWith('.supabase.co') ||
              url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'gambar',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      manifest: {
        name: 'DuitKita — Keuangan Pintar',
        short_name: 'DuitKita',
        description: 'Catat pemasukan, pengeluaran, hutang, dan target tabungan dalam satu aplikasi.',
        lang: 'id',
        theme_color: '#09090B',
        background_color: '#09090B',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/dashboard',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          // "maskable" = Android boleh memotongnya jadi bentuk apa pun
          // (bulat, kotak tumpul) tanpa memotong bagian penting ikonnya.
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      }
    })
  ],
  build: {
    // Pisahkan pustaka besar jadi berkas sendiri. Berkas ini jarang berubah,
    // jadi browser bisa menyimpannya di cache dan tidak perlu mengunduh ulang
    // setiap kali kode aplikasi diperbarui.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          charts: ['recharts'],
          motion: ['framer-motion'],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: 5173,
    strictPort: true,
  }
});
