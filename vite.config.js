import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Custom plugin to act as a local CORS proxy, bypassing Cloudflare proxy blocks
const localScraperPlugin = () => ({
  name: 'local-scraper-proxy',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url?.startsWith('/api/scrape?url=')) {
        const targetUrl = new URL(req.url, 'http://localhost').searchParams.get('url');
        if (!targetUrl) {
          res.statusCode = 400;
          return res.end('Missing url');
        }
        try {
          // Fetch directly from Node.js (bypasses CORS and uses local residential IP)
          const fetchRes = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            }
          });
          const text = await fetchRes.text();
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(text);
        } catch (e) {
          res.statusCode = 500;
          res.end(e.toString());
        }
      } else {
        next();
      }
    });
  }
});

import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(), 
    localScraperPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'LouveSync',
        short_name: 'LouveSync',
        description: 'App de Gestão para Ministérios de Louvor',
        theme_color: '#4F46E5',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 }, // 1 week
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }, // 1 year
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
})
