// Build replaces this token with a content hash and precaches hashed app assets.
const CACHE_NAME = 'louvesync-__BUILD_VERSION__';
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/logo_solo.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => /^(louvesync-|louve-v)/.test(key) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (url.pathname.startsWith('/assets/')) {
      const cached = await cache.match(event.request);
      if (cached) return cached;
    }
    try {
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    } catch {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') return (await cache.match('/index.html')) || Response.error();
      return Response.error();
    }
  })());
});
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('push', event => {
  let data;
  try { data = event.data?.json(); } catch { data = { body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(data?.title || 'LouveSync', { body: data?.body || 'Novidades no ministério', icon: '/pwa-192x192.png', data: { url: data?.url || '/' } }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const client = clients[0];
    if (client) { await client.navigate(url.href); return client.focus(); }
    return self.clients.openWindow(url.href);
  }));
});
