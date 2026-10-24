// The build stamps both this worker and index.html with the same content ID.
const VERSION = '__BUILD_VERSION__';
const CACHE_NAME = `louvesync-shell-${VERSION}`;
const PRECACHE = __PRECACHE_MANIFEST__;
const appCache = name => /^louvesync-shell-[a-zA-Z0-9._-]+$/.test(name) || /^louvesync-[a-f0-9]{16,64}$/.test(name) || /^louve-v\d+$/.test(name);
const htmlVersion = html => html.match(/<meta\s+name="louvesync-build"\s+content="([a-zA-Z0-9._-]+)"/i)?.[1];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      // Only activate a complete, coherent deployment. Partial installs must not
      // replace the working offline copy with an HTML/asset mixture.
      await Promise.all(PRECACHE.map(async path => {
        const response = await fetch(path, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Precache failed: ${path}`);
        if (path === '/index.html' && htmlVersion(await response.clone().text()) !== VERSION) throw new Error('Deployment is not coherent yet');
        if (/\.(js|css)$/.test(path) && response.headers.get('Content-Type')?.includes('text/html')) throw new Error('Asset returned HTML');
        await cache.put(path, response);
      }));
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});

async function announceUpdate(client) {
  const url = new URL(client.url);
  if (url.origin !== self.location.origin || /^\/api(?:\/|$)/.test(url.pathname) || (url.pathname !== '/index.html' && /\.[^/]+$/.test(url.pathname))) return;
  const supported = await new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => finish(false), 1500);
    function finish(value) { clearTimeout(timer); channel.port1.close(); resolve(value); }
    channel.port1.onmessage = event => finish(event.data?.type === 'LOUVESYNC_CLIENT');
    try { client.postMessage({ type: 'LOUVESYNC_ACTIVATED', version: VERSION }, [channel.port2]); } catch { finish(false); }
  });
  // Older installed shells do not listen for controllerchange. Migrate them
  // once; modern clients manage their own safe reload after saving a draft.
  if (!supported && url.searchParams.get('__ls_build') !== VERSION) {
    url.searchParams.set('__ls_build', VERSION);
    // Do not await our own navigation inside activate: its fetch is queued
    // until activation completes, which would deadlock the legacy migration.
    void client.navigate(url.href).catch(() => {});
  }
}

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = (await caches.keys()).filter(appCache);
    // Keep one previous build for open clients that are finishing an edit and
    // may still need one of their old, content-addressed chunks.
    const previous = keys.filter(key => key !== CACHE_NAME).at(-1);
    await Promise.all(keys.filter(key => key !== CACHE_NAME && key !== previous).map(key => caches.delete(key)));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    await Promise.all(clients.map(announceUpdate));
  })());
});

async function cachedAsset(request) {
  const own = await caches.open(CACHE_NAME);
  const current = await own.match(request);
  if (current) return current;
  const keys = (await caches.keys()).filter(appCache);
  for (const key of keys.reverse()) {
    const value = await (await caches.open(key)).match(request);
    if (value) return value;
  }
  return null;
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Update discovery must hit the server. An offline cached version.json can
  // never establish that the installed shell is the latest published build.
  if (url.pathname === '/version.json' || url.pathname === '/sw.js' || url.pathname === '/sw-push.js' || /^\/api(?:\/|$)/.test(url.pathname)) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }
  const navigation = event.request.mode === 'navigate' || url.pathname === '/index.html';
  event.respondWith((async () => {
    if (url.pathname.startsWith('/assets/')) {
      const asset = await cachedAsset(event.request);
      if (asset) return asset;
    }
    try {
      const response = await fetch(event.request, { cache: 'no-store' });
      if (!response.ok && navigation) throw new Error('Navigation unavailable');
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        if (navigation) {
          if (htmlVersion(await response.clone().text()) === VERSION) await cache.put('/index.html', response.clone());
        } else await cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      if (navigation) return (await (await caches.open(CACHE_NAME)).match('/index.html')) || Response.error();
      return (await cachedAsset(event.request)) || Response.error();
    }
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') event.ports[0]?.postMessage({ version: VERSION });
});
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
